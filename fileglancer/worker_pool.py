"""Per-user persistent worker pool.

Manages a pool of long-lived subprocess workers, one per active user.
Each worker runs with the target user's real UID/GID/groups (set at
fork time via subprocess.Popen kwargs), so the main Uvicorn process
never calls seteuid/setegid/setgroups.

Workers communicate with the main process over a Unix socketpair using
a length-prefixed JSON protocol.  When a worker response includes a file
descriptor (e.g. an opened file for streaming), it arrives transparently
via SCM_RIGHTS — callers see a ``_file_handle`` key in the response dict.

Usage from server.py:

    pool = WorkerPool(settings)
    worker = await pool.get_worker(username)
    result = await worker.execute("list_dir", fsp_name="home", subpath="Documents")

    # For actions that open files, the fd arrives automatically:
    result = await worker.execute("open_file", fsp_name="home", subpath="data.bin")
    file_handle = result.get("_file_handle")  # open file object, or None
"""

from __future__ import annotations

import array
import asyncio
import json
import os
import socket
import struct
import subprocess
import sys
import time
from typing import Any, Optional

from loguru import logger

from fileglancer.platform_compat import (
    current_gid,
    current_uid,
    group_ids_for_user,
    optional_module,
)
from fileglancer.settings import Settings

pwd = optional_module("pwd")


# Length-prefix format: 4-byte big-endian unsigned int
_HEADER_FMT = "!I"
_HEADER_SIZE = struct.calcsize(_HEADER_FMT)
_MAX_MESSAGE_SIZE = 64 * 1024 * 1024  # 64 MB safety limit


