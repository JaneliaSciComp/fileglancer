"""Client side of the per-user worker system.

SupervisedWorkerPool obtains per-user workers from a fileglancer-supervisor
process through a lease API over a unix socket. Acquisition is the only
supervisor round-trip: after a lease is granted, requests flow directly
between this process and the worker on a socket the supervisor handed us
(including SCM_RIGHTS file-descriptor passing), so the supervisor is never
on the data path.

In ``external`` mode the supervisor is a separately deployed (root) process;
in ``embedded`` mode this pool launches one as an unprivileged child at
startup, shared between uvicorn processes via a lock file.

LegacyWorkerPool is the pre-supervisor fork+setuid pool, kept behind
``supervisor_mode: legacy`` for one release as the rollback path.

Usage from server.py:

    pool = SupervisedWorkerPool(settings)
    await pool.start()
    result = await pool.execute(username, "list_dir", fsp_name="home")

    # For actions that open files, the fd arrives automatically:
    result = await pool.execute(username, "open_file", fsp_name="home", subpath="data.bin")
    file_handle = result.get("_file_handle")  # open file object, or None
"""

from __future__ import annotations

import asyncio
import fcntl
import os
import socket
import subprocess
import sys
import tempfile
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from cachetools import TTLCache
from loguru import logger

from fileglancer.database import FSP_CACHE_TTL_SECONDS
from fileglancer.settings import Settings
from fileglancer.supervisor import PROTOCOL_VERSION
from fileglancer.supervisor.protocol import ProtocolError, recv_msg, send_msg
from fileglancer.supervisor.spawn import spawn_worker

# Worker-bound (JSON-serialized) file share paths, keyed by database URL for the
# same reason the model-level cache is; see _fetch_fsp_rows.
_fsp_row_cache = TTLCache(maxsize=8, ttl=FSP_CACHE_TTL_SECONDS)


# Per-request receive timeout (seconds). The default covers ordinary IPC
# round-trips. Git-heavy actions get a far larger ceiling because they
# legitimately run much longer than a normal request: git clone is bounded at
# 120s (manifest.py), snapshot creation clones and checks out with 300s ceilings
# each, and discovery walks/converts the repo on top of a clone. A fixed 120s
# timeout would make the parent treat the worker as dead mid-clone; keeping the
# ceiling comfortably above the underlying operation timeouts lets a
# slow-but-valid clone/snapshot return its result instead.
_DEFAULT_REQUEST_TIMEOUT = 120
_GIT_ACTION_TIMEOUT = 900
_LONG_ACTIONS = frozenset({
    "ensure_repo",
    "discover_manifests",
    "read_manifest",
    "ensure_snapshot",
    "gc_snapshots",
    "submit",
    "delete_job_work_dir",
})


def _timeout_for_action(action: str) -> float:
    """Return the receive timeout (seconds) for a worker action."""
    return _GIT_ACTION_TIMEOUT if action in _LONG_ACTIONS else _DEFAULT_REQUEST_TIMEOUT


def _fetch_fsp_rows(db_url: str) -> list[dict]:
    """Read the file share paths and serialize them for the worker.

    The serialized form is cached as well as the underlying list: dumping a few
    hundred models costs more than the query does once the query is cached, and
    every file action dispatched to a worker pays it. Same TTL, so the worker
    sees a list no staler than the rest of the app does.
    """
    from fileglancer import database as db

    rows = _fsp_row_cache.get(db_url)
    if rows is None:
        with db.get_db_session(db_url) as session:
            rows = [f.model_dump(mode="json") for f in db.get_file_share_paths(session)]
        _fsp_row_cache[db_url] = rows
    return rows


def prepare_worker_request(request: dict, db_url: str) -> dict:
    """Attach the DB data the worker needs to a request.

    Only the file-share-path list, which too many actions need for the
    dispatching endpoint to be responsible for it; everything else the worker
    needs from the DB is passed by the caller as a request kwarg. This runs in
    the parent process, which is the only one holding db_url.
    """
    from fileglancer.user_worker import ACTIONS_NEEDING_FSPS

    if request.get("action") not in ACTIONS_NEEDING_FSPS:
        return request
    return {**request, "file_share_paths": _fetch_fsp_rows(db_url)}


