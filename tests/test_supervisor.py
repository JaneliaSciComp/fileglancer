"""Tests for the fileglancer-supervisor: protocol framing, pool policy,
worker lifecycle and the web-app client. No root needed: the supervisor
runs --unprivileged, so workers run as the test user.
"""

import getpass
import os
import socket
import struct
import subprocess
import sys
import threading
import asyncio
import time

import pytest

from fileglancer.supervisor import server as server_module
from fileglancer.supervisor.config import SupervisorConfig
from fileglancer.supervisor.protocol import (
    HEADER_FMT,
    HEADER_SIZE,
    ProtocolError,
    recv_msg,
    send_msg,
)
from fileglancer.supervisor.server import Supervisor
from fileglancer.supervisor.spawn import build_worker_env


def wait_for(predicate, timeout=10.0, interval=0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


# ---------------------------------------------------------------------------
# Protocol framing
# ---------------------------------------------------------------------------

class TestProtocolFraming:

    def test_roundtrip(self):
        a, b = socket.socketpair()
        try:
            msg = {"op": "test", "value": 42, "nested": {"key": "val"}}
            send_msg(a, msg)
            result, fds = recv_msg(b)
            assert result == msg
            assert fds == []
        finally:
            a.close()
            b.close()

    def test_multiple_messages(self):
        a, b = socket.socketpair()
        try:
            for i in range(10):
                send_msg(a, {"seq": i})
            for i in range(10):
                result, _ = recv_msg(b)
                assert result == {"seq": i}
        finally:
            a.close()
            b.close()

    def test_large_message(self):
        a, b = socket.socketpair()
        try:
            # Larger than the socketpair buffer, so send runs concurrently.
            msg = {"data": "x" * 1_000_000}
            t = threading.Thread(target=send_msg, args=(a, msg))
            t.start()
            result, _ = recv_msg(b)
            t.join()
            assert result == msg
        finally:
            a.close()
            b.close()

    def test_partial_reads(self):
        """A frame trickling in a few bytes at a time is reassembled."""
        import json
        a, b = socket.socketpair()
        try:
            payload = json.dumps({"op": "slow"}).encode()
            frame = struct.pack(HEADER_FMT, len(payload)) + payload

            def dribble():
                for i in range(len(frame)):
                    a.sendall(frame[i:i + 1])
                    time.sleep(0.001)

            t = threading.Thread(target=dribble)
            t.start()
            result, _ = recv_msg(b)
            t.join()
            assert result == {"op": "slow"}
        finally:
            a.close()
            b.close()

    def test_clean_eof_returns_none(self):
        a, b = socket.socketpair()
        a.close()
        msg, fds = recv_msg(b)
        assert msg is None and fds == []
        b.close()

    def test_eof_mid_frame_raises(self):
        a, b = socket.socketpair()
        a.sendall(struct.pack(HEADER_FMT, 100) + b"partial")
        a.close()
        with pytest.raises(ConnectionError):
            recv_msg(b)
        b.close()

    def test_oversized_frame_rejected(self):
        a, b = socket.socketpair()
        a.sendall(struct.pack(HEADER_FMT, 2 ** 31))
        with pytest.raises(ProtocolError):
            recv_msg(b)
        a.close()
        b.close()

    def test_fd_passing(self, tmp_path):
        content = "hello from fd passing"
        path = tmp_path / "f.txt"
        path.write_text(content)
        a, b = socket.socketpair()
        try:
            fd = os.open(path, os.O_RDONLY)
            try:
                send_msg(a, {"type": "handle"}, fd=fd)
            finally:
                os.close(fd)
            msg, fds = recv_msg(b)
            assert msg == {"type": "handle"}
            assert len(fds) == 1
            with os.fdopen(fds[0]) as f:
                assert f.read() == content
        finally:
            a.close()
            b.close()


# ---------------------------------------------------------------------------
# Env allowlist (moved from test_worker.py)
# ---------------------------------------------------------------------------

class TestBuildWorkerEnv:
    """Worker environment is an allowlist: no server secret reaches the user."""

    def test_strips_all_fgc_variables(self):
        base = {
            "PATH": "/usr/bin",
            "FGC_DB_URL": "postgresql://admin:pw@db/fg",
            "FGC_SESSION_SECRET_KEY": "super-secret",
            "FGC_OKTA_CLIENT_SECRET": "okta-secret",
            "FGC_ATLASSIAN_TOKEN": "atlassian-secret",
            "fgc_test_api_key": "lowercase-secret",
        }
        env = build_worker_env(base, "/home/user", "INFO", 7)
        for key in list(env):
            assert not key.upper().startswith("FGC_") or key in (
                "FGC_LOG_LEVEL",
                "FGC_LOG_FORMAT",
                "FGC_WORKER_FD",
            ), f"secret leaked: {key}"
        # The specific secrets are gone regardless of case.
        assert "FGC_DB_URL" not in env
        assert "FGC_SESSION_SECRET_KEY" not in env
        assert "FGC_OKTA_CLIENT_SECRET" not in env
        assert "FGC_ATLASSIAN_TOKEN" not in env
        assert "fgc_test_api_key" not in env

    def test_drops_generic_deployment_secrets(self):
        # Non-FGC secrets that may sit in a server's environment must not reach
        # the user's worker either.
        base = {
            "PATH": "/usr/bin:/bin",
            "AWS_SECRET_ACCESS_KEY": "aws-secret",
            "AWS_SESSION_TOKEN": "aws-token",
            "GITHUB_TOKEN": "gh-secret",
            "DATABASE_URL": "postgres://u:pw@h/db",
            "MY_APP_CREDENTIALS": "creds",
        }
        env = build_worker_env(base, "/home/user", "INFO", 7)
        assert env["PATH"] == "/usr/bin:/bin"  # allowlisted, kept
        assert "AWS_SECRET_ACCESS_KEY" not in env
        assert "AWS_SESSION_TOKEN" not in env
        assert "GITHUB_TOKEN" not in env
        assert "DATABASE_URL" not in env
        assert "MY_APP_CREDENTIALS" not in env

    def test_preserves_allowlisted_and_sets_operational_vars(self):
        base = {
            "PATH": "/usr/bin:/bin",
            "LSF_ENVDIR": "/opt/lsf/conf",       # LSF_ prefix
            "LSB_JOBID": "42",                    # LSB_ prefix
            "SLURM_CONF": "/etc/slurm.conf",      # SLURM_ prefix
            "MODULEPATH": "/opt/modules",         # MODULE prefix
            "CONDA_EXE": "/opt/conda/bin/conda",  # CONDA_ prefix
            "APPTAINER_CACHEDIR": "/scratch/ac",  # APPTAINER_ prefix
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8",              # LC_ prefix
            "SSH_AUTH_SOCK": "/tmp/ssh-agent.sock",
            "HTTPS_PROXY": "http://proxy:8080",
        }
        env = build_worker_env(base, "/home/alice", "DEBUG", 9)
        for key in base:
            assert key in env, f"{key} should be allowlisted"
        # Operational vars the worker needs are set explicitly.
        assert env["HOME"] == "/home/alice"
        assert env["FGC_LOG_LEVEL"] == "DEBUG"
        assert env["FGC_LOG_FORMAT"] == "text"
        assert env["FGC_WORKER_FD"] == "9"

    def test_passthrough_allows_site_specific_names_and_prefixes(self):
        base = {
            "PATH": "/usr/bin",
            "SITE_LICENSE_SERVER": "27000@lic",  # exact name
            "ACME_FOO": "a",                       # ACME_ prefix
            "ACME_BAR": "b",
            "OTHER_VAR": "dropped",
        }
        env = build_worker_env(
            base, "/home/user", "INFO", 7,
            passthrough=["SITE_LICENSE_SERVER", "ACME_"],
        )
        assert env["SITE_LICENSE_SERVER"] == "27000@lic"
        assert env["ACME_FOO"] == "a"
        assert env["ACME_BAR"] == "b"
        assert "OTHER_VAR" not in env  # not allowlisted, not in passthrough

    def test_passthrough_cannot_reintroduce_fgc_secrets(self):
        base = {"FGC_SESSION_SECRET_KEY": "super-secret"}
        env = build_worker_env(
            base, "/home/user", "INFO", 7,
            passthrough=["FGC_SESSION_SECRET_KEY", "FGC_"],
        )
        assert "FGC_SESSION_SECRET_KEY" not in env


# ---------------------------------------------------------------------------
# Import hygiene
# ---------------------------------------------------------------------------

def test_supervisor_imports_only_stdlib():
    """The privileged code must not drag in web dependencies (spec §5.1)."""
    code = (
        "import sys, fileglancer.supervisor.server, fileglancer.supervisor.config, "
        "fileglancer.supervisor.protocol, fileglancer.supervisor.spawn; "
        "bad=[m for m in sys.modules if m.split('.')[0] in "
        "{'fastapi','starlette','pydantic','sqlalchemy','loguru','yaml',"
        "'uvicorn','httpx','cachetools'}]; "
        "assert not bad, bad"
    )
    subprocess.run([sys.executable, "-c", code], check=True)


# ---------------------------------------------------------------------------
# Supervisor pool policy and worker lifecycle (real workers, no root)
# ---------------------------------------------------------------------------

@pytest.fixture
def run_supervisor(tmp_path):
    """Factory starting a Supervisor thread on a socket under tmp_path."""
    started = []

    def _start(**overrides):
        overrides.setdefault("socket_path", str(tmp_path / "sup.sock"))
        cfg = SupervisorConfig(unprivileged=True, log_level="DEBUG", **overrides)
        sup = Supervisor(cfg)
        t = threading.Thread(target=sup.run, daemon=True)
        t.start()
        assert wait_for(lambda: os.path.exists(cfg.socket_path)), "supervisor did not bind"
        started.append((sup, t))
        return cfg

    yield _start

    for sup, t in started:
        sup.stop()
        t.join(timeout=15)


def connect(cfg):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(cfg.socket_path)
    sock.settimeout(60)
    send_msg(sock, {"op": "hello", "protocol": 1, "client": "test", "pid": os.getpid()})
    hello, _ = recv_msg(sock)
    assert hello["ok"]
    return sock, hello


def acquire(sock, user, timeout_ms=30000):
    send_msg(sock, {"op": "acquire", "kind": "worker", "user": user,
                    "timeout_ms": timeout_ms})
    return recv_msg(sock)


def get_status(sock):
    send_msg(sock, {"op": "status"})
    status, _ = recv_msg(sock)
    return status


def lease_socket(fds):
    sock = socket.socket(fileno=fds[0])
    for extra in fds[1:]:
        os.close(extra)
    sock.settimeout(60)
    return sock


class TestSupervisorLifecycle:

    def test_hello_reports_unprivileged(self, run_supervisor):
        cfg = run_supervisor()
        sock, hello = connect(cfg)
        assert hello["privileged"] is False
        assert hello["protocol"] == 1
        sock.close()

    def test_acquire_serve_execute_release_idle_cycle(self, run_supervisor):
        """The full §13 cycle, with the real fileglancer.user_worker module."""
        cfg = run_supervisor()
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, getpass.getuser())
            assert reply["ok"], reply
            assert reply["lease"].startswith("L-")
            lease = lease_socket(fds)
            send_msg(lease, {"action": "get_profile", "file_share_paths": []})
            result, _ = recv_msg(lease)
            assert result["username"] == getpass.getuser()
            lease.close()
            # Worker reports idle once the lease socket closes.
            assert wait_for(lambda: any(
                w["state"] == "idle" for w in get_status(sock)["workers"]))
        finally:
            sock.close()

    def test_fd_passing_through_lease(self, run_supervisor, tmp_path):
        """open_file's fd arrives through the lease socket via SCM_RIGHTS."""
        content = "streamed through a lease"
        (tmp_path / "data.txt").write_text(content)
        fsp = {"zone": "t", "name": "leasefsp", "mount_path": str(tmp_path)}
        cfg = run_supervisor()
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, getpass.getuser())
            assert reply["ok"], reply
            lease = lease_socket(fds)
            send_msg(lease, {"action": "open_file", "fsp_name": "leasefsp",
                             "subpath": "data.txt", "file_share_paths": [fsp]})
            result, rfds = recv_msg(lease)
            assert result["file_size"] == len(content)
            assert len(rfds) == 1
            with os.fdopen(rfds[0]) as f:
                assert f.read() == content
            lease.close()
        finally:
            sock.close()

    def test_two_leases_reuse_one_worker(self, run_supervisor):
        cfg = run_supervisor()
        sock, _ = connect(cfg)
        try:
            pids = []
            for _ in range(2):
                reply, fds = acquire(sock, getpass.getuser())
                assert reply["ok"], reply
                pids.append(reply["worker_pid"])
                lease = lease_socket(fds)
                send_msg(lease, {"action": "get_profile", "file_share_paths": []})
                result, _ = recv_msg(lease)
                assert "username" in result
                lease.close()
                assert wait_for(lambda: any(
                    w["state"] == "idle" for w in get_status(sock)["workers"]))
            assert pids[0] == pids[1]
        finally:
            sock.close()

    def test_workers_per_user_two_pids_third_queues_and_times_out(self, run_supervisor):
        cfg = run_supervisor(workers_per_user=2)
        sock, _ = connect(cfg)
        leases = []
        try:
            pids = set()
            for _ in range(2):
                reply, fds = acquire(sock, "alice")
                assert reply["ok"], reply
                pids.add(reply["worker_pid"])
                leases.append(lease_socket(fds))
            assert len(pids) == 2
            reply, fds = acquire(sock, "alice", timeout_ms=300)
            assert reply == {"ok": False, "code": "timeout",
                             "error": reply["error"]}
        finally:
            for lease in leases:
                lease.close()
            sock.close()

    def test_host_cap_evicts_lru_idle_worker_of_another_user(self, run_supervisor):
        cfg = run_supervisor(max_workers=1)
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            alice_pid = reply["worker_pid"]
            lease_socket(fds).close()
            assert wait_for(lambda: any(
                w["state"] == "idle" for w in get_status(sock)["workers"]))

            reply, fds = acquire(sock, "bob")
            assert reply["ok"], reply
            lease_socket(fds).close()
            status = get_status(sock)
            users = {w["user"] for w in status["workers"]}
            assert "bob" in users and "alice" not in users
            assert reply["worker_pid"] != alice_pid
        finally:
            sock.close()

    def test_capacity_when_nothing_is_idle(self, run_supervisor):
        cfg = run_supervisor(max_workers=1)
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            lease = lease_socket(fds)  # held: alice's worker stays busy
            reply, _ = acquire(sock, "bob", timeout_ms=30000)
            assert reply["ok"] is False
            assert reply["code"] == "capacity"
            lease.close()
        finally:
            sock.close()

    def test_rate_limited(self, run_supervisor):
        cfg = run_supervisor(spawn_rate=1)
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            lease_socket(fds).close()
            reply, _ = acquire(sock, "bob")
            assert reply == {"ok": False, "code": "rate_limited",
                             "error": reply["error"]}
        finally:
            sock.close()

    def test_unsupported_kind(self, run_supervisor):
        cfg = run_supervisor()
        sock, _ = connect(cfg)
        try:
            send_msg(sock, {"op": "acquire", "kind": "dataserver", "user": "x"})
            reply, _ = recv_msg(sock)
            assert reply["code"] == "unsupported_kind"
        finally:
            sock.close()

    def test_idle_reaping(self, run_supervisor):
        cfg = run_supervisor(idle_timeout=0.5)
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            lease_socket(fds).close()
            assert wait_for(lambda: not get_status(sock)["workers"], timeout=15)
        finally:
            sock.close()

    def test_lease_max_seconds_kills_the_worker(self, run_supervisor):
        cfg = run_supervisor(lease_max_seconds=0.5)
        sock, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            lease = lease_socket(fds)
            # Hold the lease without using it; the supervisor's safety net
            # kills the worker and we see EOF on the lease socket.
            msg, _ = recv_msg(lease)
            assert msg is None
            assert wait_for(lambda: not get_status(sock)["workers"], timeout=15)
            lease.close()
        finally:
            sock.close()

    def test_client_disconnect_releases_lease(self, run_supervisor):
        cfg = run_supervisor()
        sock, _ = connect(cfg)
        watcher, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            lease = lease_socket(fds)
            # Simulate the client process dying: both its supervisor
            # connection and its lease fd close.
            sock.close()
            lease.close()
            assert wait_for(lambda: all(
                w["state"] == "idle" for w in get_status(watcher)["workers"]))
        finally:
            watcher.close()

    def test_worker_ignoring_eof_is_killed_after_grace(self, run_supervisor, monkeypatch):
        monkeypatch.setattr(server_module, "_DISCONNECT_GRACE", 0.3)
        # Short idle timeout only to shrink the reaper's polling interval.
        cfg = run_supervisor(idle_timeout=5.0)
        sock, _ = connect(cfg)
        watcher, _ = connect(cfg)
        try:
            reply, fds = acquire(sock, "alice")
            assert reply["ok"], reply
            lease = lease_socket(fds)
            # Drop only the supervisor connection, keeping the lease open: the
            # worker sees no EOF and stays busy, so after the grace period the
            # supervisor kills it (shutdown message, then signals).
            sock.close()
            assert wait_for(lambda: not get_status(watcher)["workers"], timeout=30)
            lease.close()
        finally:
            watcher.close()


