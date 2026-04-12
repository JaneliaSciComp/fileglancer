"""Persistent per-user worker subprocess.

This module is the entry point for long-lived worker subprocesses spawned by
WorkerPool.  Each worker runs as a single user (identity set at fork time)
and handles all user-scoped operations: file I/O, cluster jobs, git ops,
SSH key management, etc.

Protocol:
    - IPC over a Unix socketpair (fd passed via FGC_WORKER_FD env var)
    - Messages are length-prefixed JSON: 4-byte big-endian length + JSON body
    - Worker reads requests, dispatches to action handlers, writes responses
    - {"action": "shutdown"} triggers a clean exit

The worker runs a synchronous request/response loop.  Cluster operations
that use py-cluster-api's async API are run via _run_async() per-request.

In dev/test mode (use_access_flags=False), action handlers are called
directly in-process from server.py, so _run_async() must handle being
called from within an existing event loop.
"""

from __future__ import annotations

import asyncio
import ctypes
import ctypes.util
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
# Action handlers — file operations
# ---------------------------------------------------------------------------

def _get_filestore(fsp_name: str, db_url: str):
    """Look up a FileSharePath and return a Filestore instance."""
    from fileglancer import database as db
    from fileglancer.filestore import Filestore

    with db.get_db_session(db_url) as session:
        fsp = db.get_file_share_path(session, fsp_name)
        if fsp is None:
            return None, f"File share path '{fsp_name}' not found"

    filestore = Filestore(fsp)
    try:
        filestore.get_file_info(None)
    except FileNotFoundError:
        return None, f"File share path '{fsp_name}' is not mounted"

    return filestore, None


def _action_list_dir(request: dict, ctx: WorkerContext) -> dict:
    """List directory contents."""
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")
    current_user = ctx.username

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error, "status_code": 404 if "not found" in error else 500}

    from fileglancer import database as db
    from fileglancer.filestore import RootCheckError

    try:
        with db.get_db_session(ctx.db_url) as session:
            file_info = filestore.get_file_info(subpath, current_user=current_user, session=session)
            result = {"info": json.loads(file_info.model_dump_json())}

            if file_info.is_dir:
                try:
                    files = list(filestore.yield_file_infos(subpath, current_user=current_user, session=session))
                    result["files"] = [json.loads(f.model_dump_json()) for f in files]
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
        # Path escapes root — check if it belongs to another file share
        with db.get_db_session(ctx.db_url) as session:
            match = db.find_fsp_from_absolute_path(session, e.full_path)
        if match:
            fsp, relative_subpath = match
            return {"redirect": True, "fsp_name": fsp.name, "subpath": relative_subpath or ""}
        return {"error": str(e), "status_code": 400}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


def _action_list_dir_paged(request: dict, ctx: WorkerContext) -> dict:
    """List directory contents with pagination."""
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")
    current_user = ctx.username
    limit = request.get("limit", 200)
    cursor = request.get("cursor")

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error, "status_code": 404 if "not found" in error else 500}

    from fileglancer import database as db
    from fileglancer.filestore import RootCheckError

    try:
        with db.get_db_session(ctx.db_url) as session:
            file_info = filestore.get_file_info(subpath, current_user=current_user, session=session)
            result = {"info": json.loads(file_info.model_dump_json())}

            if file_info.is_dir:
                try:
                    files, has_more, next_cursor, total_count = filestore.yield_file_infos_paginated(
                        subpath, current_user=current_user, session=session,
                        limit=limit, cursor=cursor
                    )
                    result["files"] = [json.loads(f.model_dump_json()) for f in files]
                    result["has_more"] = has_more
                    result["next_cursor"] = next_cursor
                    result["total_count"] = total_count
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
        with db.get_db_session(ctx.db_url) as session:
            match = db.find_fsp_from_absolute_path(session, e.full_path)
        if match:
            fsp, relative_subpath = match
            return {"redirect": True, "fsp_name": fsp.name, "subpath": relative_subpath or ""}
        return {"error": str(e), "status_code": 400}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


def _action_get_file_info(request: dict, ctx: WorkerContext) -> dict:
    """Get metadata for a single file or directory."""
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error, "status_code": 404 if "not found" in error else 500}

    from fileglancer import database as db

    try:
        with db.get_db_session(ctx.db_url) as session:
            file_info = filestore.get_file_info(subpath, current_user=ctx.username, session=session)
            return {"info": json.loads(file_info.model_dump_json())}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


def _action_check_binary(request: dict, ctx: WorkerContext) -> dict:
    """Check if a file is binary."""
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error, "status_code": 404 if "not found" in error else 500}

    try:
        is_binary = filestore.check_is_binary(subpath)
        return {"is_binary": is_binary}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


