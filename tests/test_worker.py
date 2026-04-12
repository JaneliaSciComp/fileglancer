"""Tests for the per-user persistent worker infrastructure.

Tests the IPC protocol (length-prefixed JSON, SCM_RIGHTS fd passing),
worker lifecycle (spawn, execute, shutdown, crash recovery),
and the in-process dev-mode fallback.
"""

import asyncio
import json
import os
import socket
import struct
import tempfile
import time

import pytest

from fileglancer.user_worker import (
    _send,
    _send_with_fd,
    _recv,
    _ACTIONS,
    WorkerContext,
    _HEADER_FMT,
    _HEADER_SIZE,
)
from fileglancer.worker_pool import (
    UserWorker,
    WorkerPool,
    WorkerError,
    WorkerDead,
)


# ---------------------------------------------------------------------------
# IPC protocol tests (user_worker.py _send/_recv/_send_with_fd)
# ---------------------------------------------------------------------------

class TestIPCProtocol:
    """Test the length-prefixed JSON wire protocol."""

    def test_send_recv_roundtrip(self):
        """A message sent with _send can be read back with _recv."""
        a, b = socket.socketpair()
        try:
            msg = {"action": "test", "value": 42, "nested": {"key": "val"}}
            _send(a, msg)
            result = _recv(b)
            assert result == msg
        finally:
            a.close()
            b.close()

    def test_send_recv_empty_dict(self):
        """Empty dicts round-trip correctly."""
        a, b = socket.socketpair()
        try:
            _send(a, {})
            assert _recv(b) == {}
        finally:
            a.close()
            b.close()

    def test_send_recv_large_message(self):
        """Messages larger than a single recv buffer work."""
        a, b = socket.socketpair()
        try:
            # Create a message larger than typical socket buffer
            big_value = "x" * 100_000
            msg = {"data": big_value}
            _send(a, msg)
            result = _recv(b)
            assert result["data"] == big_value
        finally:
            a.close()
            b.close()

    def test_send_recv_multiple_messages(self):
        """Multiple sequential messages on the same socket."""
        a, b = socket.socketpair()
        try:
            for i in range(10):
                _send(a, {"seq": i})
            for i in range(10):
                result = _recv(b)
                assert result == {"seq": i}
        finally:
            a.close()
            b.close()

    def test_recv_connection_closed(self):
        """_recv raises ConnectionError when the peer closes the socket."""
        a, b = socket.socketpair()
        a.close()
        with pytest.raises(ConnectionError):
            _recv(b)
        b.close()

    def test_send_with_fd_passes_file_descriptor(self):
        """_send_with_fd sends a file descriptor via SCM_RIGHTS."""
        import array

        a, b = socket.socketpair()
        try:
            # Create a temp file and send its fd
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                f.write("hello from fd passing")
                temp_path = f.name

            fd_to_send = os.open(temp_path, os.O_RDONLY)
            try:
                msg = {"type": "handle", "size": 21}
                _send_with_fd(a, msg, fd_to_send)

                # Receive using recvmsg for EVERYTHING (header + payload + ancillary)
                # The fd arrives with the first bytes, so we must use recvmsg from the start
                fds = array.array("i")
                raw = b""
                total_header = _HEADER_SIZE
                while len(raw) < total_header:
                    data, ancdata, flags, addr = b.recvmsg(
                        4096,
                        socket.CMSG_LEN(struct.calcsize("i")),
                    )
                    raw += data
                    for cmsg_level, cmsg_type, cmsg_data in ancdata:
                        if cmsg_level == socket.SOL_SOCKET and cmsg_type == socket.SCM_RIGHTS:
                            fds.frombytes(cmsg_data[:len(cmsg_data) - (len(cmsg_data) % fds.itemsize)])

                (length,) = struct.unpack(_HEADER_FMT, raw[:_HEADER_SIZE])
                total_needed = _HEADER_SIZE + length
                while len(raw) < total_needed:
                    data, ancdata, flags, addr = b.recvmsg(
                        total_needed - len(raw),
                        socket.CMSG_LEN(struct.calcsize("i")),
                    )
                    raw += data
                    for cmsg_level, cmsg_type, cmsg_data in ancdata:
                        if cmsg_level == socket.SOL_SOCKET and cmsg_type == socket.SCM_RIGHTS:
                            fds.frombytes(cmsg_data[:len(cmsg_data) - (len(cmsg_data) % fds.itemsize)])

                payload = raw[_HEADER_SIZE:_HEADER_SIZE + length]
                result = json.loads(payload)
                assert result == {"type": "handle", "size": 21}
                assert len(fds) == 1

                # Read from the received fd
                received_fd = fds[0]
                with os.fdopen(received_fd, 'r') as f:
                    content = f.read()
                assert content == "hello from fd passing"
            finally:
                os.close(fd_to_send)
                os.unlink(temp_path)
        finally:
            a.close()
            b.close()


