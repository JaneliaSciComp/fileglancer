"""Tests for the per-user persistent worker infrastructure.

Tests the worker request/response loop (serve_lease), the legacy pool's
client side (UserWorker), and the action handlers run in-process.
Protocol framing and supervisor lifecycle tests live in test_supervisor.py.
"""

import asyncio
import inspect
import os
import socket
import tempfile
import time

import pytest

from conftest import requires_symlinks
from fileglancer.user_worker import (
    _ACTIONS,
    ACTIONS_NEEDING_FSPS,
    _action_validate_proxied_path,
    _action_create_dirs,
    _action_validate_paths,
    _action_cancel,
    serve_lease,
    WorkerContext,
)
from fileglancer.filestore import Filestore
from fileglancer.model import FileSharePath
from fileglancer.supervisor.protocol import recv_msg, send_msg
from fileglancer import worker_pool as worker_pool_module
from fileglancer.worker_pool import (
    UserWorker,
    WorkerError,
    WorkerDead,
    _send_and_recv,
    _timeout_for_action,
    _DEFAULT_REQUEST_TIMEOUT,
    _GIT_ACTION_TIMEOUT,
)


def _send(sock, msg, fd=None):
    send_msg(sock, msg, fd=fd)


def _recv(sock):
    msg, fds = recv_msg(sock)
    if msg is None:
        raise ConnectionError("peer closed")
    for fd in fds:
        os.close(fd)
    return msg


def _fsp_rows(*fsps):
    """Serialize FileSharePath models the same way the parent does."""
    return [fsp.model_dump(mode="json") for fsp in fsps]


def _with_fsps(request, *fsps):
    return {**request, "file_share_paths": _fsp_rows(*fsps)}


def test_fsp_registry_covers_every_handler_that_reads_the_list():
    """A handler reading file_share_paths must be registered as needing them.

    Otherwise the parent won't attach the list and the action fails at request
    time rather than at import time. @with_filestore reads the list on its
    handler's behalf and marks itself, so those handlers' bodies don't mention
    it (inspect.getsource follows functools.wraps to the inner function).
    """
    for name, handler in _ACTIONS.items():
        reads_directly = "_file_share_paths_from_request" in inspect.getsource(handler)
        via_decorator = getattr(handler, "_needs_fsps", False)
        assert (reads_directly or via_decorator) == (name in ACTIONS_NEEDING_FSPS), name


class TestActionTimeout:
    """Git-heavy actions get a longer receive timeout than the default."""

    def test_default_for_ordinary_action(self):
        assert _timeout_for_action("validate_paths") == _DEFAULT_REQUEST_TIMEOUT

    def test_git_actions_get_longer_ceiling(self):
        assert _GIT_ACTION_TIMEOUT > _DEFAULT_REQUEST_TIMEOUT
        for action in ("ensure_repo", "discover_manifests", "read_manifest",
                       "ensure_snapshot", "gc_snapshots", "submit"):
            assert _timeout_for_action(action) == _GIT_ACTION_TIMEOUT

    def test_ceiling_exceeds_snapshot_operation_timeout(self):
        # snapshot creation runs a 300s clone then a 300s checkout; the IPC
        # ceiling must sit above that so a valid snapshot isn't read as a
        # dead worker.
        assert _GIT_ACTION_TIMEOUT >= 600