def _action_open_file(request: dict, ctx: WorkerContext) -> dict:
    """Open a file and return its metadata + open file descriptor.

    The worker opens the file as the user and passes the fd back to the
    main process via SCM_RIGHTS.  The response includes "_fd" key with the
    fd number — the main loop uses _send_with_fd() for these responses.
    """
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

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
            "content_type": content_type,
            "_fd": fd,
            "_file_handle": file_handle,  # kept alive until fd is sent
        }
    except RootCheckError as e:
        from fileglancer import database as db
        with db.get_db_session(ctx.db_url) as session:
            match = db.find_fsp_from_absolute_path(session, e.full_path)
        if match:
            fsp, relative_subpath = match
            return {"redirect": True, "fsp_name": fsp.name, "subpath": relative_subpath or ""}
        return {"error": str(e), "status_code": 400}
    except FileNotFoundError:
        return {"error": f"File or directory not found: {fsp_name}/{subpath}", "status_code": 404}
    except PermissionError:
        return {"error": f"Permission denied: {fsp_name}/{subpath}", "status_code": 403}


def _action_head_file(request: dict, ctx: WorkerContext) -> dict:
    """Get file metadata and binary check for HEAD requests."""
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    from fileglancer.filestore import RootCheckError
    from fileglancer.utils import guess_content_type

    try:
        file_info = filestore.get_file_info(subpath, current_user=ctx.username)
        file_name = subpath.split('/')[-1] if subpath else ''
        content_type = guess_content_type(file_name)
        is_binary = filestore.check_is_binary(subpath) if not file_info.is_dir else False

        return {
            "info": json.loads(file_info.model_dump_json()),
            "content_type": content_type,
            "is_binary": is_binary,
        }
    except RootCheckError as e:
        from fileglancer import database as db
        with db.get_db_session(ctx.db_url) as session:
            match = db.find_fsp_from_absolute_path(session, e.full_path)
        if match:
            fsp, relative_subpath = match
            return {"redirect": True, "fsp_name": fsp.name, "subpath": relative_subpath or ""}
        return {"error": str(e), "status_code": 400}
    except FileNotFoundError:
        return {"error": "File or directory not found", "status_code": 404}
    except PermissionError:
        return {"error": "Permission denied", "status_code": 403}


def _action_create_dir(request: dict, ctx: WorkerContext) -> dict:
    """Create a directory."""
    fsp_name = request["fsp_name"]
    subpath = request["subpath"]

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        filestore.create_dir(subpath)
        return {"ok": True}
    except FileExistsError:
        return {"error": "A file or directory with this name already exists", "status_code": 409}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}


def _action_create_file(request: dict, ctx: WorkerContext) -> dict:
    """Create an empty file."""
    fsp_name = request["fsp_name"]
    subpath = request["subpath"]

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        filestore.create_empty_file(subpath)
        return {"ok": True}
    except FileExistsError:
        return {"error": "A file or directory with this name already exists", "status_code": 409}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}


def _action_rename(request: dict, ctx: WorkerContext) -> dict:
    """Rename a file or directory."""
    fsp_name = request["fsp_name"]
    old_path = request["old_path"]
    new_path = request["new_path"]

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        filestore.rename_file_or_dir(old_path, new_path)
        return {"ok": True}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


def _action_delete(request: dict, ctx: WorkerContext) -> dict:
    """Delete a file or directory."""
    fsp_name = request["fsp_name"]
    subpath = request["subpath"]

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        filestore.remove_file_or_dir(subpath)
        return {"ok": True}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


def _action_chmod(request: dict, ctx: WorkerContext) -> dict:
    """Change file permissions."""
    fsp_name = request["fsp_name"]
    subpath = request["subpath"]
    permissions = request["permissions"]

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        filestore.change_file_permissions(subpath, permissions)
        return {"ok": True}
    except PermissionError as e:
        return {"error": str(e), "status_code": 403}
    except OSError as e:
        return {"error": str(e), "status_code": 500}


def _action_update_file(request: dict, ctx: WorkerContext) -> dict:
    """Handle rename and/or permission change on a file."""
    fsp_name = request["fsp_name"]
    subpath = request.get("subpath", "")
    new_path = request.get("new_path")
    new_permissions = request.get("new_permissions")

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        old_file_info = filestore.get_file_info(subpath, ctx.username)
        result = {"info": json.loads(old_file_info.model_dump_json())}

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


