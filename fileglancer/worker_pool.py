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
import grp
import json
import os
import pwd
import socket
import struct
import subprocess
import sys
import time
from typing import Any, Optional

from loguru import logger

from fileglancer.settings import Settings


# Length-prefix format: 4-byte big-endian unsigned int
_HEADER_FMT = "!I"
_HEADER_SIZE = struct.calcsize(_HEADER_FMT)
_MAX_MESSAGE_SIZE = 64 * 1024 * 1024  # 64 MB safety limit


class WorkerError(Exception):
    """Raised when a worker returns an error response."""
    pass


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
                 sock: socket.socket):
        self.username = username
        self.process = process
        self.sock = sock
        self.last_activity = time.monotonic()
        self._busy = False

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

        Raises WorkerError on application-level errors from the worker.
        Raises WorkerDead if the subprocess has exited.
        """
        if not self.is_alive:
            raise WorkerDead(f"Worker for {self.username} is dead (rc={self.process.returncode})")

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
                raise WorkerError(response["error"])

            return response
        except (BrokenPipeError, ConnectionResetError, OSError) as e:
            raise WorkerDead(f"Worker for {self.username} connection lost: {e}") from e
        finally:
            self._busy = False
            self.last_activity = time.monotonic()

    def _send_and_recv(self, request: dict) -> dict:
        """Send a request and receive the response (blocking, runs in thread).

        All receives use recvmsg() so that SCM_RIGHTS file descriptors are
        captured transparently — the ancillary data arrives with the first
        bytes of the message, so we must use recvmsg for the header too.
        """
        # Send
        payload = json.dumps(request).encode()
        header = struct.pack(_HEADER_FMT, len(payload))
        self.sock.sendall(header + payload)

        # Receive header + payload + optional fd, all via recvmsg
        fds = array.array("i")
        raw = b""
        # First, read at least the header
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

        # We may have read some payload bytes with the header
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

        # If an fd arrived, wrap it in a file object
        if fds:
            response["_file_handle"] = os.fdopen(fds[0], "rb")

        return response

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
        self.settings = settings
        self._workers: dict[str, UserWorker] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._eviction_task: Optional[asyncio.Task] = None
        self.max_workers = 50
        self.idle_timeout = 300  # seconds

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

            # Spawn new worker
            new_worker = await self._spawn_worker(username)
            self._workers[username] = new_worker
            return new_worker

    async def _spawn_worker(self, username: str) -> UserWorker:
        """Spawn a new persistent worker subprocess for the given user."""
        pw = pwd.getpwnam(username)

        # Build identity kwargs (only switch if running as root)
        identity_kwargs: dict = {}
        if os.geteuid() == 0:
            groups = [g.gr_gid for g in grp.getgrall() if username in g.gr_mem]
            if pw.pw_gid not in groups:
                groups.append(pw.pw_gid)
            identity_kwargs = {
                "user": pw.pw_uid,
                "group": pw.pw_gid,
                "extra_groups": groups,
            }

        # Create Unix socketpair for IPC
        parent_sock, child_sock = socket.socketpair()

        env = {
            **os.environ,
            "HOME": pw.pw_dir,
            "FGC_LOG_LEVEL": self.settings.log_level,
            "FGC_DB_URL": self.settings.db_url,
            "FGC_WORKER_FD": str(child_sock.fileno()),
        }

        logger.info(
            f"Spawning persistent worker for {username} "
            f"(uid={pw.pw_uid} gid={pw.pw_gid})"
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

        # Keep the socket blocking — all I/O runs in a thread via run_in_executor
        parent_sock.setblocking(True)

        # Start a background task to forward worker stderr to loguru
        asyncio.create_task(self._forward_stderr(username, process))

        return UserWorker(username, process, parent_sock)

    async def _forward_stderr(self, username: str, process: subprocess.Popen):
        """Forward worker stderr lines to loguru in the background."""
        try:
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, process.stderr.readline)
                if not line:
                    break
                logger.debug(f"[worker:{username}] {line.decode().rstrip()}")
        except Exception:
            pass

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
            await asyncio.sleep(60)
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
