"""The supervisor process: socket server, worker pool, lifecycle policy.

One thread per client connection, one reader thread per worker control
socket, one reaper thread; all pool state lives behind a single Condition.

Standard library only (see package docstring).
"""

from __future__ import annotations

import grp
import json
import logging
import os
import pwd
import re
import signal
import socket
import stat
import sys
import threading
import time
from collections import deque

from fileglancer.supervisor import PROTOCOL_VERSION
from fileglancer.supervisor.config import SupervisorConfig
from fileglancer.supervisor.protocol import recv_msg, send_msg
from fileglancer.supervisor.spawn import spawn_worker

logger = logging.getLogger("fileglancer.supervisor")

_DISCONNECT_GRACE = 10.0  # seconds a busy worker may outlive its client connection


class _JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "@timestamp": self.formatTime(record),
            "log.level": record.levelname,
            "message": record.getMessage(),
            "process.pid": os.getpid(),
        })


def configure_logging(level: str, fmt: str) -> None:
    handler = logging.StreamHandler(sys.stderr)
    if fmt == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"))
    logging.basicConfig(level=level.upper(), handlers=[handler], force=True)


class Worker:
    """One worker process and its control socket."""

    def __init__(self, user: str, uid: int, process, control: socket.socket,
                 client_pid):
        self.user = user
        self.uid = uid
        self.process = process
        self.control = control
        self.client_pid = client_pid  # pid of the client that caused the spawn
        self.state = "idle"  # idle | busy | dead
        self.lease_id = None
        self.lease_conn = None
        self.lease_started = 0.0
        self.release_deadline = None  # set when the lease's client disconnects
        self.spawned_at = time.monotonic()
        self.last_idle = time.monotonic()
        self.send_lock = threading.Lock()  # control-socket writes

    @property
    def pid(self):
        return self.process.pid


class ClientConn:
    def __init__(self, sock: socket.socket):
        self.sock = sock
        self.pid = None  # from hello
        self.spawn_times: deque = deque()
        self.alive = True


