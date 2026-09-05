"""Persistent per-user worker subprocess.

This module is the entry point for long-lived worker subprocesses spawned by
WorkerPool. With use_access_flags=True (production, requires root), each
worker setuids to the target user at fork time. Without use_access_flags
the worker runs as the parent process's user. Either way the worker handles
all user-scoped operations: file I/O, cluster jobs, git ops, SSH keys, etc.

Protocol:
    - IPC over a Unix socketpair (fd passed via FGC_WORKER_FD env var)
    - Messages are length-prefixed JSON: 4-byte big-endian length + JSON body
    - Worker reads requests, dispatches to action handlers, writes responses
    - {"action": "shutdown"} triggers a clean exit

The worker runs a synchronous request/response loop.  Cluster operations
that use py-cluster-api's async API are run via _run_async() per-request.

In CLI mode (settings.cli_mode=True), no worker subprocess is spawned;
action handlers are called directly in-process from server.py, so
_run_async() must handle being called from within an existing event loop.
"""

from __future__ import annotations

import asyncio
import ctypes
import ctypes.util
import functools
import json
import logging
import os
import pwd
import socket
import struct
import sys
from pathlib import Path
from typing import Any, Optional

from loguru import logger

from fileglancer.logconf import InterceptHandler, configure_logging


# Length-prefix format: 4-byte big-endian unsigned int
_HEADER_FMT = "!I"
_HEADER_SIZE = struct.calcsize(_HEADER_FMT)