class TestCancelAction:
    """The unified 'cancel' action stops a job through py-cluster-api.

    For the local executor the job id is the leader PID, and cancel kills the
    whole process group by PID — no fileglancer-side /proc walking. This
    exercises the real executor (py-cluster-api >= 0.8.0), not a mock.
    """

    def _ctx(self):
        return WorkerContext(username="test")

    def _spawn_orphaned_group(self):
        """Start a process group led by a process reparented to init, so
        nothing in the test process is its parent — exactly like a job whose
        submitting worker has exited (init then reaps the killed group).

        setsid() makes the child a session/group leader whose pgid equals its
        pid, so the parent already knows the group id. The child forks the real
        workload (a backgrounded sleep plus a foreground sleep, so the group
        holds more than one process) and exits, orphaning it to init.
        """
        pid = os.fork()
        if pid == 0:  # child: becomes the group leader, then bails out
            os.setsid()
            if os.fork() == 0:  # grandchild: the actual workload, same group
                os.execvp("bash", ["bash", "-c", "sleep 300 & sleep 300"])
            os._exit(0)
        os.waitpid(pid, 0)  # reap the leader; the workload lives on under init
        return pid  # == the group id (setsid set pgid == leader pid)

    def test_local_cancel_kills_process_group(self):
        pgid = self._spawn_orphaned_group()
        try:
            time.sleep(0.2)
            os.killpg(pgid, 0)  # group is alive (raises if not)

            result = _action_cancel(
                {"cluster_config": {"executor": "local"},
                 "job_id": str(pgid)},
                self._ctx(),
            )
            assert result == {"status": "ok"}

            # cancel() only returns once the group is confirmed gone.
            with pytest.raises(ProcessLookupError):
                os.killpg(pgid, 0)
        finally:
            try:
                os.killpg(pgid, 9)
            except OSError:
                pass

    def test_local_cancel_already_gone_is_ok(self, tmp_path):
        import subprocess as sp

        proc = sp.Popen(["sleep", "0.01"], start_new_session=True)
        proc.wait()  # already exited before we cancel
        result = _action_cancel(
            {"cluster_config": {"executor": "local"},
             "job_id": str(proc.pid)},
            self._ctx(),
        )
        assert result == {"status": "ok"}


# ---------------------------------------------------------------------------
# UserWorker IPC integration tests (worker_pool.py _send_and_recv)
# ---------------------------------------------------------------------------

class TestUserWorkerIPC:
    """Test UserWorker's _send_and_recv with a mock worker on the other end."""

    @pytest.fixture(autouse=True)
    def _stub_fsp_read(self, monkeypatch):
        """These tests exercise IPC framing, not DB prep."""
        monkeypatch.setattr(worker_pool_module, "_fetch_fsp_rows", lambda db_url: [])

    def _make_worker_pair(self):
        """Create a UserWorker connected to a mock 'worker' socket."""
        parent, child = socket.socketpair()
        parent.setblocking(True)

        # Create a fake Popen-like object
        class FakeProcess:
            returncode = None
            pid = 12345
            def poll(self): return None
            def wait(self): pass
            def kill(self): pass

        worker = UserWorker("testuser", FakeProcess(), parent, db_url=None)
        return worker, child

    def test_send_and_recv_basic(self):
        """Basic request/response over the socket."""
        worker, child = self._make_worker_pair()
        try:
            # Simulate worker: read request, send response
            def mock_worker():
                req = _recv(child)
                assert req["action"] == "ping"
                _send(child, {"status": "pong"})

            import threading
            t = threading.Thread(target=mock_worker)
            t.start()

            result = _send_and_recv(worker.sock, worker.username, {"action": "ping"}, worker.db_url, 5)
            assert result == {"status": "pong"}
            t.join()
        finally:
            worker.sock.close()
            child.close()

    def test_send_and_recv_preloads_db_data(self, monkeypatch):
        """Parent attaches needed DB data before sending to the worker."""
        parent, child = socket.socketpair()
        parent.setblocking(True)

        class FakeProcess:
            returncode = None
            pid = 12345
            def poll(self): return None
            def wait(self): pass
            def kill(self): pass

        monkeypatch.setattr(
            worker_pool_module, "_fetch_fsp_rows",
            lambda db_url: _fsp_rows(FileSharePath(
                zone="z", name="home", group="g", storage="local",
                mount_path="/home/test",
            )))

        worker = UserWorker("testuser", FakeProcess(), parent, db_url="sqlite://")
        try:
            def mock_worker():
                req = _recv(child)
                assert req["action"] == "get_profile"
                assert req["file_share_paths"][0]["name"] == "home"
                _send(child, {"ok": True})

            import threading
            t = threading.Thread(target=mock_worker)
            t.start()

            result = _send_and_recv(worker.sock, worker.username, {"action": "get_profile"}, worker.db_url, 5)
            assert result == {"ok": True}
            t.join()
        finally:
            worker.sock.close()
            child.close()

    def test_send_and_recv_with_fd(self):
        """Response with SCM_RIGHTS fd is auto-wrapped in _file_handle."""
        worker, child = self._make_worker_pair()
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write("fd test content")
                temp_path = f.name

            def mock_worker():
                req = _recv(child)
                fd = os.open(temp_path, os.O_RDONLY)
                _send(child, {"type": "handle", "size": 15}, fd=fd)
                os.close(fd)

            import threading
            t = threading.Thread(target=mock_worker)
            t.start()

            result = _send_and_recv(worker.sock, worker.username, {"action": "open_file"}, worker.db_url, 5)
            assert result["type"] == "handle"
            assert "_file_handle" in result

            fh = result["_file_handle"]
            content = fh.read().decode()
            fh.close()
            assert content == "fd test content"

            t.join()
            os.unlink(temp_path)
        finally:
            worker.sock.close()
            child.close()

    def test_send_and_recv_no_fd(self):
        """Normal response without fd has no _file_handle key."""
        worker, child = self._make_worker_pair()
        try:
            def mock_worker():
                _recv(child)
                _send(child, {"files": [1, 2, 3]})

            import threading
            t = threading.Thread(target=mock_worker)
            t.start()

            result = _send_and_recv(worker.sock, worker.username, {"action": "list_dir"}, worker.db_url, 5)
            assert result == {"files": [1, 2, 3]}
            assert "_file_handle" not in result
            t.join()
        finally:
            worker.sock.close()
            child.close()