def _action_validate_paths(request: dict, ctx: WorkerContext) -> dict:
    """Validate file/directory paths for app parameters."""
    from fileglancer.apps.core import validate_path_in_filestore
    from fileglancer import database as db

    paths = request["paths"]
    errors = {}
    with db.get_db_session(ctx.db_url) as session:
        for param_key, path_value in paths.items():
            error = validate_path_in_filestore(path_value, session)
            if error:
                errors[param_key] = error
    return {"errors": errors}


def _action_get_profile(request: dict, ctx: WorkerContext) -> dict:
    """Get user profile information."""
    import grp as _grp

    from fileglancer import database as db

    username = ctx.username

    with db.get_db_session(ctx.db_url) as session:
        paths = db.get_file_share_paths(session)

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
        user_info = pwd.getpwnam(username)
        all_groups = _grp.getgrall()
        for group in all_groups:
            if username in group.gr_mem:
                user_groups.append(group.gr_name)
        primary_group = _grp.getgrgid(user_info.pw_gid).gr_name
        if primary_group not in user_groups:
            user_groups.append(primary_group)
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

def _action_list_ssh_keys(request: dict, ctx: WorkerContext) -> dict:
    """List SSH keys."""
    from fileglancer import sshkeys
    try:
        ssh_dir = sshkeys.get_ssh_directory()
        keys = sshkeys.list_ssh_keys(ssh_dir)
        return {"keys": [k.model_dump() for k in keys]}
    except Exception as e:
        return {"error": str(e), "status_code": 500}


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

def _action_get_job_file(request: dict, ctx: WorkerContext) -> dict:
    """Read job file content (script, stdout, stderr)."""
    from fileglancer.apps.core import get_job_file_content
    job_id = request["job_id"]
    file_type = request["file_type"]
    content = get_job_file_content(job_id, ctx.username, file_type)
    if content is None:
        return {"content": None}
    return {"content": content}


def _action_get_job_file_paths(request: dict, ctx: WorkerContext) -> dict:
    """Get job file path info."""
    from fileglancer.apps.core import get_job_file_paths
    from fileglancer import database as db
    from fileglancer.settings import get_settings

    settings = get_settings()
    job_id = request["job_id"]

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, ctx.username)
        if db_job is None:
            return {"error": f"Job {job_id} not found", "status_code": 404}
        files = get_job_file_paths(db_job)
    return {"files": files}


def _action_get_service_url(request: dict, ctx: WorkerContext) -> dict:
    """Read service URL from job work directory."""
    from fileglancer.apps.core import get_service_url
    from fileglancer import database as db
    from fileglancer.settings import get_settings

    settings = get_settings()
    job_id = request["job_id"]

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, ctx.username)
        if db_job is None:
            return {"error": f"Job {job_id} not found", "status_code": 404}
        url = get_service_url(db_job)
    return {"service_url": url}


# ---------------------------------------------------------------------------
# Action handlers — S3 proxy
# ---------------------------------------------------------------------------

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

def _action_validate_proxied_path(request: dict, ctx: WorkerContext) -> dict:
    """Validate that the user can access a proxied path.

    Runs within the user's context (the worker IS the user), so
    filesystem permission checks just work.
    """
    fsp_name = request["fsp_name"]
    path = request["path"]

    filestore, error = _get_filestore(fsp_name, ctx.db_url)
    if filestore is None:
        return {"error": error}

    try:
        filestore.get_file_info(path)
        return {"ok": True}
    except (FileNotFoundError, PermissionError) as e:
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Action handlers — cluster operations (absorbed from apps/worker.py)
# ---------------------------------------------------------------------------

def _action_submit(request: dict, ctx: WorkerContext) -> dict:
    """Create work dir, symlink repo, submit job via py-cluster-api."""
    from cluster_api import create_executor, ResourceSpec

    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)

    work_dir = Path(request["work_dir"])
    work_dir.mkdir(parents=True, exist_ok=True)

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
    ))

    return {"job_id": job.job_id, "script_path": job.script_path}


def _action_cancel(request: dict, ctx: WorkerContext) -> dict:
    """Cancel a cluster job via py-cluster-api."""
    from cluster_api import create_executor

    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)
    _run_async(executor.cancel(request["job_id"]))
    return {"status": "ok"}


def _action_poll(request: dict, ctx: WorkerContext) -> dict:
    """Poll job statuses via py-cluster-api."""
    from cluster_api import create_executor
    from cluster_api._types import JobRecord, JobStatus

    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)

    known_statuses = request.get("job_statuses", {})
    for cid in request["cluster_job_ids"]:
        db_status = known_statuses.get(cid, "PENDING").lower()
        try:
            seed_status = JobStatus(db_status)
        except ValueError:
            seed_status = JobStatus.PENDING
        executor._jobs[cid] = JobRecord(
            job_id=cid,
            name="",
            command="",
            status=seed_status,
        )

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