class WorkerError(Exception):
    """Raised when a worker returns an error response."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


class WorkerDead(Exception):
    """Raised when the worker subprocess has died unexpectedly."""
    pass


class UserWorker:
    """Wraps a single persistent worker subprocess for one user.

    IPC uses a blocking Unix socket accessed from a thread (via
    run_in_executor) so the async event loop is never blocked.
    All receives use recvmsg(), which transparently handles both
    plain messages and messages carrying file descriptors via SCM_RIGHTS.
    """

    def __init__(self, username: str, process: subprocess.Popen,
                 sock: socket.socket, db_proxy):
        self.username = username
        self.process = process
        self.sock = sock
        self.db_proxy = db_proxy  # LocalDbProxy used to satisfy worker db_requests
        self.last_activity = time.monotonic()
        self._busy = False
        self._lock = asyncio.Lock()  # serialize requests to the worker

    @property
    def is_alive(self) -> bool:
        return self.process.poll() is None

    @property
    def is_busy(self) -> bool:
        return self._busy

    async def execute(self, action: str, **kwargs) -> Any:
        """Send a request to the worker and return the parsed response.

        If the worker sends a file descriptor (SCM_RIGHTS), the response
        dict will contain a ``_file_handle`` key with an open file object.

        Requests are serialized per-worker via an asyncio lock — the worker
        subprocess handles one request at a time, so concurrent callers
        must not interleave their sends/receives on the shared socket.

        Raises WorkerError on application-level errors from the worker.
        Raises WorkerDead if the subprocess has exited.
        """
        if not self.is_alive:
            raise WorkerDead(f"Worker for {self.username} is dead (rc={self.process.returncode})")

        logger.debug(f"Delegating {action} to worker for {self.username} (pid={self.process.pid})")

        async with self._lock:
            self._busy = True
            self.last_activity = time.monotonic()
            try:
                request = {"action": action, **kwargs}
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None, self._send_and_recv, request)

                if response.get("error"):
                    # Close any fd that arrived with an error response
                    fh = response.pop("_file_handle", None)
                    if fh is not None:
                        fh.close()
                    raise WorkerError(
                        response["error"],
                        status_code=response.get("status_code", 500),
                    )

                return response
            except (BrokenPipeError, ConnectionResetError, OSError) as e:
                raise WorkerDead(f"Worker for {self.username} connection lost: {e}") from e
            finally:
                self._busy = False
                self.last_activity = time.monotonic()

    def _send_and_recv(self, request: dict) -> dict:
        """Send a request and receive the action response (blocking, runs in thread).

        Loops on receive: any inbound ``_kind == "db_request"`` message is a
        reverse-RPC from the worker (which has no DB credentials) asking the
        parent to run a DB query on its behalf. We dispatch it, send back a
        ``db_response``, and keep reading. Anything else is the action result.
        """
        self._send_msg(request)

        while True:
            response = self._recv_msg()
            if response.get("_kind") == "db_request":
                self._handle_db_request(response)
                continue
            return response

    def _send_msg(self, msg: dict):
        """Send a length-prefixed JSON message."""
        payload = json.dumps(msg).encode()
        header = struct.pack(_HEADER_FMT, len(payload))
        self.sock.sendall(header + payload)

    def _recv_msg(self) -> dict:
        """Receive one length-prefixed JSON message, capturing any SCM_RIGHTS fd.

        All receives use recvmsg() so that SCM_RIGHTS file descriptors are
        captured transparently — the ancillary data arrives with the first
        bytes of the message, so we must use recvmsg for the header too.
        """
        fds = array.array("i")
        raw = b""
        try:
            while len(raw) < _HEADER_SIZE:
                msg, ancdata, flags, addr = self.sock.recvmsg(
                    max(_HEADER_SIZE - len(raw), 4096),
                    socket.CMSG_LEN(struct.calcsize("i")),
                )
                if not msg:
                    raise ConnectionError("Worker closed connection")
                raw += msg
                for cmsg_level, cmsg_type, cmsg_data in ancdata:
                    if cmsg_level == socket.SOL_SOCKET and cmsg_type == socket.SCM_RIGHTS:
                        fds.frombytes(cmsg_data[:len(cmsg_data) - (len(cmsg_data) % fds.itemsize)])

            (length,) = struct.unpack(_HEADER_FMT, raw[:_HEADER_SIZE])
            if length > _MAX_MESSAGE_SIZE:
                raise WorkerError(f"Response too large: {length} bytes")

            total_needed = _HEADER_SIZE + length
            while len(raw) < total_needed:
                msg, ancdata, flags, addr = self.sock.recvmsg(
                    total_needed - len(raw),
                    socket.CMSG_LEN(struct.calcsize("i")),
                )
                if not msg:
                    raise ConnectionError("Worker closed connection mid-message")
                raw += msg
                for cmsg_level, cmsg_type, cmsg_data in ancdata:
                    if cmsg_level == socket.SOL_SOCKET and cmsg_type == socket.SCM_RIGHTS:
                        fds.frombytes(cmsg_data[:len(cmsg_data) - (len(cmsg_data) % fds.itemsize)])

            body = raw[_HEADER_SIZE:_HEADER_SIZE + length]
            response = json.loads(body)
        except Exception:
            # Close any fds received before the error to prevent leaks
            for fd_val in fds:
                try:
                    os.close(fd_val)
                except OSError:
                    pass
            raise

        if fds:
            response["_file_handle"] = os.fdopen(fds[0], "rb")
            for extra_fd in fds[1:]:
                try:
                    os.close(extra_fd)
                except OSError:
                    pass

        return response

    def _handle_db_request(self, request: dict):
        """Run a DB query on behalf of the worker and send the result back."""
        from fileglancer.user_worker import DB_METHODS, serialize_db_result

        method = request.get("method")
        kwargs = request.get("kwargs", {}) or {}
        if method not in DB_METHODS:
            self._send_msg({
                "_kind": "db_response",
                "ok": False,
                "error": f"Unknown db method: {method}",
            })
            return

        try:
            value = getattr(self.db_proxy, method)(**kwargs)
            result = serialize_db_result(method, value)
            self._send_msg({"_kind": "db_response", "ok": True, "result": result})
        except Exception as e:
            logger.exception(f"db_request {method} for {self.username} failed")
            self._send_msg({
                "_kind": "db_response",
                "ok": False,
                "error": f"{type(e).__name__}: {e}",
            })

    async def shutdown(self, timeout: float = 5.0):
        """Ask the worker to shut down gracefully, then force-kill if needed."""
        if not self.is_alive:
            return
        try:
            payload = json.dumps({"action": "shutdown"}).encode()
            header = struct.pack(_HEADER_FMT, len(payload))
            self.sock.sendall(header + payload)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

        # Wait for clean exit
        try:
            await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, self.process.wait),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(f"Worker for {self.username} did not exit in {timeout}s, killing")
            self.process.kill()
            self.process.wait()

        try:
            self.sock.close()
        except OSError:
            pass


class WorkerPool:
    """Manages per-user persistent worker subprocesses.

    Workers are spawned on demand and evicted after idle timeout.
    """

    def __init__(self, settings: Settings):
        from fileglancer.user_worker import LocalDbProxy

        self.settings = settings
        self._workers: dict[str, UserWorker] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._eviction_task: Optional[asyncio.Task] = None
        self.max_workers = settings.worker_pool_max_workers
        self.idle_timeout = settings.worker_pool_idle_timeout
        # All worker DB requests are satisfied by this proxy in the parent;
        # the worker subprocess never sees the DB URL.
        self._db_proxy = LocalDbProxy(settings.db_url)

    def _get_lock(self, username: str) -> asyncio.Lock:
        if username not in self._locks:
            self._locks[username] = asyncio.Lock()
        return self._locks[username]

    async def get_worker(self, username: str) -> UserWorker:
        """Get or create a worker for the given user."""
        # Fast path: worker exists and is alive
        worker = self._workers.get(username)
        if worker is not None and worker.is_alive:
            worker.last_activity = time.monotonic()
            return worker

        # Slow path: need to create or replace worker
        async with self._get_lock(username):
            # Double-check after acquiring lock
            worker = self._workers.get(username)
            if worker is not None and worker.is_alive:
                worker.last_activity = time.monotonic()
                return worker

            # Clean up dead worker if present
            if worker is not None:
                logger.warning(f"Worker for {username} found dead, replacing")
                self._workers.pop(username, None)

            # Evict LRU worker if at capacity
            if len(self._workers) >= self.max_workers:
                await self._evict_lru()

                # If still at capacity (all workers busy), refuse rather than exceed the limit
                if len(self._workers) >= self.max_workers:
                    raise WorkerError("Worker pool at capacity, try again later", status_code=503)

            # Spawn new worker
            new_worker = await self._spawn_worker(username)
            self._workers[username] = new_worker
            return new_worker

    async def _spawn_worker(self, username: str) -> UserWorker:
        """Spawn a new persistent worker subprocess for the given user."""
        # Build identity kwargs. With use_access_flags the worker setuids to
        # the target user (requires root; the precondition is enforced in
        # create_app). Without use_access_flags the worker runs as the parent
        # process's user — used for local debugging of the worker code path.
        identity_kwargs: dict = {}
        if self.settings.use_access_flags:
            if os.name != "posix" or pwd is None:
                raise WorkerError(
                    "Running workers as another user requires POSIX pwd/getgrouplist support",
                    status_code=500,
                )
            pw = pwd.getpwnam(username)
            try:
                groups = group_ids_for_user(username, pw.pw_gid)
            except RuntimeError as e:
                raise WorkerError(str(e), status_code=500) from e
            identity_kwargs = {
                "user": pw.pw_uid,
                "group": pw.pw_gid,
                "extra_groups": groups,
            }
            home_dir = pw.pw_dir
            log_uid, log_gid = pw.pw_uid, pw.pw_gid
        else:
            home_dir = os.path.expanduser("~")
            log_uid, log_gid = current_uid(), current_gid()

        # Create Unix socketpair for IPC
        parent_sock, child_sock = socket.socketpair()

        # Worker subprocess deliberately does NOT receive the DB URL — it
        # runs as the (untrusted) target user, so credentials would be
        # readable via /proc/<pid>/environ. All DB queries reverse-RPC back
        # to the parent over the IPC socket instead.
        env = {
            **os.environ,
            "HOME": home_dir,
            "FGC_LOG_LEVEL": self.settings.log_level,
            "FGC_WORKER_FD": str(child_sock.fileno()),
        }
        env.pop("FGC_DB_URL", None)

        logger.info(
            f"Spawning persistent worker for {username} "
            f"(uid={log_uid} gid={log_gid})"
        )

        process = subprocess.Popen(
            [sys.executable, "-m", "fileglancer.user_worker"],
            env=env,
            pass_fds=(child_sock.fileno(),),
            stderr=subprocess.PIPE,
            **identity_kwargs,
        )

        # Close child's end in the parent
        child_sock.close()

        # Keep the socket blocking — all I/O runs in a thread via run_in_executor.
        # Set a timeout so a hung worker can't block a thread forever.
        parent_sock.setblocking(True)
        parent_sock.settimeout(120)

        # Start a background task to forward worker stderr to loguru
        asyncio.create_task(self._forward_stderr(username, process))

        return UserWorker(username, process, parent_sock, self._db_proxy)

    async def _forward_stderr(self, username: str, process: subprocess.Popen):
        """Forward worker stderr lines to loguru in the background.

        If this task dies, the worker's stderr pipe will eventually fill and
        block the worker on its next write — so failures here are logged
        loudly rather than swallowed.
        """
        stderr = process.stderr
        if stderr is None:
            logger.warning(f"worker {username} has no stderr pipe to forward")
            return
        try:
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, stderr.readline)
                if not line:
                    break
                logger.debug(f"[worker:{username}] {line.decode().rstrip()}")
        except Exception:
            logger.exception(f"stderr forwarder for worker {username} crashed")

    async def _evict_lru(self):
        """Evict the least-recently-used idle worker."""
        candidates = [
            (w.last_activity, name, w)
            for name, w in self._workers.items()
            if not w.is_busy
        ]
        if not candidates:
            logger.warning("Worker pool at capacity with no idle workers to evict")
            return

        candidates.sort()
        _, name, worker = candidates[0]
        logger.info(f"Evicting LRU worker for {name}")
        await worker.shutdown()
        self._workers.pop(name, None)

    async def start_eviction_loop(self):
        """Start the background eviction loop."""
        if self._eviction_task is None or self._eviction_task.done():
            self._eviction_task = asyncio.create_task(self._eviction_loop())

    async def _eviction_loop(self):
        """Periodically evict idle workers."""
        while True:
            await asyncio.sleep(min(60, self.idle_timeout))
            now = time.monotonic()
            to_evict = []
            for name, worker in list(self._workers.items()):
                if not worker.is_busy and (now - worker.last_activity) > self.idle_timeout:
                    to_evict.append(name)
                elif not worker.is_alive:
                    to_evict.append(name)

            for name in to_evict:
                worker = self._workers.pop(name, None)
                if worker is not None:
                    if worker.is_alive:
                        logger.info(f"Evicting idle worker for {name}")
                        await worker.shutdown()
                    else:
                        logger.info(f"Removing dead worker for {name}")

    async def shutdown_all(self):
        """Shut down all workers (called during server shutdown)."""
        if self._eviction_task and not self._eviction_task.done():
            self._eviction_task.cancel()
            try:
                await self._eviction_task
            except asyncio.CancelledError:
                pass

        tasks = []
        for name, worker in list(self._workers.items()):
            logger.info(f"Shutting down worker for {name}")
            tasks.append(worker.shutdown(timeout=10.0))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        self._workers.clear()
        self._locks.clear()