# ---------------------------------------------------------------------------
# UserWorker async execute tests
# ---------------------------------------------------------------------------

class TestUserWorkerExecute:
    """Test the async execute() method."""

    @pytest.fixture(autouse=True)
    def _stub_fsp_read(self, monkeypatch):
        """These tests exercise IPC framing, not DB prep."""
        monkeypatch.setattr(worker_pool_module, "_fetch_fsp_rows", lambda db_url: [])

    def _make_worker_pair(self):
        parent, child = socket.socketpair()
        parent.setblocking(True)

        class FakeProcess:
            returncode = None
            pid = 12345
            def poll(self): return None
            def wait(self): pass
            def kill(self): pass

        worker = UserWorker("testuser", FakeProcess(), parent, db_url=None)
        return worker, child

    @pytest.mark.asyncio
    async def test_execute_success(self):
        worker, child = self._make_worker_pair()
        try:
            import threading
            def mock_worker():
                _recv(child)
                _send(child, {"result": "ok"})

            t = threading.Thread(target=mock_worker)
            t.start()

            result = await worker.execute("test_action")
            assert result == {"result": "ok"}
            t.join()
        finally:
            worker.sock.close()
            child.close()

    @pytest.mark.asyncio
    async def test_execute_worker_error(self):
        worker, child = self._make_worker_pair()
        try:
            import threading
            def mock_worker():
                _recv(child)
                _send(child, {"error": "something broke"})

            t = threading.Thread(target=mock_worker)
            t.start()

            with pytest.raises(WorkerError, match="something broke"):
                await worker.execute("bad_action")
            t.join()
        finally:
            worker.sock.close()
            child.close()

    @pytest.mark.asyncio
    async def test_execute_dead_worker(self):
        parent, child = socket.socketpair()
        parent.setblocking(True)
        child.close()

        class DeadProcess:
            returncode = 1
            def poll(self): return 1
            def wait(self): pass
            def kill(self): pass

        worker = UserWorker("testuser", DeadProcess(), parent, db_url=None)
        with pytest.raises(WorkerDead):
            await worker.execute("anything")
        parent.close()

    @pytest.mark.asyncio
    async def test_execute_with_fd_transparent(self):
        """execute() transparently includes _file_handle when worker sends fd."""
        worker, child = self._make_worker_pair()
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write("transparent fd")
                temp_path = f.name

            import threading
            def mock_worker():
                _recv(child)
                fd = os.open(temp_path, os.O_RDONLY)
                _send(child, {"content_type": "text/plain"}, fd=fd)
                os.close(fd)

            t = threading.Thread(target=mock_worker)
            t.start()

            result = await worker.execute("open_file")
            assert result["content_type"] == "text/plain"
            assert "_file_handle" in result

            fh = result["_file_handle"]
            assert fh.read().decode() == "transparent fd"
            fh.close()

            t.join()
            os.unlink(temp_path)
        finally:
            worker.sock.close()
            child.close()


    @pytest.mark.asyncio
    async def test_concurrent_execute_serialized(self):
        """Concurrent execute() calls are serialized — responses never get swapped."""
        worker, child = self._make_worker_pair()
        try:
            import threading

            def mock_worker():
                """Echo worker: returns the action name in the response."""
                for _ in range(20):
                    try:
                        req = _recv(child)
                    except ConnectionError:
                        break
                    action = req.get("action", "unknown")
                    if action == "shutdown":
                        break
                    # Simulate some work
                    time.sleep(0.01)
                    _send(child, {"action_echo": action, "seq": req.get("seq")})

            t = threading.Thread(target=mock_worker, daemon=True)
            t.start()

            # Fire 10 concurrent requests with different actions
            async def make_request(seq):
                action = f"action_{seq}"
                result = await worker.execute(action, seq=seq)
                # Verify we got OUR response back, not someone else's
                assert result["action_echo"] == action
                assert result["seq"] == seq

            await asyncio.gather(*[make_request(i) for i in range(10)])

            _send(child, {"action": "shutdown"})  # won't be read, but close cleanly
            t.join(timeout=5)
        finally:
            worker.sock.close()
            child.close()