class Supervisor:
    def __init__(self, cfg: SupervisorConfig):
        self.cfg = cfg
        self.privileged = not cfg.unprivileged
        self._lock = threading.Condition()
        self._workers: dict[str, list[Worker]] = {}
        self._waiters: dict[str, deque] = {}
        self._queued: dict[str, int] = {}
        self._spawns_total = 0
        self._lease_seq = 0
        self._user_re = re.compile(cfg.user_regex)
        self._listener: socket.socket | None = None
        self._shutdown = False

    # -- startup -------------------------------------------------------------

    def startup_checks(self) -> None:
        if os.geteuid() == 0 and self.cfg.unprivileged:
            raise SystemExit("--unprivileged is refused when running as root")
        if not self.privileged:
            return
        if not self.cfg.socket_group:
            raise SystemExit("--socket-group is required in privileged mode")
        try:
            grp.getgrnam(self.cfg.socket_group)
        except KeyError:
            raise SystemExit(f"socket group does not exist: {self.cfg.socket_group}")
        sock_dir = os.path.dirname(self.cfg.socket_path) or "."
        if not os.path.isdir(sock_dir):
            raise SystemExit(f"socket directory does not exist: {sock_dir}")
        if os.stat(sock_dir).st_mode & stat.S_IWOTH:
            raise SystemExit(f"socket directory is world-writable: {sock_dir}")
        self._check_code_ownership()
        if self.cfg.worker_python != sys.executable:
            logger.warning("worker python overridden in privileged mode: %s",
                           self.cfg.worker_python)

    def _check_code_ownership(self) -> None:
        """The supervisor runs the fileglancer package as other users; that
        code must not be writable by less-trusted accounts (spec §5.3/§10.4)."""
        import fileglancer.user_worker as uw
        path = os.path.dirname(os.path.abspath(uw.__file__))
        while True:
            st = os.stat(path)
            if st.st_mode & stat.S_IWOTH and not st.st_mode & stat.S_ISVTX:
                raise SystemExit(f"worker code path is world-writable: {path}")
            if st.st_mode & stat.S_IWGRP:
                try:
                    group = grp.getgrgid(st.st_gid).gr_name
                except KeyError:
                    group = str(st.st_gid)
                logger.warning(
                    "worker code path %s is writable by group %s; the web-app "
                    "service account must not be a member of that group", path, group)
            parent = os.path.dirname(path)
            if parent == path:
                break
            path = parent

    def _bind(self) -> None:
        path = self.cfg.socket_path
        if os.path.exists(path):
            probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            try:
                probe.connect(path)
            except OSError:
                os.unlink(path)  # stale socket
            else:
                raise SystemExit(f"a supervisor is already listening on {path}")
            finally:
                probe.close()
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(path)
        if self.cfg.socket_group:
            gid = grp.getgrnam(self.cfg.socket_group).gr_gid
            os.chown(path, -1, gid)
            os.chmod(path, 0o660)
        listener.listen(64)
        self._listener = listener

    def run(self) -> None:
        configure_logging(self.cfg.log_level, self.cfg.log_format)
        self.startup_checks()
        self._bind()
        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGTERM, self._on_sigterm)
            signal.signal(signal.SIGINT, self._on_sigterm)
        threading.Thread(target=self._reaper, daemon=True, name="reaper").start()
        logger.info("supervisor ready pid=%s privileged=%s socket=%s config=%s",
                    os.getpid(), self.privileged, self.cfg.socket_path, self.cfg)
        try:
            while not self._shutdown:
                try:
                    conn_sock, _ = self._listener.accept()
                except OSError:
                    break
                threading.Thread(target=self._handle_client,
                                 args=(ClientConn(conn_sock),), daemon=True).start()
        finally:
            self._shutdown_workers()
            try:
                os.unlink(self.cfg.socket_path)
            except OSError:
                pass
        logger.info("supervisor exiting")

    def _on_sigterm(self, _signum, _frame):
        self.stop()

    def stop(self) -> None:
        self._shutdown = True
        if self._listener is not None:
            self._listener.close()

    def _shutdown_workers(self) -> None:
        with self._lock:
            workers = [w for ws in self._workers.values() for w in ws]
            self._workers.clear()
            self._lock.notify_all()
        for w in workers:
            self._ask_shutdown(w)
        deadline = time.monotonic() + 10
        for w in workers:
            try:
                w.process.wait(timeout=max(0.1, deadline - time.monotonic()))
            except Exception:
                w.process.kill()

    # -- client connections ---------------------------------------------------

    def _handle_client(self, conn: ClientConn) -> None:
        try:
            while True:
                try:
                    msg, fds = recv_msg(conn.sock)
                except (ConnectionError, OSError):
                    break
                for fd in fds:
                    os.close(fd)
                if msg is None:
                    break
                try:
                    self._dispatch(conn, msg)
                except (ConnectionError, OSError):
                    break
                except Exception:
                    logger.exception("error handling %s from client %s",
                                     msg.get("op"), conn.pid)
                    break
        finally:
            self._client_disconnected(conn)
            conn.sock.close()

    def _dispatch(self, conn: ClientConn, msg: dict) -> None:
        op = msg.get("op")
        if op == "hello":
            conn.pid = msg.get("pid")
            send_msg(conn.sock, {
                "ok": True, "protocol": PROTOCOL_VERSION,
                "privileged": self.privileged,
                "version": _fileglancer_version(),
                "workers_per_user": self.cfg.workers_per_user,
                "max_workers": self.cfg.max_workers,
            })
        elif op == "acquire":
            reply, fd = self._acquire(conn, msg)
            try:
                send_msg(conn.sock, reply, fd=fd)
            finally:
                if fd is not None:
                    os.close(fd)
        elif op == "status":
            send_msg(conn.sock, self._status())
        elif op == "ping":
            send_msg(conn.sock, {"ok": True})
        else:
            send_msg(conn.sock, {"ok": False, "code": "protocol",
                                 "error": f"unknown op: {op}"})

    def _client_disconnected(self, conn: ClientConn) -> None:
        conn.alive = False
        now = time.monotonic()
        with self._lock:
            for ws in self._workers.values():
                for w in ws:
                    if w.state == "busy" and w.lease_conn is conn:
                        w.release_deadline = now + _DISCONNECT_GRACE

    # -- acquire --------------------------------------------------------------

    def _acquire(self, conn: ClientConn, msg: dict) -> tuple[dict, int | None]:
        if msg.get("kind") != "worker":
            return {"ok": False, "code": "unsupported_kind",
                    "error": f"unsupported kind: {msg.get('kind')}"}, None
        user = msg.get("user")
        err = self._validate_user(user)
        if err is not None:
            code, text = err
            logger.info("acquire denied user=%s client=%s code=%s: %s",
                        user, conn.pid, code, text)
            return {"ok": False, "code": code, "error": text}, None

        timeout = max(0.0, float(msg.get("timeout_ms", 10000)) / 1000.0)
        deadline = time.monotonic() + timeout
        with self._lock:
            q = self._waiters.setdefault(user, deque())
            ticket = object()
            q.append(ticket)
            self._queued[user] = self._queued.get(user, 0) + 1
            try:
                while True:
                    worker = error = None
                    if q[0] is ticket:
                        worker, error = self._try_lease(conn, user)
                    if worker is not None:
                        lease_id = self._next_lease(worker, conn)
                        break
                    if error is not None:
                        return error, None
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        return {"ok": False, "code": "timeout",
                                "error": f"no worker for {user} within {timeout}s"}, None
                    self._lock.wait(remaining)
            finally:
                q.remove(ticket)
                self._queued[user] -= 1
                if not q:
                    del self._waiters[user]
                    del self._queued[user]
                self._lock.notify_all()

        # Hand the worker its end of a fresh socketpair, the client ours.
        client_end, worker_end = socket.socketpair()
        try:
            with worker.send_lock:
                send_msg(worker.control, {"op": "serve", "lease": lease_id},
                         fd=worker_end.fileno())
        except OSError as e:
            client_end.close()
            self._remove_worker(worker, f"serve failed: {e}")
            return {"ok": False, "code": "spawn_failed",
                    "error": f"worker unusable: {e}"}, None
        finally:
            worker_end.close()
        fd = client_end.detach()
        return {"ok": True, "lease": lease_id, "worker_pid": worker.pid}, fd

    def _next_lease(self, worker: Worker, conn: ClientConn) -> str:
        self._lease_seq += 1
        lease_id = f"L-{self._lease_seq:06d}"
        worker.state = "busy"
        worker.lease_id = lease_id
        worker.lease_conn = conn
        worker.lease_started = time.monotonic()
        worker.release_deadline = None
        return lease_id

    def _try_lease(self, conn: ClientConn, user: str):
        """One leasing attempt; caller holds the lock.

        Returns (worker, None) on success, (None, error_reply) on a hard
        refusal, (None, None) to keep waiting.
        """
        for w in self._workers.get(user, []):
            if w.state == "idle":
                return w, None
        nuser = len(self._workers.get(user, []))
        if nuser >= self.cfg.workers_per_user:
            return None, None  # queue behind this user's busy workers
        total = sum(len(ws) for ws in self._workers.values())
        if total >= self.cfg.max_workers:
            victim = self._lru_idle_worker()
            if victim is None:
                return None, {"ok": False, "code": "capacity",
                              "error": "worker pool at capacity with no idle workers"}
            self._remove_worker_locked(victim, "evicted (capacity)")
        now = time.monotonic()
        while conn.spawn_times and now - conn.spawn_times[0] > 60:
            conn.spawn_times.popleft()
        if len(conn.spawn_times) >= self.cfg.spawn_rate:
            return None, {"ok": False, "code": "rate_limited",
                          "error": "spawn rate limit exceeded"}
        conn.spawn_times.append(now)
        try:
            worker = self._spawn(user, conn)
        except Exception as e:
            logger.exception("spawn failed for %s", user)
            return None, {"ok": False, "code": "spawn_failed", "error": str(e)}
        self._workers.setdefault(user, []).append(worker)
        return worker, None

    def _lru_idle_worker(self) -> Worker | None:
        idle = [w for ws in self._workers.values() for w in ws if w.state == "idle"]
        return min(idle, key=lambda w: w.last_idle) if idle else None

    # -- validation -----------------------------------------------------------

    def _validate_user(self, user):
        if not user or not isinstance(user, str) or not self._user_re.match(user):
            return "invalid_user", f"invalid username: {user!r}"
        if not self.privileged:
            return None  # workers run as our own uid; identity rules don't apply
        try:
            pw = pwd.getpwnam(user)
        except KeyError:
            return "invalid_user", f"unknown user: {user}"
        if pw.pw_uid == 0 or pw.pw_uid < self.cfg.min_uid:
            return "invalid_user", f"uid {pw.pw_uid} below minimum {self.cfg.min_uid}"
        if pw.pw_shell in self.cfg.denied_shells:
            return "invalid_user", f"login shell {pw.pw_shell} is denied"
        if self.cfg.allowed_groups:
            gids = set(os.getgrouplist(user, pw.pw_gid))
            allowed = set()
            for name in self.cfg.allowed_groups:
                try:
                    allowed.add(grp.getgrnam(name).gr_gid)
                except KeyError:
                    pass
            if not gids & allowed:
                return "denied", f"user {user} is not in an allowed group"
        return None

    # -- spawning and lifecycle -----------------------------------------------

    def _spawn(self, user: str, conn: ClientConn) -> Worker:
        process, control, uid = spawn_worker(
            user,
            privileged=self.privileged,
            env_passthrough=self.cfg.env_passthrough,
            log_level=self.cfg.log_level,
            log_format=self.cfg.log_format,
            worker_python=self.cfg.worker_python,
        )
        worker = Worker(user, uid, process, control, conn.pid)
        self._spawns_total += 1
        logger.info("spawned worker user=%s pid=%s uid=%s client=%s",
                    user, process.pid, uid, conn.pid)
        threading.Thread(target=self._worker_reader, args=(worker,),
                         daemon=True, name=f"worker-{process.pid}").start()
        threading.Thread(target=self._forward_stderr, args=(worker,),
                         daemon=True, name=f"stderr-{process.pid}").start()
        return worker

    def _worker_reader(self, worker: Worker) -> None:
        """Read ready/idle messages from one worker until EOF, then reap it."""
        while True:
            try:
                msg, fds = recv_msg(worker.control)
            except (ConnectionError, OSError):
                msg = None
                fds = []
            for fd in fds:
                os.close(fd)
            if msg is None:
                break
            op = msg.get("op")
            if op == "ready":
                logger.debug("worker ready user=%s pid=%s uid=%s",
                             worker.user, worker.pid, msg.get("uid"))
            elif op == "idle":
                with self._lock:
                    worker.state = "idle"
                    worker.lease_id = None
                    worker.lease_conn = None
                    worker.release_deadline = None
                    worker.last_idle = time.monotonic()
                    self._lock.notify_all()
        try:
            worker.process.wait(timeout=10)
        except Exception:
            worker.process.kill()
        self._remove_worker(worker, f"exited rc={worker.process.returncode}")

    def _forward_stderr(self, worker: Worker) -> None:
        try:
            for line in worker.process.stderr:
                logger.debug("[worker:%s] %s", worker.user,
                             line.decode(errors="replace").rstrip())
        except Exception:
            pass

    def _remove_worker(self, worker: Worker, reason: str) -> None:
        with self._lock:
            self._remove_worker_locked(worker, reason)

    def _remove_worker_locked(self, worker: Worker, reason: str) -> None:
        ws = self._workers.get(worker.user, [])
        if worker not in ws:
            return  # already removed
        ws.remove(worker)
        if not ws:
            self._workers.pop(worker.user, None)
        was_dead = worker.state == "dead"
        worker.state = "dead"
        self._lock.notify_all()
        if not was_dead:
            logger.info("worker removed user=%s pid=%s reason=%s",
                        worker.user, worker.pid, reason)
            threading.Thread(target=self._kill_worker, args=(worker,),
                             daemon=True).start()

    def _ask_shutdown(self, worker: Worker) -> None:
        try:
            with worker.send_lock:
                send_msg(worker.control, {"op": "shutdown"})
        except OSError:
            pass

    def _kill_worker(self, worker: Worker) -> None:
        """Staged stop: shutdown message, then SIGTERM, then SIGKILL."""
        self._ask_shutdown(worker)
        try:
            worker.process.wait(timeout=5)
        except Exception:
            worker.process.terminate()
            try:
                worker.process.wait(timeout=5)
            except Exception:
                worker.process.kill()
                worker.process.wait()
        try:
            worker.control.close()
        except OSError:
            pass

    def _reaper(self) -> None:
        interval = max(0.1, min(30.0, self.cfg.idle_timeout / 2,
                                self.cfg.lease_max_seconds / 2))
        while not self._shutdown:
            time.sleep(interval)
            now = time.monotonic()
            with self._lock:
                stale = []
                for ws in list(self._workers.values()):
                    for w in list(ws):
                        if w.state == "idle" and now - w.last_idle > self.cfg.idle_timeout:
                            stale.append((w, "idle timeout"))
                        elif w.state == "busy" and now - w.lease_started > self.cfg.lease_max_seconds:
                            logger.warning(
                                "lease_expired lease=%s user=%s pid=%s client=%s",
                                w.lease_id, w.user, w.pid,
                                w.lease_conn.pid if w.lease_conn else None)
                            stale.append((w, "lease expired"))
                        elif (w.state == "busy" and w.release_deadline is not None
                              and now > w.release_deadline):
                            stale.append((w, "client disconnected"))
                for w, reason in stale:
                    self._remove_worker_locked(w, reason)

    # -- status ---------------------------------------------------------------

    def _status(self) -> dict:
        now = time.monotonic()
        with self._lock:
            workers = []
            leases = 0
            for ws in self._workers.values():
                for w in ws:
                    if w.state == "busy":
                        leases += 1
                    workers.append({
                        "user": w.user,
                        "pid": w.pid,
                        "uid": w.uid,
                        "state": w.state,
                        "lease": w.lease_id,
                        "idle_for": round(now - w.last_idle, 1) if w.state == "idle" else 0,
                        "age": round(now - w.spawned_at, 1),
                    })
            queued = {u: n for u, n in self._queued.items() if n}
            return {
                "ok": True,
                "privileged": self.privileged,
                "workers": workers,
                "queued": queued,
                "leases": leases,
                "spawns_total": self._spawns_total,
                "limits": {
                    "workers_per_user": self.cfg.workers_per_user,
                    "max_workers": self.cfg.max_workers,
                    "idle_timeout": self.cfg.idle_timeout,
                    "lease_max_seconds": self.cfg.lease_max_seconds,
                },
            }


def _fileglancer_version() -> str:
    try:
        from importlib.metadata import version
        return version("fileglancer")
    except Exception:
        return "unknown"