class TestUserValidation:

    def _supervisor(self, **overrides):
        cfg = SupervisorConfig(socket_path="/nonexistent", unprivileged=True,
                               **overrides)
        return Supervisor(cfg)

    def test_regex_failure(self):
        sup = self._supervisor()
        code, _ = sup._validate_user("bad name!")
        assert code == "invalid_user"

    def test_unprivileged_skips_identity_rules(self):
        sup = self._supervisor()
        assert sup._validate_user("any.user") is None

    def _fake_pwd(self, monkeypatch, uid=2000, shell="/bin/bash", gid=2000):
        import types
        entry = types.SimpleNamespace(pw_uid=uid, pw_gid=gid, pw_shell=shell,
                                      pw_dir="/home/u", pw_name="u")

        class FakePwd:
            @staticmethod
            def getpwnam(name):
                if name == "known":
                    return entry
                raise KeyError(name)

        monkeypatch.setattr(server_module, "pwd", FakePwd)
        return entry

    def test_unknown_user(self, monkeypatch):
        self._fake_pwd(monkeypatch)
        sup = self._supervisor()
        sup.privileged = True
        code, _ = sup._validate_user("stranger")
        assert code == "invalid_user"

    def test_uid_below_minimum(self, monkeypatch):
        self._fake_pwd(monkeypatch, uid=500)
        sup = self._supervisor(min_uid=1000)
        sup.privileged = True
        code, _ = sup._validate_user("known")
        assert code == "invalid_user"

    def test_root_always_refused(self, monkeypatch):
        self._fake_pwd(monkeypatch, uid=0)
        sup = self._supervisor(min_uid=0)
        sup.privileged = True
        code, _ = sup._validate_user("known")
        assert code == "invalid_user"

    def test_denied_shell(self, monkeypatch):
        self._fake_pwd(monkeypatch, shell="/sbin/nologin")
        sup = self._supervisor()
        sup.privileged = True
        code, _ = sup._validate_user("known")
        assert code == "invalid_user"

    def test_allowed_group_denies_nonmember(self, monkeypatch):
        self._fake_pwd(monkeypatch)
        monkeypatch.setattr(server_module.os, "getgrouplist",
                            lambda user, gid: [gid])
        import types
        monkeypatch.setattr(server_module, "grp", types.SimpleNamespace(
            getgrnam=lambda name: types.SimpleNamespace(gr_gid=9999)))
        sup = self._supervisor(allowed_groups=["staff"])
        sup.privileged = True
        code, _ = sup._validate_user("known")
        assert code == "denied"

    def test_valid_user_passes(self, monkeypatch):
        self._fake_pwd(monkeypatch)
        sup = self._supervisor()
        sup.privileged = True
        assert sup._validate_user("known") is None