# ---------------------------------------------------------------------------
# Action handler tests (user_worker.py actions run in-process)
# ---------------------------------------------------------------------------

class TestActionHandlers:
    """Test action handlers directly (simulates dev/test mode)."""

    @pytest.fixture
    def temp_dir(self):
        d = tempfile.mkdtemp()
        # Create test files
        with open(os.path.join(d, "hello.txt"), "w") as f:
            f.write("hello world")
        os.makedirs(os.path.join(d, "subdir"))
        with open(os.path.join(d, "subdir", "nested.txt"), "w") as f:
            f.write("nested content")
        yield d
        import shutil
        shutil.rmtree(d)

    @pytest.fixture
    def ctx(self, temp_dir):
        """Create a WorkerContext matching the subprocess worker."""
        return WorkerContext(username=os.environ.get("USER", "test"))

    def test_get_profile(self, ctx):
        handler = _ACTIONS["get_profile"]
        result = handler({"action": "get_profile", "file_share_paths": []}, ctx)
        assert "username" in result
        assert "groups" in result
        assert isinstance(result["groups"], list)

    def test_unknown_action(self):
        """Unknown actions are not in the registry."""
        assert "nonexistent_action" not in _ACTIONS

    def test_validate_paths_empty(self, ctx):
        handler = _ACTIONS["validate_paths"]
        result = handler({
            "action": "validate_paths",
            "paths": {},
            "file_share_paths": [],
        }, ctx)
        assert result == {"errors": {}}


# ---------------------------------------------------------------------------
# Worker request/response loop integration test (serve_lease, the real code)
# ---------------------------------------------------------------------------

class TestWorkerMainLoop:
    """Test the worker's request/response loop via socketpair (no subprocess)."""

    def _run_worker_loop(self, child_sock):
        """Run serve_lease in a thread using the given socket."""
        import threading

        ctx = WorkerContext(username=os.environ.get("USER", str(os.getuid())))

        def target():
            serve_lease(child_sock, ctx)
            child_sock.close()

        t = threading.Thread(target=target, daemon=True)
        t.start()
        return t

    def test_shutdown_message(self):
        """Worker exits cleanly on shutdown message."""
        parent, child = socket.socketpair()
        t = self._run_worker_loop(child)

        _send(parent, {"action": "shutdown"})
        t.join(timeout=5)
        assert not t.is_alive()
        parent.close()

    def test_unknown_action_returns_error(self):
        """Worker returns error for unknown actions."""
        parent, child = socket.socketpair()
        t = self._run_worker_loop(child)

        _send(parent, {"action": "totally_fake"})
        result = _recv(parent)
        assert "error" in result
        assert "Unknown action" in result["error"]

        _send(parent, {"action": "shutdown"})
        t.join(timeout=5)
        parent.close()

    def test_get_profile_via_loop(self):
        """End-to-end: send get_profile through the worker loop."""
        parent, child = socket.socketpair()
        t = self._run_worker_loop(child)

        _send(parent, {"action": "get_profile", "file_share_paths": []})
        result = _recv(parent)
        assert "username" in result
        assert "groups" in result

        _send(parent, {"action": "shutdown"})
        t.join(timeout=5)
        parent.close()

    def test_multiple_requests(self):
        """Worker handles multiple sequential requests."""
        parent, child = socket.socketpair()
        t = self._run_worker_loop(child)

        # Send several requests
        _send(parent, {"action": "get_profile", "file_share_paths": []})
        r1 = _recv(parent)
        assert "username" in r1

        _send(parent, {
            "action": "validate_paths",
            "paths": {},
            "file_share_paths": [],
        })
        r2 = _recv(parent)
        assert r2 == {"errors": {}}

        _send(parent, {"action": "shutdown"})
        t.join(timeout=5)
        parent.close()

    def test_connection_close_exits_loop(self):
        """Worker exits when parent closes the socket."""
        parent, child = socket.socketpair()
        t = self._run_worker_loop(child)

        # Close without sending shutdown — worker should detect and exit
        parent.close()
        t.join(timeout=5)
        assert not t.is_alive()