# ---------------------------------------------------------------------------
# UserWorker IPC integration tests (worker_pool.py _send_and_recv)
# ---------------------------------------------------------------------------

class TestUserWorkerIPC:
    """Test UserWorker's _send_and_recv with a mock worker on the other end."""

    def _make_worker_pair(self):
        """Create a UserWorker connected to a mock 'worker' socket."""
        parent, child = socket.socketpair()
        parent.setblocking(True)

        # Create a fake Popen-like object
        class FakeProcess:
            returncode = None
            def poll(self): return None
            def wait(self): pass
            def kill(self): pass

        worker = UserWorker("testuser", FakeProcess(), parent)
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

            result = worker._send_and_recv({"action": "ping"})
            assert result == {"status": "pong"}
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
                _send_with_fd(child, {"type": "handle", "size": 15}, fd)
                os.close(fd)

            import threading
            t = threading.Thread(target=mock_worker)
            t.start()

            result = worker._send_and_recv({"action": "open_file"})
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

            result = worker._send_and_recv({"action": "list_dir"})
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

    def _make_worker_pair(self):
        parent, child = socket.socketpair()
        parent.setblocking(True)

        class FakeProcess:
            returncode = None
            def poll(self): return None
            def wait(self): pass
            def kill(self): pass

        worker = UserWorker("testuser", FakeProcess(), parent)
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

        worker = UserWorker("testuser", DeadProcess(), parent)
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
                _send_with_fd(child, {"content_type": "text/plain"}, fd)
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
        """Create a WorkerContext with a test database."""
        from fileglancer.settings import get_settings
        settings = get_settings()
        return WorkerContext(username=os.environ.get("USER", "test"), db_url=settings.db_url)

    def test_get_profile(self, ctx):
        handler = _ACTIONS["get_profile"]
        result = handler({"action": "get_profile"}, ctx)
        assert "username" in result
        assert "groups" in result
        assert isinstance(result["groups"], list)

    def test_unknown_action(self):
        """Unknown actions are not in the registry."""
        assert "nonexistent_action" not in _ACTIONS

    def test_validate_paths_empty(self, ctx):
        handler = _ACTIONS["validate_paths"]
        result = handler({"action": "validate_paths", "paths": {}}, ctx)
        assert result == {"errors": {}}


# ---------------------------------------------------------------------------
# Worker main loop integration test
# ---------------------------------------------------------------------------

class TestWorkerMainLoop:
    """Test the worker subprocess main loop via socketpair (no actual subprocess)."""

    def _run_worker_loop(self, child_sock):
        """Run the worker main loop in a thread using the given socket."""
        import threading

        def target():
            # Simulate what main() does, but with our socket
            sock = child_sock
            uid = os.getuid()
            try:
                username = os.environ.get("USER", str(uid))
            except KeyError:
                username = str(uid)

            from fileglancer.settings import get_settings
            settings = get_settings()
            ctx = WorkerContext(username=username, db_url=settings.db_url)

            while True:
                try:
                    request = _recv(sock)
                except ConnectionError:
                    break

                action = request.get("action")
                if action == "shutdown":
                    break

                handler = _ACTIONS.get(action)
                if handler is None:
                    _send(sock, {"error": f"Unknown action: {action}"})
                    continue

                try:
                    result = handler(request, ctx)
                    fd = result.pop("_fd", None)
                    file_handle = result.pop("_file_handle", None)
                    if fd is not None:
                        _send_with_fd(sock, result, fd)
                        if file_handle is not None:
                            file_handle.close()
                    else:
                        _send(sock, result)
                except Exception as e:
                    _send(sock, {"error": str(e)})

            sock.close()

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

        _send(parent, {"action": "get_profile"})
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
        _send(parent, {"action": "get_profile"})
        r1 = _recv(parent)
        assert "username" in r1

        _send(parent, {"action": "validate_paths", "paths": {}})
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