class WorkerError(Exception):
    """Raised when a worker returns an error response."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


class WorkerDead(Exception):
    """Raised when the worker subprocess has died unexpectedly."""
    pass


def _attach_file_handle(response: dict, fds: list[int]) -> dict:
    """Wrap a received SCM_RIGHTS fd into the response's ``_file_handle``.

    Actions that open a file for writing (write_file) set _fd_mode so the fd
    is wrapped writable; reads default to "rb".
    """
    if fds:
        fd_mode = response.pop("_fd_mode", "rb")
        response["_file_handle"] = os.fdopen(fds[0], fd_mode)
        for extra_fd in fds[1:]:
            try:
                os.close(extra_fd)
            except OSError:
                pass
    return response


def _send_and_recv(sock: socket.socket, username: str, request: dict,
                   db_url: Optional[str], timeout: float) -> dict:
    """Send a request on a worker socket and receive the response (blocking).

    ``timeout`` bounds each blocking receive on the socket; it is set per
    request so that a long git clone/snapshot isn't misread as a dead worker.

    Any DB data the worker needs is attached to the request before it is
    sent.  The worker never gets DB credentials and never sends reverse DB
    RPCs; this remains a simple one request / one response exchange.
    """
    sock.settimeout(timeout)
    try:
        request = prepare_worker_request(request, db_url)
    except Exception as e:
        logger.exception(
            f"Failed to prepare {request.get('action')} request for {username}")
        raise WorkerError(f"Failed to prepare worker request: {e}") from e
    send_msg(sock, request)
    try:
        response, fds = recv_msg(sock)
    except ProtocolError as e:
        raise WorkerError(str(e)) from e
    if response is None:
        raise ConnectionError("Worker closed connection")
    return _attach_file_handle(response, fds)


def _raise_from_response(response: dict) -> dict:
    """Translate an error response into WorkerError, closing any attached fd."""
    if response.get("error"):
        fh = response.pop("_file_handle", None)
        if fh is not None:
            fh.close()
        raise WorkerError(response["error"],
                          status_code=response.get("status_code", 500))
    return response


def _preexec_pdeathsig():
    """Die with the web app (Linux): the embedded supervisor must not outlive
    the process that launched it, and its workers carry their own pdeathsig."""
    import ctypes
    import signal
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl(1, signal.SIGTERM, 0, 0, 0)  # PR_SET_PDEATHSIG


# ---------------------------------------------------------------------------
# Supervised pool (external / embedded modes)
# ---------------------------------------------------------------------------

class Lease:
    """One leased worker socket, valid for the duration of one HTTP request.

    A lease may carry several consecutive request/response pairs; closing the
    socket (done by the pool's context manager) releases the worker.
    """

    def __init__(self, username: str, sock: socket.socket, worker_pid: int,
                 db_url: Optional[str]):
        self.username = username
        self.sock = sock
        self.worker_pid = worker_pid
        self.db_url = db_url

    async def execute(self, action: str, **kwargs) -> Any:
        """Send a request to the leased worker and return the parsed response.

        If the worker sends a file descriptor (SCM_RIGHTS), the response dict
        will contain a ``_file_handle`` key with an open file object.

        Raises WorkerError on application-level errors from the worker.
        Raises WorkerDead if the worker went away.
        """
        logger.debug(f"Delegating {action} to worker for {self.username} "
                     f"(pid={self.worker_pid})")
        request = {"action": action, **kwargs}
        loop = asyncio.get_event_loop()
        try:
            response = await loop.run_in_executor(
                None, _send_and_recv, self.sock, self.username, request,
                self.db_url, _timeout_for_action(action))
        except WorkerError:
            raise
        except (BrokenPipeError, ConnectionResetError, ConnectionError, OSError) as e:
            raise WorkerDead(f"Worker for {self.username} connection lost: {e}") from e
        return _raise_from_response(response)


class SupervisedWorkerPool:
    """Obtains per-user workers from a fileglancer-supervisor over its socket.

    Keeps a small pool of long-lived control connections; each request takes
    one for its duration. An acquire for a user whose workers are all busy
    parks inside the supervisor until one frees up or the timeout passes, so
    it occupies one connection while unrelated users' requests go over the
    others. On connection loss, in-flight requests fail with WorkerDead (503)
    and a background task reconnects with exponential backoff. Leases already
    granted don't route through the supervisor and are unaffected.
    """

    # Control connections. Each waiting acquire holds one; beyond this many,
    # requests queue in the app. The supervisor's spawn rate limit is per
    # connection, so the effective limit is this many times higher.
    POOL_SIZE = 8

    def __init__(self, settings: Settings):
        self.settings = settings
        self.mode = settings.supervisor_mode  # "external" or "embedded"
        self._idle: list[socket.socket] = []
        self._slots = asyncio.Semaphore(self.POOL_SIZE)
        self._dataserver_cache: dict[str, tuple[str, float]] = {}  # user -> (socket path, expiry)
        self._reconnect_task: Optional[asyncio.Task] = None
        self._child: Optional[subprocess.Popen] = None
        self._lock_file = None
        self._tmpdir: Optional[str] = None
        self.hello: dict = {}

    # -- socket path / embedded child ---------------------------------------

    def _socket_path(self) -> str:
        if self.mode == "external" or "supervisor_socket" in self.settings.model_fields_set:
            return self.settings.supervisor_socket
        run_dir = os.environ.get("XDG_RUNTIME_DIR")
        if run_dir:
            path = os.path.join(run_dir, "fileglancer")
        else:
            # Stable per-user fallback so sibling uvicorn processes find the
            # same socket; mode 0700 below keeps it private.
            path = os.path.join(tempfile.gettempdir(),
                                f"fileglancer-{os.getuid()}")
            self._tmpdir = path
        os.makedirs(path, mode=0o700, exist_ok=True)
        return os.path.join(path, "supervisor.sock")

    def _embedded_args(self, socket_path: str) -> list[str]:
        args = [
            sys.executable, "-m", "fileglancer.supervisor",
            "--socket", socket_path,
            "--max-workers", str(self.settings.worker_pool_max_workers),
            "--idle-timeout", str(self.settings.worker_pool_idle_timeout),
            "--log-level", self.settings.log_level,
            "--log-format", self.settings.log_format,
        ]
        for entry in self.settings.apps.worker_env_passthrough:
            args += ["--env-passthrough", entry]
        args += self.settings.supervisor_embedded_args
        return args

    def _ensure_embedded(self, socket_path: str) -> None:
        """Spawn an embedded supervisor child, unless a live one owns the socket.

        Ownership is decided by a lock file next to the socket, so
        ``uvicorn --workers N`` shares one supervisor: the first process wins
        the flock and spawns, the rest connect.
        """
        if self._child is not None and self._child.poll() is None:
            return
        if self._lock_file is None:
            self._lock_file = open(socket_path + ".lock", "a")
        try:
            fcntl.flock(self._lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return  # another process owns the supervisor; just connect
        logger.info("Starting embedded supervisor")
        preexec = _preexec_pdeathsig if sys.platform == "linux" else None
        self._child = subprocess.Popen(self._embedded_args(socket_path),
                                       preexec_fn=preexec)

    # -- connection ----------------------------------------------------------

    def _connect_blocking(self) -> socket.socket:
        socket_path = self._socket_path()
        if self.mode == "embedded":
            self._ensure_embedded(socket_path)
        deadline = time.monotonic() + 15
        last_err: Optional[Exception] = None
        while time.monotonic() < deadline:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            try:
                sock.connect(socket_path)
                break
            except OSError as e:
                sock.close()
                last_err = e
                time.sleep(0.2)
        else:
            raise ConnectionError(
                f"Cannot connect to supervisor at {socket_path}: {last_err}")
        sock.settimeout(10)
        send_msg(sock, {"op": "hello", "protocol": PROTOCOL_VERSION,
                        "client": "fileglancer-web", "pid": os.getpid()})
        hello, _fds = recv_msg(sock)
        if not hello or not hello.get("ok"):
            sock.close()
            raise ConnectionError(f"Supervisor rejected hello: {hello}")
        if not self.hello:
            logger.info(f"Connected to supervisor at {socket_path} "
                        f"(privileged={hello.get('privileged')}, "
                        f"version={hello.get('version')})")
        self.hello = hello
        return sock

    async def start(self):
        """Connect (external) or ensure a child and connect (embedded)."""
        self._idle.append(await asyncio.get_event_loop().run_in_executor(
            None, self._connect_blocking))

    def _drop_idle(self) -> None:
        for sock in self._idle:
            sock.close()
        self._idle.clear()

    async def _call(self, fn):
        """Run blocking ``fn(sock)`` on a pooled control connection.

        Connections are opened on demand up to POOL_SIZE. A failure closes the
        connection, drops the idle ones (they share the supervisor's fate),
        and starts the reconnect loop; until it succeeds, calls fail fast.
        """
        async with self._slots:
            if self._reconnect_task is not None and not self._reconnect_task.done():
                raise WorkerDead("Supervisor unavailable: reconnecting")
            loop = asyncio.get_event_loop()
            sock = self._idle.pop() if self._idle else None
            try:
                if sock is None:
                    sock = await loop.run_in_executor(None, self._connect_blocking)
                result = await loop.run_in_executor(None, fn, sock)
            except (ConnectionError, OSError) as e:
                if sock is not None:
                    sock.close()
                self._drop_idle()
                self._kick_reconnect()
                raise WorkerDead(f"Supervisor unavailable: {e}") from e
            self._idle.append(sock)
            return result

    async def stop(self):
        """Close the connections; terminate the embedded child if we spawned it."""
        if self._reconnect_task is not None:
            self._reconnect_task.cancel()
        self._drop_idle()
        if self._child is not None and self._child.poll() is None:
            self._child.terminate()
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, self._child.wait, 10)
            except Exception:
                self._child.kill()
        if self._lock_file is not None:
            self._lock_file.close()
            self._lock_file = None

    def _kick_reconnect(self) -> None:
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self) -> None:
        delay = 0.2
        while True:
            await asyncio.sleep(delay)
            try:
                self._idle.append(await asyncio.get_event_loop().run_in_executor(
                    None, self._connect_blocking))
                logger.info("Reconnected to supervisor")
                return
            except Exception as e:
                logger.warning(f"Supervisor reconnect failed: {e}")
                delay = min(delay * 2, 5.0)

    # -- leasing -------------------------------------------------------------

    def _acquire_blocking(self, sock: socket.socket, username: str) -> tuple[dict, list[int]]:
        timeout = self.settings.supervisor_acquire_timeout
        sock.settimeout(timeout + 5)
        send_msg(sock, {"op": "acquire", "kind": "worker", "user": username,
                        "timeout_ms": int(timeout * 1000)})
        reply, fds = recv_msg(sock)
        if reply is None:
            raise ConnectionError("Supervisor closed connection")
        return reply, fds

    @asynccontextmanager
    async def lease(self, username: str) -> AsyncIterator[Lease]:
        """Acquire a worker lease; the socket is closed (= released) on exit.

        A lease must not outlive its HTTP request: nothing may store it on a
        long-lived object.
        """
        reply, fds = await self._call(lambda sock: self._acquire_blocking(sock, username))
        if not reply.get("ok"):
            for fd in fds:
                os.close(fd)
            code = reply.get("code", "error")
            status = 403 if code in ("invalid_user", "denied") else 503
            raise WorkerError(
                f"Worker unavailable ({code}): {reply.get('error')}",
                status_code=status)
        if not fds:
            raise WorkerDead("Supervisor granted a lease without a socket")
        sock = socket.socket(fileno=fds[0])
        for extra in fds[1:]:
            os.close(extra)
        sock.setblocking(True)
        try:
            yield Lease(username, sock, reply.get("worker_pid"),
                        self.settings.db_url)
        finally:
            sock.close()

    async def execute(self, username: str, action: str, **kwargs) -> Any:
        """Acquire a lease, run one action, release the lease."""
        async with self.lease(username) as lease:
            return await lease.execute(action, **kwargs)

    # How long a user's zarrbridge socket path is reused without asking the
    # supervisor again. Viewers fetch chunks in bursts; one acquire per burst
    # is plenty to keep the idle reaper informed.
    DATASERVER_CACHE_SECONDS = 5.0

    def _acquire_dataserver_blocking(self, sock: socket.socket, username: str) -> dict:
        sock.settimeout(self.settings.supervisor_acquire_timeout + 5)
        send_msg(sock, {"op": "acquire", "kind": "dataserver", "user": username})
        reply, fds = recv_msg(sock)
        for fd in fds:
            os.close(fd)
        if reply is None:
            raise ConnectionError("Supervisor closed connection")
        return reply

    async def dataserver(self, username: str) -> str:
        """The unix socket of this user's zarrbridge, spawned on first use.

        Called before every proxied request; the acquire is how the supervisor
        learns the server is still in use, so the answer is cached only briefly.
        """
        cached = self._dataserver_cache.get(username)
        if cached and cached[1] > time.monotonic():
            return cached[0]
        reply = await self._call(lambda sock: self._acquire_dataserver_blocking(sock, username))
        if not reply.get("ok"):
            code = reply.get("code", "error")
            status = 403 if code in ("invalid_user", "denied") else 503
            raise WorkerError(f"Data server unavailable ({code}): {reply.get('error')}",
                              status_code=status)
        self._dataserver_cache[username] = (reply["socket"],
                                            time.monotonic() + self.DATASERVER_CACHE_SECONDS)
        return reply["socket"]

    async def status(self) -> dict:
        """Fetch the supervisor's status payload."""
        def _status_blocking(sock: socket.socket) -> dict:
            sock.settimeout(10)
            send_msg(sock, {"op": "status"})
            reply, _fds = recv_msg(sock)
            if reply is None:
                raise ConnectionError("Supervisor closed connection")
            return reply

        return await self._call(_status_blocking)


# ---------------------------------------------------------------------------
# Legacy pool (fork + setuid in-process) — rollback path, one release only
# ---------------------------------------------------------------------------

class UserWorker:
    """Wraps a single persistent worker subprocess for one user (legacy mode).

    IPC uses a blocking Unix socket accessed from a thread (via
    run_in_executor) so the async event loop is never blocked.
    """

    def __init__(self, username: str, process: subprocess.Popen,
                 sock: socket.socket, db_url: Optional[str]):
        self.username = username
        self.process = process
        self.sock = sock
        self.db_url = db_url  # parent-side only; used to prepare requests
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

        Requests are serialized per-worker via an asyncio lock — the worker
        subprocess handles one request at a time, so concurrent callers
        must not interleave their sends/receives on the shared socket.
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
                    None, _send_and_recv, self.sock, self.username, request,
                    self.db_url, _timeout_for_action(action))
                return _raise_from_response(response)
            except WorkerError:
                raise
            except (BrokenPipeError, ConnectionResetError, ConnectionError, OSError) as e:
                raise WorkerDead(f"Worker for {self.username} connection lost: {e}") from e
            finally:
                self._busy = False
                self.last_activity = time.monotonic()

    async def shutdown(self, timeout: float = 5.0):
        """Ask the worker to shut down gracefully, then force-kill if needed."""
        if not self.is_alive:
            return
        try:
            send_msg(self.sock, {"action": "shutdown"})
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


class LegacyWorkerPool:
    """Manages per-user persistent worker subprocesses by forking directly
    (requires root when use_access_flags is set).

    Kept behind ``supervisor_mode: legacy`` for one release as the rollback
    path; removed in the following release.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._workers: dict[str, UserWorker] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._eviction_task: Optional[asyncio.Task] = None
        self.max_workers = settings.worker_pool_max_workers
        self.idle_timeout = settings.worker_pool_idle_timeout

    async def execute(self, username: str, action: str, **kwargs) -> Any:
        worker = await self.get_worker(username)
        return await worker.execute(action, **kwargs)

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
        logger.info(f"Spawning persistent worker for {username}")
        process, parent_sock, _uid = spawn_worker(
            username,
            privileged=self.settings.use_access_flags,
            env_passthrough=self.settings.apps.worker_env_passthrough,
            log_level=self.settings.log_level,
            log_format=self.settings.log_format,
            worker_mode="legacy",
        )
        parent_sock.settimeout(120)

        # Start a background task to forward worker stderr to loguru
        asyncio.create_task(self._forward_stderr(username, process))

        return UserWorker(username, process, parent_sock, self.settings.db_url)

    async def _forward_stderr(self, username: str, process: subprocess.Popen):
        """Forward worker stderr lines to loguru in the background.

        If this task dies, the worker's stderr pipe will eventually fill and
        block the worker on its next write — so failures here are logged
        loudly rather than swallowed.
        """
        try:
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, process.stderr.readline)
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