def _action_reconnect(request: dict, ctx: WorkerContext) -> dict:
    """Reconnect to existing jobs via py-cluster-api."""
    from cluster_api import create_executor

    config = request["cluster_config"]
    config.pop("extra_args", None)

    executor = create_executor(**config)
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
# Action handlers — git/manifest operations (absorbed from apps/worker.py)
# ---------------------------------------------------------------------------

def _action_ensure_repo(request: dict, ctx: WorkerContext) -> dict:
    """Clone or update a GitHub repo in the current user's cache."""
    from fileglancer.apps.core import _ensure_repo_cache
    repo_dir = _run_async(_ensure_repo_cache(
        url=request["url"],
        pull=request.get("pull", False),
    ))
    return {"repo_dir": str(repo_dir)}


def _action_discover_manifests(request: dict, ctx: WorkerContext) -> dict:
    """Clone/pull repo and discover all manifests."""
    from fileglancer.apps.core import _ensure_repo_cache, _find_manifests_in_repo
    repo_dir = _run_async(_ensure_repo_cache(
        url=request["url"],
        pull=True,
    ))
    results = _find_manifests_in_repo(repo_dir)
    return {
        "manifests": [
            {"path": path, "manifest": manifest.model_dump(mode="json")}
            for path, manifest in results
        ]
    }


def _action_read_manifest(request: dict, ctx: WorkerContext) -> dict:
    """Fetch and read a single manifest from a cached repo."""
    from fileglancer.apps.core import _ensure_repo_cache, _read_manifest_file
    repo_dir = _run_async(_ensure_repo_cache(
        url=request["url"],
        pull=request.get("pull", False),
    ))
    manifest_path = request.get("manifest_path", "")
    target_dir = repo_dir / manifest_path if manifest_path else repo_dir
    manifest = _read_manifest_file(target_dir)
    return {"manifest": manifest.model_dump(mode="json")}


# ---------------------------------------------------------------------------
# Action registry
# ---------------------------------------------------------------------------

_ACTIONS: dict[str, Any] = {
    # File operations
    "list_dir": _action_list_dir,
    "list_dir_paged": _action_list_dir_paged,
    "get_file_info": _action_get_file_info,
    "check_binary": _action_check_binary,
    "open_file": _action_open_file,
    "head_file": _action_head_file,
    "create_dir": _action_create_dir,
    "create_file": _action_create_file,
    "rename": _action_rename,
    "delete": _action_delete,
    "chmod": _action_chmod,
    "update_file": _action_update_file,
    "validate_paths": _action_validate_paths,
    "validate_proxied_path": _action_validate_proxied_path,
    "get_profile": _action_get_profile,
    # SSH keys
    "list_ssh_keys": _action_list_ssh_keys,
    "generate_ssh_key": _action_generate_ssh_key,
    # Job files
    "get_job_file": _action_get_job_file,
    "get_job_file_paths": _action_get_job_file_paths,
    "get_service_url": _action_get_service_url,
    # S3 proxy
    "s3_list_objects": _action_s3_list_objects,
    "s3_head_object": _action_s3_head_object,
    "s3_open_object": _action_s3_open_object,
    # Cluster operations
    "submit": _action_submit,
    "cancel": _action_cancel,
    "poll": _action_poll,
    "reconnect": _action_reconnect,
    # Git/manifest operations
    "ensure_repo": _action_ensure_repo,
    "discover_manifests": _action_discover_manifests,
    "read_manifest": _action_read_manifest,
}


# ---------------------------------------------------------------------------
# Worker context and main loop
# ---------------------------------------------------------------------------

class WorkerContext:
    """Holds per-worker state."""

    def __init__(self, username: str, db_url: str):
        self.username = username
        self.db_url = db_url


def main():
    """Worker entry point — run the request/response loop."""

    # Set up orphan prevention
    _set_pdeathsig()

    # Configure logging
    log_level = os.environ.get("FGC_LOG_LEVEL", "INFO").upper()

    # Use loguru for worker logging, output to stderr
    logger.remove()
    logger.add(sys.stderr, level=log_level)

    # Configure cluster_api logging
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(
        "%(levelname)s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"
    ))
    cluster_logger = logging.getLogger("cluster_api")
    cluster_logger.addHandler(handler)
    cluster_logger.setLevel(log_level)

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

    db_url = os.environ.get("FGC_DB_URL", "")
    ctx = WorkerContext(username=username, db_url=db_url)

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