# ---------------------------------------------------------------------------
# SupervisedWorkerPool (web-app client) against an embedded supervisor
# ---------------------------------------------------------------------------

@pytest.fixture
def embedded_settings(tmp_path, monkeypatch):
    from fileglancer.settings import Settings
    from fileglancer import worker_pool as wp
    monkeypatch.setattr(wp, "_fetch_fsp_rows", lambda db_url: [
        {"zone": "t", "name": "poolfsp", "mount_path": str(tmp_path)}])
    return Settings(
        db_url="sqlite://",
        file_share_mounts=[],
        supervisor_mode="embedded",
        supervisor_socket=str(tmp_path / "embedded.sock"),
    )


class TestSupervisedWorkerPool:

    @pytest.mark.asyncio
    async def test_execute_and_fd_passing(self, embedded_settings, tmp_path):
        from fileglancer.worker_pool import SupervisedWorkerPool
        (tmp_path / "pool.txt").write_text("via the pool")
        pool = SupervisedWorkerPool(embedded_settings)
        await pool.start()
        try:
            assert pool.hello["privileged"] is False
            result = await pool.execute(getpass.getuser(), "get_profile")
            assert result["username"] == getpass.getuser()

            result = await pool.execute(getpass.getuser(), "open_file",
                                        fsp_name="poolfsp", subpath="pool.txt")
            fh = result.pop("_file_handle")
            assert fh.read().decode() == "via the pool"
            fh.close()
        finally:
            await pool.stop()

    @pytest.mark.asyncio
    async def test_worker_error_translation(self, embedded_settings):
        from fileglancer.worker_pool import SupervisedWorkerPool, WorkerError
        pool = SupervisedWorkerPool(embedded_settings)
        await pool.start()
        try:
            with pytest.raises(WorkerError) as exc:
                await pool.execute(getpass.getuser(), "open_file",
                                   fsp_name="poolfsp", subpath="missing.txt")
            assert exc.value.status_code == 404
        finally:
            await pool.stop()

    @pytest.mark.asyncio
    async def test_lease_carries_consecutive_actions(self, embedded_settings):
        from fileglancer.worker_pool import SupervisedWorkerPool
        pool = SupervisedWorkerPool(embedded_settings)
        await pool.start()
        try:
            async with pool.lease(getpass.getuser()) as lease:
                r1 = await lease.execute("get_profile")
                r2 = await lease.execute("get_profile")
                assert r1["username"] == r2["username"]
        finally:
            await pool.stop()

    @pytest.mark.asyncio
    async def test_two_pools_share_one_embedded_supervisor(self, embedded_settings):
        """Two uvicorn-like processes (flock path) see one worker per user."""
        from fileglancer.worker_pool import SupervisedWorkerPool
        pool1 = SupervisedWorkerPool(embedded_settings)
        pool2 = SupervisedWorkerPool(embedded_settings)
        await pool1.start()
        await pool2.start()
        try:
            assert pool2._child is None  # second pool connected, didn't spawn
            user = getpass.getuser()
            await pool1.execute(user, "get_profile")
            await pool2.execute(user, "get_profile")
            status = await pool1.status()
            assert len([w for w in status["workers"] if w["user"] == user]) == 1
        finally:
            await pool2.stop()
            await pool1.stop()

    @pytest.mark.asyncio
    async def test_busy_user_does_not_block_other_users(self, embedded_settings):
        """An acquire parked behind alice's busy worker must not hold up bob."""
        from fileglancer.worker_pool import SupervisedWorkerPool, WorkerError
        settings = embedded_settings.model_copy(update={"supervisor_acquire_timeout": 3.0})
        pool = SupervisedWorkerPool(settings)
        await pool.start()
        try:
            async with pool.lease("alice"):
                async def alice_again():
                    with pytest.raises(WorkerError, match="timeout"):
                        async with pool.lease("alice"):
                            pass
                waiting = asyncio.create_task(alice_again())
                await asyncio.sleep(0.5)  # alice's second acquire is parked in the supervisor
                t0 = time.monotonic()
                async with pool.lease("bob"):
                    pass
                assert time.monotonic() - t0 < 1.5
                await waiting
        finally:
            await pool.stop()

    @pytest.mark.asyncio
    async def test_acquire_after_supervisor_death_is_503(self, embedded_settings):
        from fileglancer.worker_pool import SupervisedWorkerPool, WorkerDead
        pool = SupervisedWorkerPool(embedded_settings)
        await pool.start()
        try:
            pool._child.kill()
            pool._child.wait()
            with pytest.raises(WorkerDead):
                await pool.execute(getpass.getuser(), "get_profile")
        finally:
            await pool.stop()


def test_access_flags_with_unprivileged_supervisor_fails_startup(tmp_path):
    """use_access_flags=true + a supervisor that reports privileged=false
    must fail app startup with a message naming the socket and mode."""
    from fastapi.testclient import TestClient
    from fileglancer.server import create_app
    from fileglancer.settings import Settings

    settings = Settings(
        db_url=f"sqlite:///{tmp_path / 'test.db'}",
        file_share_mounts=[],
        use_access_flags=True,
        supervisor_mode="embedded",
        supervisor_socket=str(tmp_path / "sup.sock"),
    )
    app = create_app(settings)
    with pytest.raises(RuntimeError, match="privileged"):
        with TestClient(app):
            pass