class TestValidateProxiedPathAction:
    """Tests for the validate_proxied_path action.

    The action is wrapped with @with_filestore, which resolves the filestore
    from parent-provided request["file_share_paths"] using request["fsp_name"].
    Each test uses a distinct fsp_name to avoid the module-level
    _filestore_cache.
    """

    def _ctx(self, fsp_name, mount_path):
        fsp = FileSharePath(zone="test", name=fsp_name, mount_path=str(mount_path))
        return WorkerContext(username="test"), fsp

    def test_accepts_regular_file(self, tmp_path):
        (tmp_path / "file.txt").write_text("data")
        ctx, fsp = self._ctx("vpp_file", tmp_path)
        result = _action_validate_proxied_path(
            _with_fsps({"fsp_name": "vpp_file", "path": "file.txt"}, fsp), ctx)
        assert result == {"ok": True}

    def test_missing_path_returns_error(self, tmp_path):
        ctx, fsp = self._ctx("vpp_missing", tmp_path)
        result = _action_validate_proxied_path(
            _with_fsps({"fsp_name": "vpp_missing", "path": "nope.txt"}, fsp),
            ctx,
        )
        assert result["status_code"] == 400

    @requires_symlinks
    def test_accepts_symlink(self, tmp_path):
        target = tmp_path / "target.txt"
        target.write_text("data")
        os.symlink(target, tmp_path / "link.txt")
        ctx, fsp = self._ctx("vpp_symlink", tmp_path)
        result = _action_validate_proxied_path(
            _with_fsps({"fsp_name": "vpp_symlink", "path": "link.txt"}, fsp),
            ctx,
        )
        assert result == {"ok": True}