def _run_async(coro):
    """Run an async coroutine, handling both subprocess and in-process contexts.

    In subprocess mode (no running event loop), uses asyncio.run().
    In dev/test mode (called from within FastAPI's event loop), uses
    a new event loop in a thread to avoid "cannot be called from a running loop".
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # No running loop — we're in the subprocess
        return asyncio.run(coro)
    else:
        # Inside an event loop (dev/test mode) — run in a thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()


def _set_pdeathsig():
    """Ask the kernel to send SIGTERM when our parent process dies.

    This prevents orphan workers if the main process is killed without
    a chance to clean up.  Linux-only (PR_SET_PDEATHSIG = 1).
    """
    try:
        import signal
        libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
        PR_SET_PDEATHSIG = 1
        result = libc.prctl(PR_SET_PDEATHSIG, signal.SIGTERM, 0, 0, 0)
        if result != 0:
            logger.warning(f"prctl(PR_SET_PDEATHSIG) failed: errno={ctypes.get_errno()}")
    except Exception as e:
        logger.warning(f"Could not set PR_SET_PDEATHSIG: {e}")


def _send(sock: socket.socket, data: dict):
    """Send a length-prefixed JSON message."""
    payload = json.dumps(data, default=str).encode()
    header = struct.pack(_HEADER_FMT, len(payload))
    sock.sendall(header + payload)


def _send_with_fd(sock: socket.socket, data: dict, fd: int):
    """Send a length-prefixed JSON message with a file descriptor via SCM_RIGHTS."""
    import array as _array

    payload = json.dumps(data, default=str).encode()
    header = struct.pack(_HEADER_FMT, len(payload))
    full_msg = header + payload

    fds = _array.array("i", [fd])
    sock.sendmsg(
        [full_msg],
        [(socket.SOL_SOCKET, socket.SCM_RIGHTS, fds)],
    )


def _recv(sock: socket.socket) -> dict:
    """Receive a length-prefixed JSON message."""
    header = _recvall(sock, _HEADER_SIZE)
    if header is None:
        raise ConnectionError("Parent closed connection")
    (length,) = struct.unpack(_HEADER_FMT, header)
    payload = _recvall(sock, length)
    if payload is None:
        raise ConnectionError("Parent closed connection mid-message")
    return json.loads(payload)


def _recvall(sock: socket.socket, n: int) -> Optional[bytes]:
    """Read exactly n bytes from socket."""
    data = bytearray()
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            return None
        data.extend(chunk)
    return bytes(data)


# ---------------------------------------------------------------------------
# Action registry
# ---------------------------------------------------------------------------

# Populated by @action(name) decorators on each handler.
_ACTIONS: dict[str, Any] = {}

# Actions whose handler needs the file-share-path list, read by the parent
# (worker_pool.prepare_worker_request) to decide what to attach. Derived from
# the decorators rather than hand-listed: a handler that reads the list without
# being registered here would only fail at request time, on whatever path
# happens to exercise it.
ACTIONS_NEEDING_FSPS: set[str] = set()


def action(name: str, needs_fsps: bool = False):
    """Register a handler under the given action name.

    ``needs_fsps`` marks handlers that read request["file_share_paths"]
    directly. Handlers wrapped in @with_filestore are marked automatically.
    """
    def decorator(fn):
        _ACTIONS[name] = fn
        if needs_fsps or getattr(fn, "_needs_fsps", False):
            ACTIONS_NEEDING_FSPS.add(name)
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Parent-provided DB data
# ---------------------------------------------------------------------------
#
# Worker subprocesses run as the (untrusted) target user, so we don't give them
# the database URL — nothing in this module ever opens a session.  Every
# DB-derived value an action needs is serialized into its request by the parent,
# so the worker never initiates anything: the protocol is strictly one request
# in, one response out, with no worker->parent dispatch surface at all.
#
# The file-share-path list is attached centrally by the parent
# (worker_pool.prepare_worker_request), because too many actions need it for the
# dispatching endpoint to be responsible for it.  Anything an endpoint already
# has in hand (job rows) is passed as an ordinary request kwarg at the call site.
# This module holds the two sides of that wire format: the parent-side
# serializer and the worker-side readers below.

from types import SimpleNamespace


def _file_share_paths_from_request(request: dict) -> list:
    """Deserialize parent-provided file-share-path payload."""
    from fileglancer.model import FileSharePath

    try:
        rows = request["file_share_paths"]
    except KeyError as e:
        raise RuntimeError(
            f"Worker request for {request.get('action')} is missing "
            "parent-provided file_share_paths"
        ) from e
    return [FileSharePath(**row) for row in (rows or [])]


def serialize_job_for_worker(j) -> dict:
    """Serialize a JobDB row to a JSON-safe dict for transport to the worker.

    Called by endpoints that already hold the row.  Only includes fields used
    by worker-side handlers (read_job_file, get_service_url,
    delete_job_work_dir) — keep this list minimal so the worker sees as little
    of the DB row as possible.
    """
    return {
        "id": j.id,
        "app_name": j.app_name,
        "entry_point_id": j.entry_point_id,
        "entry_point_type": getattr(j, "entry_point_type", "job"),
        "status": j.status,
        "work_dir": j.work_dir,
        "script_path": getattr(j, "script_path", None),
    }


def _job_from_request(request: dict):
    """Deserialize the caller-provided job payload."""
    try:
        row = request["job"]
    except KeyError as e:
        raise RuntimeError(
            f"Worker request for {request.get('action')} is missing "
            "caller-provided job"
        ) from e
    return SimpleNamespace(**row) if row else None


# ---------------------------------------------------------------------------
# Action handlers — file operations
# ---------------------------------------------------------------------------

# Per-worker cache of verified Filestore instances. Once a mount has been
# successfully verified, we trust it for the lifetime of the worker process —
# workers are short-lived enough (idle eviction) that we don't need to handle
# unmount/remount mid-session.
_filestore_cache: dict[str, Any] = {}

# Per-username cache of supplementary group names. Keyed by username so the
# in-process dev/test path (which serves multiple users from one process)
# stays correct; in subprocess mode there's only ever one entry.
_user_groups_cache: dict[str, list[str]] = {}


def _get_user_groups(username: str) -> list[str]:
    """Return the supplementary group names for a user.

    Uses os.getgrouplist (NSS initgroups) instead of grp.getgrall, which
    enumerates every group on the system and is very slow on LDAP/NIS hosts.
    Result is cached for the lifetime of the process.
    """
    cached = _user_groups_cache.get(username)
    if cached is not None:
        return cached

    import grp as _grp
    pw = pwd.getpwnam(username)
    gids = os.getgrouplist(username, pw.pw_gid)
    names = []
    for gid in gids:
        try:
            names.append(_grp.getgrgid(gid).gr_name)
        except KeyError:
            continue
    _user_groups_cache[username] = names
    return names


def _get_filestore(fsp_name: str, fsps: list):
    """Look up a FileSharePath and return a Filestore instance.

    Returns (filestore, None) on success, or (None, error_response) on failure
    where error_response is a dict ready to be returned from a handler.
    """
    cached = _filestore_cache.get(fsp_name)
    if cached is not None:
        return cached, None

    from fileglancer.filestore import Filestore

    fsp = next((f for f in fsps if f.name == fsp_name), None)
    if fsp is None:
        return None, {
            "error": f"File share path '{fsp_name}' not found",
            "status_code": 404,
        }

    filestore = Filestore(fsp)
    try:
        filestore.get_file_info(None)
    except FileNotFoundError:
        return None, {
            "error": f"File share path '{fsp_name}' is not mounted",
            "status_code": 503,
        }

    _filestore_cache[fsp_name] = filestore
    return filestore, None


def with_filestore(fn):
    """Resolve request["fsp_name"] to a Filestore and pass it as the third arg.

    Also passes the freshly-fetched FSP list as the fourth arg, so handlers
    that need it (for symlink resolution etc.) don't have to fetch again.

    Returns an error response if the filestore can't be resolved (404 for a
    missing fsp, 503 for an unmounted one) so the handler body never has to
    deal with the not-found case.
    """
    @functools.wraps(fn)
    def wrapper(request: dict, ctx: WorkerContext) -> dict:
        fsps = _file_share_paths_from_request(request)
        filestore, error_response = _get_filestore(request["fsp_name"], fsps)
        if filestore is None:
            return error_response
        return fn(request, ctx, filestore, fsps)
    # Read by @action, which is applied outside this decorator.
    wrapper._needs_fsps = True
    return wrapper


def _redirect_or_error(e, fsps):
    """Build a redirect response for a RootCheckError, or fall through to 400."""
    from fileglancer.database import find_fsp_in_paths
    match = find_fsp_in_paths(fsps, e.full_path)
    if match:
        fsp, relative_subpath = match
        return {"redirect": True, "fsp_name": fsp.name, "subpath": relative_subpath or ""}
    return {"error": str(e), "status_code": 400}


@action("list_dir")
@with_filestore
def _action_list_dir(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """List directory contents."""
    subpath = request.get("subpath", "")
    current_user = ctx.username

    from fileglancer.filestore import RootCheckError

    try:
        file_info = filestore.get_file_info(subpath, current_user=current_user, fsps=fsps)
        result = {"info": file_info.model_dump(mode="json")}

        if file_info.is_dir:
            try:
                files = list(filestore.yield_file_infos(subpath, current_user=current_user, fsps=fsps))
                result["files"] = [f.model_dump(mode="json") for f in files]
            except PermissionError:
                result["files"] = []
                result["error"] = "Permission denied when listing directory contents"
                result["status_code"] = 403
            except FileNotFoundError:
                result["files"] = []
                result["error"] = "Directory contents not found"
                result["status_code"] = 404

        return result
    except RootCheckError as e:
        return _redirect_or_error(e, fsps)
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


@action("list_dir_paged")
@with_filestore
def _action_list_dir_paged(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """List directory contents with pagination."""
    subpath = request.get("subpath", "")
    current_user = ctx.username
    limit = request.get("limit", 200)
    cursor = request.get("cursor")
    max_count = request["max_count"]

    from fileglancer.filestore import RootCheckError

    try:
        file_info = filestore.get_file_info(subpath, current_user=current_user, fsps=fsps)
        result = {"info": file_info.model_dump(mode="json")}

        if file_info.is_dir:
            try:
                files, has_more, next_cursor, total_count, is_truncated = filestore.yield_file_infos_paginated(
                    subpath, current_user=current_user, fsps=fsps,
                    limit=limit, cursor=cursor,
                    max_count=max_count,
                )
                result["files"] = [f.model_dump(mode="json") for f in files]
                result["has_more"] = has_more
                result["next_cursor"] = next_cursor
                result["total_count"] = total_count
                result["is_truncated"] = is_truncated
                result["max_count"] = max_count
            except PermissionError:
                result["files"] = []
                result["error"] = "Permission denied when listing directory contents"
                result["status_code"] = 403
            except FileNotFoundError:
                result["files"] = []
                result["error"] = "Directory contents not found"
                result["status_code"] = 404

        return result
    except RootCheckError as e:
        return _redirect_or_error(e, fsps)
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


@action("get_file_info")
@with_filestore
def _action_get_file_info(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Get metadata for a single file or directory."""
    subpath = request.get("subpath", "")

    try:
        file_info = filestore.get_file_info(subpath, current_user=ctx.username, fsps=fsps)
        return {"info": file_info.model_dump(mode="json")}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