class TestCreateDirsAction:
    """create_dirs makes directories within a share, refusing anything outside."""

    def _ctx(self, mount_path):
        fsp = FileSharePath(zone="test", name="cd", mount_path=str(mount_path))
        return WorkerContext(username="test"), fsp

    def test_creates_missing_directory(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        target = tmp_path / "logs" / "run1"
        result = _action_create_dirs(
            _with_fsps({"paths": {"0": str(target)}}, fsp), ctx)
        assert result == {"errors": {}}
        assert target.is_dir()

    def test_existing_directory_is_noop(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        target = tmp_path / "logs"
        target.mkdir()
        result = _action_create_dirs(
            _with_fsps({"paths": {"0": str(target)}}, fsp), ctx)
        assert result == {"errors": {}}
        assert target.is_dir()

    def test_refuses_path_outside_any_share(self, tmp_path):
        share = tmp_path / "share"
        share.mkdir()
        ctx, fsp = self._ctx(share)
        outside = tmp_path / "outside" / "dir"
        result = _action_create_dirs(
            _with_fsps({"paths": {"0": str(outside)}}, fsp), ctx)
        assert "0" in result["errors"]
        assert not outside.exists()

    def test_expands_tilde_as_the_user(self, tmp_path, monkeypatch):
        # Point HOME at a share so '~' resolves inside it.
        monkeypatch.setenv("HOME", str(tmp_path))
        ctx, fsp = self._ctx(tmp_path)
        result = _action_create_dirs(
            _with_fsps({"paths": {"0": "~/.fileglancer/logs"}}, fsp), ctx)
        assert result == {"errors": {}}
        assert (tmp_path / ".fileglancer" / "logs").is_dir()


class TestValidatePathsAction:
    """validate_paths checks existence, except for may_be_missing keys."""

    def _ctx(self, mount_path):
        fsp = FileSharePath(zone="test", name="vp", mount_path=str(mount_path))
        return WorkerContext(username="test"), fsp

    def test_missing_dir_fails_by_default(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        missing = tmp_path / "logs"
        result = _action_validate_paths(
            _with_fsps({"paths": {"logdir": str(missing)}}, fsp), ctx)
        assert "logdir" in result["errors"]

    def test_missing_dir_ok_when_may_be_missing(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        missing = tmp_path / "logs"
        result = _action_validate_paths(
            _with_fsps({
                "paths": {"logdir": str(missing)},
                "may_be_missing": ["logdir"],
            }, fsp),
            ctx,
        )
        assert result == {"errors": {}}

    def test_may_be_missing_still_enforces_containment(self, tmp_path):
        share = tmp_path / "share"
        share.mkdir()
        ctx, fsp = self._ctx(share)
        outside = tmp_path / "outside" / "logs"
        result = _action_validate_paths(
            _with_fsps({
                "paths": {"logdir": str(outside)},
                "may_be_missing": ["logdir"],
            }, fsp),
            ctx,
        )
        assert "logdir" in result["errors"]

    def test_folder_rejected_when_file_expected(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        subdir = tmp_path / "results"
        subdir.mkdir()
        result = _action_validate_paths(
            _with_fsps({
                "paths": {"input": str(subdir)},
                "types": {"input": "file"},
            }, fsp),
            ctx,
        )
        assert result["errors"]["input"] == "Path is a folder, but a file is required"

    def test_file_rejected_when_directory_expected(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        csv = tmp_path / "samples.csv"
        csv.write_text("sample\n")
        result = _action_validate_paths(
            _with_fsps({
                "paths": {"outdir": str(csv)},
                "types": {"outdir": "directory"},
            }, fsp),
            ctx,
        )
        assert result["errors"]["outdir"] == "Path is a file, but a folder is required"

    def test_existing_wrong_type_rejected_even_when_may_be_missing(self, tmp_path):
        # An exists=false param skips the existence check, but a path that DOES
        # exist with the wrong type is still an error.
        ctx, fsp = self._ctx(tmp_path)
        csv = tmp_path / "samples.csv"
        csv.write_text("sample\n")
        result = _action_validate_paths(
            _with_fsps({
                "paths": {"outdir": str(csv)},
                "may_be_missing": ["outdir"],
                "types": {"outdir": "directory"},
            }, fsp),
            ctx,
        )
        assert result["errors"]["outdir"] == "Path is a file, but a folder is required"

    def test_matching_type_passes(self, tmp_path):
        ctx, fsp = self._ctx(tmp_path)
        csv = tmp_path / "samples.csv"
        csv.write_text("sample\n")
        result = _action_validate_paths(
            _with_fsps({
                "paths": {"input": str(csv), "outdir": str(tmp_path)},
                "types": {"input": "file", "outdir": "directory"},
            }, fsp),
            ctx,
        )
        assert result == {"errors": {}}


class TestOpenFileAction:

    def test_reports_the_size_of_the_file_it_opened(self, tmp_path, monkeypatch):
        """Metadata must come from the opened descriptor, not an earlier stat by path."""
        target = tmp_path / "f.txt"
        target.write_text("short")
        fsp = FileSharePath(zone="test", name="of_fstat", mount_path=str(tmp_path))

        real_check = Filestore._check_path_in_root

        def replace_file_then_check(self, path):
            full_path = real_check(self, path)
            target.write_text("much longer content")  # file changes between stat and open
            return full_path

        monkeypatch.setattr(Filestore, "_check_path_in_root", replace_file_then_check)
        result = _ACTIONS["open_file"](
            _with_fsps({"fsp_name": "of_fstat", "subpath": "f.txt"}, fsp), WorkerContext(username="test"))
        try:
            assert result["file_size"] == len("much longer content")
            assert result["last_modified"] == pytest.approx(target.stat().st_mtime)
        finally:
            result["_file_handle"].close()