@action("check_binary")
@with_filestore
def _action_check_binary(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Check if a file is binary."""
    subpath = request.get("subpath", "")

    try:
        is_binary = filestore.check_is_binary(subpath)
        return {"is_binary": is_binary}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


@action("open_file")
@with_filestore
def _action_open_file(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Open a file and return its metadata + open file descriptor.

    The worker opens the file as the user and passes the fd back to the
    main process via SCM_RIGHTS.  The response includes "_fd" key with the
    fd number — the main loop uses _send_with_fd() for these responses.
    """
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")

    from fileglancer.filestore import RootCheckError
    from fileglancer.utils import guess_content_type

    try:
        file_info = filestore.get_file_info(subpath)
        if file_info.is_dir:
            return {"error": "Cannot download directory content", "status_code": 400}

        file_name = subpath.split('/')[-1] if subpath else ''
        content_type = guess_content_type(file_name)
        full_path = filestore._check_path_in_root(subpath)

        # Open the file — the fd retains user's access rights
        file_handle = open(full_path, 'rb')
        fd = file_handle.fileno()

        return {
            "file_size": file_info.size,
            "last_modified": file_info.last_modified,
            "content_type": content_type,
            "_fd": fd,
            "_file_handle": file_handle,  # kept alive until fd is sent
        }
    except RootCheckError as e:
        return _redirect_or_error(e, fsps)
    except FileNotFoundError:
        return {"error": f"File or directory not found: {fsp_name}/{subpath}", "status_code": 404}
    except PermissionError:
        return {"error": f"Permission denied: {fsp_name}/{subpath}", "status_code": 403}


@action("write_file")
@with_filestore
def _action_write_file(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Open a file for writing (truncating) and return a writable file descriptor.

    Mirrors open_file: the worker opens the file as the user so ownership and
    permissions are the user's, then passes the fd back via SCM_RIGHTS. The main
    process streams the request body into the fd. The "_fd_mode" key tells the
    parent to wrap the received fd for writing rather than reading.

    The parent directory must already exist; create it first via create_dir.
    """
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")
    if_match = request.get("if_match")
    if_unmodified_since = request.get("if_unmodified_since")

    from fileglancer.filestore import RootCheckError
    from fileglancer.utils import make_etag

    if not subpath:
        return {"error": "A file path is required", "status_code": 400}

    def _handle(fh):
        return {
            "_fd": fh.fileno(),
            "_fd_mode": "wb",
            "_file_handle": fh,  # kept alive until fd is sent
        }

    try:
        full_path = filestore._check_path_in_root(subpath)
        if os.path.isdir(full_path):
            return {"error": "Cannot write file content to a directory", "status_code": 400}

        if if_match is not None or if_unmodified_since is not None:
            # Optimistic concurrency: validate the precondition against the real
            # file before destroying anything. Open write-only WITHOUT create or
            # truncate so a failed check leaves the file untouched, then truncate
            # only once the check passes (race-tight — the fd is the exact inode
            # we validated).
            try:
                fd = os.open(full_path, os.O_WRONLY)
            except FileNotFoundError:
                if if_match is not None:
                    # If-Match (incl. "*") needs an existing version to match.
                    return {"error": "Precondition failed: file does not exist", "status_code": 412}
                # Only If-Unmodified-Since on a missing file → treat as a create.
                return _handle(open(full_path, 'wb'))

            st = os.fstat(fd)
            current_etag = make_etag(st.st_mtime, st.st_size)
            stale = (
                (if_match is not None and if_match != '*' and if_match != current_etag)
                # If-Unmodified-Since is second-granularity by HTTP spec.
                or (if_unmodified_since is not None and int(st.st_mtime) > int(if_unmodified_since))
            )
            if stale:
                os.close(fd)
                return {"error": "Precondition failed: file has changed since it was read",
                        "status_code": 412}
            os.ftruncate(fd, 0)
            return _handle(os.fdopen(fd, 'wb'))

        # No precondition — create the file as the user if absent, or replace
        # existing contents while preserving ownership.
        return _handle(open(full_path, 'wb'))
    except RootCheckError as e:
        return _redirect_or_error(e, fsps)
    except IsADirectoryError:
        return {"error": "Cannot write file content to a directory", "status_code": 400}
    except FileNotFoundError:
        return {"error": f"Parent directory does not exist: {fsp_name}/{subpath}", "status_code": 404}
    except PermissionError:
        return {"error": f"Permission denied: {fsp_name}/{subpath}", "status_code": 403}


@action("head_file")
@with_filestore
def _action_head_file(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Get file metadata and binary check for HEAD requests."""
    subpath = request.get("subpath", "")

    from fileglancer.filestore import RootCheckError
    from fileglancer.utils import guess_content_type

    try:
        file_info = filestore.get_file_info(subpath, current_user=ctx.username)
        file_name = subpath.split('/')[-1] if subpath else ''
        content_type = guess_content_type(file_name)
        is_binary = filestore.check_is_binary(subpath) if not file_info.is_dir else False

        return {
            "info": file_info.model_dump(mode="json"),
            "content_type": content_type,
            "is_binary": is_binary,
        }
    except RootCheckError as e:
        return _redirect_or_error(e, fsps)
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


@action("create_dir")
@with_filestore
def _action_create_dir(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Create a directory."""
    subpath = request["subpath"]

    try:
        filestore.create_dir(subpath)
        return {"ok": True}
    except FileExistsError:
        return {"error": "A file or directory with this name already exists", "status_code": 409}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}


@action("create_file")
@with_filestore
def _action_create_file(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Create an empty file."""
    subpath = request["subpath"]

    try:
        filestore.create_empty_file(subpath)
        return {"ok": True}
    except FileExistsError:
        return {"error": "A file or directory with this name already exists", "status_code": 409}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}


@action("rename")
@with_filestore
def _action_rename(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Rename a file or directory."""
    old_path = request["old_path"]
    new_path = request["new_path"]

    try:
        filestore.rename_file_or_dir(old_path, new_path)
        return {"ok": True}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


@action("delete")
@with_filestore
def _action_delete(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Delete a file or directory."""
    subpath = request["subpath"]

    try:
        filestore.remove_file_or_dir(subpath)
        return {"ok": True}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


@action("chmod")
@with_filestore
def _action_chmod(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Change file permissions."""
    subpath = request["subpath"]
    permissions = request["permissions"]

    try:
        filestore.change_file_permissions(subpath, permissions)
        return {"ok": True}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


@action("update_file")
@with_filestore
def _action_update_file(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Handle rename and/or permission change on a file."""
    subpath = request.get("subpath", "")
    new_path = request.get("new_path")
    new_permissions = request.get("new_permissions")

    try:
        old_file_info = filestore.get_file_info(subpath, ctx.username)
        result = {"info": old_file_info.model_dump(mode="json")}

        if new_permissions is not None and new_permissions != old_file_info.permissions:
            filestore.change_file_permissions(subpath, new_permissions)

        if new_path is not None and new_path != old_file_info.path:
            filestore.rename_file_or_dir(old_file_info.path, new_path)

        result["ok"] = True
        return result
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


@action("validate_paths", needs_fsps=True)
def _action_validate_paths(request: dict, ctx: WorkerContext) -> dict:
    """Validate file/directory paths for app parameters."""
    from fileglancer.apps.command import validate_path_in_filestore

    paths = request["paths"]
    # Keys whose path may not exist yet (exists=false params) are checked for
    # file-share containment only — these are outputs the job creates
    # (directories are created by Fileglancer at submit time), so a
    # missing-but-in-share path is valid here.
    may_be_missing = set(request.get("may_be_missing") or [])
    # Expected type per key ('file' or 'directory'): when the path exists, its
    # type must match.
    types = request.get("types") or {}
    fsps = _file_share_paths_from_request(request)
    errors = {}
    for param_key, path_value in paths.items():
        error = validate_path_in_filestore(
            path_value, fsps, check_access=param_key not in may_be_missing,
            expected_type=types.get(param_key)
        )
        if error:
            errors[param_key] = error
    return {"errors": errors}


@action("create_dirs", needs_fsps=True)
def _action_create_dirs(request: dict, ctx: WorkerContext) -> dict:
    """Create directories for app params with exists=false.

    Runs as the target user in the setuid worker. Each path is expanded ('~'
    resolves to this user's home), confirmed to be within an allowed file share
    (containment only — the directory need not exist yet), and only then created
    with exist_ok=True. Never creates anything outside a file share. Best-effort:
    per-path failures are returned in {"errors": {index: message}} rather than
    aborting the batch.
    """
    from fileglancer.apps.command import validate_path_in_filestore

    paths = request["paths"]
    fsps = _file_share_paths_from_request(request)
    errors = {}
    for key, path_value in paths.items():
        # Containment check without the exists/readable check — the directory is
        # about to be created, so it legitimately may not exist yet.
        error = validate_path_in_filestore(path_value, fsps, check_access=False)
        if error:
            errors[key] = error
            continue
        expanded = os.path.expanduser(path_value.replace("\\", "/"))
        try:
            os.makedirs(expanded, exist_ok=True)
        except OSError as e:
            errors[key] = str(e)
    return {"errors": errors}


@action("get_profile", needs_fsps=True)
def _action_get_profile(request: dict, ctx: WorkerContext) -> dict:
    """Get user profile information."""
    username = ctx.username
    paths = _file_share_paths_from_request(request)

    home_fsp = next((fsp for fsp in paths if fsp.mount_path in ('~', '~/')), None)
    if home_fsp:
        home_directory_name = "."
    else:
        home_directory_path = os.path.expanduser(f"~{username}")
        home_parent = os.path.dirname(home_directory_path)
        home_fsp = next((fsp for fsp in paths if fsp.mount_path == home_parent), None)
        home_directory_name = os.path.basename(home_directory_path)

    home_fsp_name = home_fsp.name if home_fsp else None

    user_groups = []
    try:
        user_groups = _get_user_groups(username)
    except Exception as e:
        logger.error(f"Error getting groups for user {username}: {e}")

    return {
        "username": username,
        "homeFileSharePathName": home_fsp_name,
        "homeDirectoryName": home_directory_name,
        "groups": user_groups,
    }


# ---------------------------------------------------------------------------
# Action handlers — SSH keys
# ---------------------------------------------------------------------------

@action("list_ssh_keys")
def _action_list_ssh_keys(request: dict, ctx: WorkerContext) -> dict:
    """List SSH keys."""
    from fileglancer import sshkeys
    try:
        ssh_dir = sshkeys.get_ssh_directory()
        keys = sshkeys.list_ssh_keys(ssh_dir)
        return {"keys": [k.model_dump() for k in keys]}
    except Exception as e:
        return {"error": str(e), "status_code": 500}


@action("generate_ssh_key")
def _action_generate_ssh_key(request: dict, ctx: WorkerContext) -> dict:
    """Generate a temporary SSH key and authorize it."""
    from fileglancer import sshkeys
    try:
        ssh_dir = sshkeys.get_ssh_directory()
        passphrase = request.get("passphrase")
        result = sshkeys.generate_temp_key_and_authorize(ssh_dir, passphrase)
        # TempKeyResponse is a Response object; extract the data we need
        return {
            "private_key": result.body.decode() if hasattr(result, 'body') else str(result),
            "fingerprint": result.headers.get("X-SSH-Key-Fingerprint", "") if hasattr(result, 'headers') else "",
            "comment": result.headers.get("X-SSH-Key-Comment", "") if hasattr(result, 'headers') else "",
        }
    except Exception as e:
        return {"error": str(e), "status_code": 500}


# ---------------------------------------------------------------------------
# Action handlers — job files
# ---------------------------------------------------------------------------

@action("get_job_file")
def _action_get_job_file(request: dict, ctx: WorkerContext) -> dict:
    """Read job file content (script, stdout, stderr)."""
    from fileglancer.apps.jobfiles import read_job_file
    job_id = request["job_id"]
    file_type = request["file_type"]

    db_job = _job_from_request(request)
    if db_job is None:
        return {"error": f"Job {job_id} not found", "status_code": 404}

    content = read_job_file(db_job, file_type)
    if content is None:
        return {"content": None}
    return {"content": content}


@action("delete_job_work_dir")
def _action_delete_job_work_dir(request: dict, ctx: WorkerContext) -> dict:
    """Delete a terminal job's work directory as the target user."""
    from fileglancer import database as db
    from fileglancer.apps.jobfiles import delete_job_work_dir

    job_id = request["job_id"]
    db_job = _job_from_request(request)
    if db_job is None:
        return {"error": f"Job {job_id} not found", "status_code": 404}
    if not db.is_terminal_job_status(db_job.status):
        return {
            "error": "Job is active; cancel or stop it before deleting.",
            "status_code": 409,
        }

    try:
        deleted = delete_job_work_dir(db_job)
        return {"ok": True, "work_dir_deleted": deleted}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


@action("get_service_url")
def _action_get_service_url(request: dict, ctx: WorkerContext) -> dict:
    """Read the service URL and startup phase from a job's work directory."""
    from fileglancer.apps.jobfiles import get_service_url, get_service_phase

    job_id = request["job_id"]
    db_job = _job_from_request(request)
    if db_job is None:
        return {"error": f"Job {job_id} not found", "status_code": 404}
    return {"service_url": get_service_url(db_job), "phase": get_service_phase(db_job)}


# ---------------------------------------------------------------------------
# Action handlers — S3 proxy
# ---------------------------------------------------------------------------

@action("s3_list_objects")
def _action_s3_list_objects(request: dict, ctx: WorkerContext) -> dict:
    """S3-compatible list objects."""
    from x2s3.client_file import FileProxyClient

    mount_path = request["mount_path"]
    target_name = request["target_name"]
    buffer_size = request.get("buffer_size", 256 * 1024)

    client = FileProxyClient(
        proxy_kwargs={"target_name": target_name},
        path=mount_path,
        buffer_size=buffer_size,
        # Key segments the client sees that have no counterpart on disk
        virtual_prefix=request.get("virtual_prefix"),
    )

    # list_objects_v2 is async def but does only sync I/O
    result = _run_async(client.list_objects_v2(
        continuation_token=request.get("continuation_token"),
        delimiter=request.get("delimiter"),
        encoding_type=request.get("encoding_type"),
        fetch_owner=request.get("fetch_owner"),
        max_keys=request.get("max_keys", 1000),
        prefix=request.get("prefix"),
        start_after=request.get("start_after"),
    ))
    # Result is a fastapi Response object
    return {"body": result.body.decode(), "media_type": result.media_type, "status_code": result.status_code}


@action("s3_head_object")
def _action_s3_head_object(request: dict, ctx: WorkerContext) -> dict:
    """S3-compatible head object."""
    from x2s3.client_file import FileProxyClient

    mount_path = request["mount_path"]
    target_name = request["target_name"]
    path = request["path"]

    client = FileProxyClient(
        proxy_kwargs={"target_name": target_name},
        path=mount_path,
    )

    result = _run_async(client.head_object(path))
    headers = dict(result.headers) if hasattr(result, 'headers') else {}
    return {"headers": headers, "status_code": result.status_code}


@action("s3_open_object")
def _action_s3_open_object(request: dict, ctx: WorkerContext) -> dict:
    """S3-compatible open object — open the file and pass the fd back.

    The worker opens the file as the user via FileProxyClient.open_object(),
    then passes the file descriptor to the main process via SCM_RIGHTS.
    The main process wraps it in a StreamingResponse.
    """
    from x2s3.client_file import FileProxyClient, FileObjectHandle

    mount_path = request["mount_path"]
    target_name = request["target_name"]
    path = request["path"]
    range_header = request.get("range_header")

    client = FileProxyClient(
        proxy_kwargs={"target_name": target_name},
        path=mount_path,
        buffer_size=request.get("buffer_size", 256 * 1024),
    )

    result = _run_async(client.open_object(path, range_header))

    if isinstance(result, FileObjectHandle):
        # Keep the file handle alive and pass the fd
        fd = result.file_handle.fileno()
        response = {
            "type": "handle",
            "status_code": result.status_code,
            "headers": result.headers,
            "media_type": result.media_type,
            "content_length": result.content_length,
            "key": result.key,
            "target_name": result.target_name,
            "start": result.start,
            "end": result.end,
            "_fd": fd,
            "_file_handle": result.file_handle,  # kept alive until fd is sent
        }
        # Don't close the handle — the fd needs to survive transfer
        # The main process will close it after streaming
        return response
    else:
        # Error response
        return {
            "type": "error_response",
            "body": result.body.decode() if hasattr(result, 'body') else "",
            "status_code": result.status_code,
            "headers": dict(result.headers) if hasattr(result, 'headers') else {},
        }


# ---------------------------------------------------------------------------
# Action handlers — proxied path validation
# ---------------------------------------------------------------------------

@action("validate_proxied_path")
@with_filestore
def _action_validate_proxied_path(request: dict, ctx: WorkerContext, filestore, fsps) -> dict:
    """Validate that the user can access a proxied path.

    Runs within the user's context (the worker IS the user), so
    filesystem permission checks just work.
    """
    path = request["path"]

    try:
        filestore.get_file_info(path)
    except (FileNotFoundError, PermissionError) as e:
        return {"error": str(e), "status_code": 400}

    return {"ok": True}


# ---------------------------------------------------------------------------
# Action handlers — cluster operations
# ---------------------------------------------------------------------------

def _get_executor(request: dict):
    """Build a py-cluster-api executor from request['cluster_config']."""
    from cluster_api import create_executor

    config = {k: v for k, v in request["cluster_config"].items() if k != "extra_args"}
    return create_executor(**config)


@action("submit", needs_fsps=True)
def _action_submit(request: dict, ctx: WorkerContext) -> dict:
    """Create work dir, symlink repo, submit job via py-cluster-api."""
    from cluster_api import ResourceSpec
    from fileglancer.apps.jobfiles import ensure_private_dir

    executor = _get_executor(request)

    # Parsed up front: a missing payload must fail before the job is submitted,
    # since raising afterwards would lose the job id.
    fsps = _file_share_paths_from_request(request)

    work_dir = Path(request["work_dir"])
    ensure_private_dir(work_dir)

    cached_repo_dir = request["cached_repo_dir"]
    repo_link = work_dir / "repo"
    if repo_link.is_symlink() or repo_link.exists():
        repo_link.unlink()
    repo_link.symlink_to(cached_repo_dir)

    res = request["resources"]
    resource_spec = ResourceSpec(
        cpus=res.get("cpus"),
        gpus=res.get("gpus"),
        memory=res.get("memory"),
        walltime=res.get("walltime"),
        queue=res.get("queue"),
        work_dir=res["work_dir"],
        stdout_path=res.get("stdout_path"),
        stderr_path=res.get("stderr_path"),
        extra_directives=res.get("extra_directives"),
        extra_args=res.get("extra_args"),
    )

    job = _run_async(executor.submit(
        command=request["command"],
        name=request["job_name"],
        resources=resource_spec,
        # The job's environment is constructed, never inherited from this
        # worker process (whose env is itself allowlisted — see
        # worker_pool._build_worker_env). The script exports everything the
        # job needs; login_shell additionally lets the user's own profile
        # build PATH/modules/conda, like an SSH session would.
        inherit_env=False,
        login_shell=request.get("login_shell", True),
    ))

    # For LocalExecutor, persist the subprocess PID so the parent's poll
    # loop can check liveness across calls. HPC executors don't have
    # _processes and don't need this.
    processes = getattr(executor, "_processes", None)
    if processes is not None:
        proc = processes.get(job.job_id)
        if proc is not None:
            (work_dir / "job.pid").write_text(str(proc.pid))

    # Resolve the work dir's browse-link base now, in user context where the
    # mounts are warm, so the job-detail endpoint can build browse links from
    # the DB without realpath'ing every mount on each read.
    work_dir_fsp_name = None
    work_dir_subpath = None
    try:
        from fileglancer.database import find_fsp_in_paths
        match = find_fsp_in_paths(fsps, str(work_dir))
        if match:
            work_dir_fsp_name = match[0].name
            work_dir_subpath = match[1]
    except Exception as e:
        # The job is already running: a stale mount under realpath() must not
        # cost us the job id. Browse links just stay unresolved.
        logger.warning(f"Could not resolve a browse-link base for {work_dir}: {e}")

    return {
        "job_id": job.job_id,
        "script_path": job.script_path,
        "work_dir_fsp_name": work_dir_fsp_name,
        "work_dir_subpath": work_dir_subpath,
    }


@action("cancel")
def _action_cancel(request: dict, ctx: WorkerContext) -> dict:
    """Cancel a cluster job via py-cluster-api.

    done=True asks the scheduler to mark the job DONE instead of killed
    (LSF: bkill -d); it is ignored by executors without that notion.
    """
    executor = _get_executor(request)
    _run_async(executor.cancel(request["job_id"], done=request.get("done", False)))
    return {"status": "ok"}


@action("poll")
def _action_poll(request: dict, ctx: WorkerContext) -> dict:
    """Poll job statuses via py-cluster-api."""
    from cluster_api import JobStatus

    executor = _get_executor(request)

    known_statuses = request.get("job_statuses", {})
    for cid in request["cluster_job_ids"]:
        db_status = known_statuses.get(cid, "PENDING").lower()
        try:
            seed_status = JobStatus(db_status)
        except ValueError:
            seed_status = JobStatus.PENDING
        executor.track(cid, status=seed_status)

    _run_async(executor.poll())

    jobs = {}
    for cid, record in executor.jobs.items():
        jobs[cid] = {
            "status": record.status.value,
            "exit_code": record.exit_code,
            "exec_host": record.exec_host,
            "start_time": record.start_time.isoformat() if record.start_time else None,
            "finish_time": record.finish_time.isoformat() if record.finish_time else None,
        }

    return {"jobs": jobs}


@action("reconnect")
def _action_reconnect(request: dict, ctx: WorkerContext) -> dict:
    """Reconnect to existing jobs via py-cluster-api."""
    executor = _get_executor(request)
    reconnected = _run_async(executor.reconnect())

    jobs = {}
    for record in reconnected:
        jobs[record.job_id] = {
            "status": record.status.value,
            "name": record.name,
            "exit_code": record.exit_code,
            "exec_host": record.exec_host,
            "start_time": record.start_time.isoformat() if record.start_time else None,
            "finish_time": record.finish_time.isoformat() if record.finish_time else None,
        }

    return {"jobs": jobs}


# ---------------------------------------------------------------------------
# Action handlers — git/manifest operations
# ---------------------------------------------------------------------------

@action("ensure_repo")
def _action_ensure_repo(request: dict, ctx: WorkerContext) -> dict:
    """Clone or update a GitHub repo in the current user's cache."""
    from fileglancer.apps.manifest import _ensure_repo_cache
    repo_dir = _run_async(_ensure_repo_cache(
        url=request["url"],
        pull=request.get("pull", False),
    ))
    return {"repo_dir": str(repo_dir)}


@action("discover_manifests")
def _action_discover_manifests(request: dict, ctx: WorkerContext) -> dict:
    """Clone/pull repo and discover all manifests.

    Resolves the default branch here, in the user's worker, so a private repo's
    real default (reachable via the user's SSH key) is used rather than the
    server process's "main" fallback. Also reports the tip commit so apps added
    from this discovery can be pinned to it.
    """
    from fileglancer.apps.manifest import (
        _ensure_repo_cache,
        _find_manifests_in_repo,
        _git_head_sha,
        _parse_github_url,
        _repo_cache_base,
    )
    repo_dir = _run_async(_ensure_repo_cache(
        url=request["url"],
        pull=True,
    ))
    owner, repo, _ = _parse_github_url(request["url"])
    branch = repo_dir.relative_to(
        (_repo_cache_base() / owner / repo).resolve()
    ).as_posix()
    head_sha = _run_async(_git_head_sha(repo_dir))
    results = _find_manifests_in_repo(repo_dir)
    return {
        "branch": branch,
        "head_sha": head_sha,
        "manifests": [
            {"path": path, "manifest": manifest.model_dump(mode="json")}
            for path, manifest in results
        ],
    }


@action("read_manifest")
def _action_read_manifest(request: dict, ctx: WorkerContext) -> dict:
    """Fetch and read a single manifest from a cached repo.

    With "sha", reads from the immutable snapshot of that commit (materializing
    it if needed) instead of the mutable branch clone.
    """
    from fileglancer.apps.manifest import (
        _ensure_repo_cache,
        _read_manifest_file,
        _safe_repo_subdir,
        ensure_repo_snapshot,
    )
    sha = request.get("sha")
    if sha:
        repo_dir, _ = _run_async(ensure_repo_snapshot(url=request["url"], sha=sha))
    else:
        repo_dir = _run_async(_ensure_repo_cache(
            url=request["url"],
            pull=request.get("pull", False),
        ))
    manifest_path = request.get("manifest_path", "")
    target_dir = _safe_repo_subdir(repo_dir, manifest_path)
    manifest = _read_manifest_file(target_dir)
    return {"manifest": manifest.model_dump(mode="json")}


@action("ensure_snapshot")
def _action_ensure_snapshot(request: dict, ctx: WorkerContext) -> dict:
    """Materialize (or find) the immutable snapshot of a repo at a commit."""
    from fileglancer.apps.manifest import ensure_repo_snapshot
    snapshot_dir, sha = _run_async(ensure_repo_snapshot(
        url=request["url"],
        sha=request.get("sha"),
        pull=request.get("pull", False),
    ))
    return {"snapshot_dir": str(snapshot_dir), "sha": sha}


@action("gc_snapshots")
def _action_gc_snapshots(request: dict, ctx: WorkerContext) -> dict:
    """Remove snapshots of a repo that no app or active job references."""
    from fileglancer.apps.manifest import gc_repo_snapshots
    removed = _run_async(gc_repo_snapshots(
        url=request["url"],
        keep_shas=request.get("keep_shas") or [],
    ))
    return {"removed": removed}


@action("remote_heads")
def _action_remote_heads(request: dict, ctx: WorkerContext) -> dict:
    """Resolve remote tip commits for stored app URLs (batched: the lookups
    run concurrently so one slow remote doesn't multiply worker occupancy)."""
    from fileglancer.apps.manifest import get_remote_heads
    return {"shas": _run_async(get_remote_heads(request.get("urls") or []))}


# ---------------------------------------------------------------------------
# Worker context and main loop
# ---------------------------------------------------------------------------

class WorkerContext:
    """Holds per-worker state."""

    def __init__(self, username: str):
        self.username = username


def main():
    """Worker entry point — run the request/response loop."""

    # Set up orphan prevention
    _set_pdeathsig()

    # Configure logging. In text mode this goes to stderr, which the parent
    # forwards into its own log tagged with the worker's username. In JSON
    # mode it goes to the inherited stdout instead, so each record reaches the
    # shipper as the complete JSON object the worker wrote, rather than being
    # buried inside the parent's message string.
    log_level = os.environ.get("FGC_LOG_LEVEL", "INFO").upper()
    log_format = os.environ.get("FGC_LOG_FORMAT", "text")
    configure_logging(log_level, log_format)

    # Route stdlib logging (used by cluster_api) into loguru so a
    # single configuration controls levels and formatting, and
    # loguru-only levels like TRACE/SUCCESS work without translation.
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Get the socket fd from environment
    fd = int(os.environ["FGC_WORKER_FD"])
    sock = socket.fromfd(fd, socket.AF_UNIX, socket.SOCK_STREAM)
    os.close(fd)  # close the original fd, we have a dup now

    # Determine username
    uid = os.getuid()
    try:
        username = pwd.getpwuid(uid).pw_name
    except KeyError:
        username = str(uid)

    # Worker subprocess never gets DB credentials.  Any DB-derived data needed
    # by an action arrives already serialized in that action's request.
    ctx = WorkerContext(username=username)

    logger.info(
        f"Worker started for {username} "
        f"(uid={uid} euid={os.geteuid()} pid={os.getpid()})"
    )

    # Main request/response loop
    while True:
        try:
            request = _recv(sock)
        except ConnectionError:
            logger.info("Parent connection closed, exiting")
            break

        action = request.get("action")

        if action == "shutdown":
            logger.info(f"Shutdown requested, exiting")
            break

        handler = _ACTIONS.get(action)
        if handler is None:
            _send(sock, {"error": f"Unknown action: {action}"})
            continue

        try:
            result = handler(request, ctx)

            # If the result contains a file descriptor, send it via SCM_RIGHTS
            fd = result.pop("_fd", None)
            file_handle = result.pop("_file_handle", None)
            if fd is not None:
                _send_with_fd(sock, result, fd)
                # Close our copy of the fd — the main process has its own now
                if file_handle is not None:
                    file_handle.close()
            else:
                _send(sock, result)
        except Exception as e:
            logger.exception(f"Error handling action {action}")
            _send(sock, {"error": str(e)})

    sock.close()
    logger.info("Worker exiting")


if __name__ == "__main__":
    main()
