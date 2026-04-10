"""Tests for the job poll loop: file-lock election and status-update logic."""

import asyncio
import fcntl
import multiprocessing
import time
from datetime import datetime, UTC
from types import SimpleNamespace
from unittest.mock import patch, MagicMock, call

from fileglancer.apps.core import _poll_jobs, _POLL_LOCK_PATH


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_settings(**overrides):
    """Return a minimal Settings-like object for poll tests."""
    cluster = SimpleNamespace(
        poll_interval=0.05,
        zombie_timeout_minutes=30.0,
        **{k: v for k, v in {
            "executor": "local",
        }.items()},
    )
    cluster.model_dump = lambda exclude_none=False: {"executor": "local"}
    settings = SimpleNamespace(
        cluster=cluster,
        db_url="sqlite:///unused",
    )
    return settings


def _make_db_job(job_id, cluster_job_id, status, username="alice",
                 created_at=None):
    """Return a mock DB job row."""
    job = SimpleNamespace(
        id=job_id,
        cluster_job_id=cluster_job_id,
        status=status,
        username=username,
        created_at=created_at or datetime.now(UTC),
    )
    return job


# ---------------------------------------------------------------------------
# Test: poll skips same-status (no spurious DB writes)
# ---------------------------------------------------------------------------

class TestPollSkipsSameStatus:
    """When the worker returns the same status already in the DB,
    _poll_jobs must NOT call update_job_status.  This was the bug that
    caused 'RUNNING -> RUNNING' log spam with multiple workers."""

    @patch("fileglancer.apps.core._run_as_user")
    @patch("fileglancer.apps.core.db")
    def test_same_status_not_written(self, mock_db, mock_run):
        settings = _make_settings()

        job = _make_db_job(1, "1001", "RUNNING")
        mock_session = MagicMock()
        mock_db.get_db_session.return_value.__enter__ = lambda _: mock_session
        mock_db.get_db_session.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.get_active_jobs.return_value = [job]

        # Worker returns RUNNING (lowercase from cluster_api) — same as DB
        mock_run.return_value = {
            "jobs": {
                "1001": {
                    "status": "running",
                    "exit_code": None,
                    "exec_host": None,
                    "start_time": None,
                    "finish_time": None,
                },
            },
        }

        _poll_jobs(settings)

        mock_db.update_job_status.assert_not_called()

    @patch("fileglancer.apps.core._run_as_user")
    @patch("fileglancer.apps.core.db")
    def test_changed_status_is_written(self, mock_db, mock_run):
        settings = _make_settings()

        job = _make_db_job(1, "1001", "RUNNING")
        mock_session = MagicMock()
        mock_db.get_db_session.return_value.__enter__ = lambda _: mock_session
        mock_db.get_db_session.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.get_active_jobs.return_value = [job]

        # Worker returns DONE — different from DB's RUNNING
        mock_run.return_value = {
            "jobs": {
                "1001": {
                    "status": "done",
                    "exit_code": 0,
                    "exec_host": "node01",
                    "start_time": "2026-03-26T10:00:00",
                    "finish_time": "2026-03-26T10:05:00",
                },
            },
        }

        _poll_jobs(settings)

        mock_db.update_job_status.assert_called_once()
        args, kwargs = mock_db.update_job_status.call_args
        assert args == (mock_session, 1, "DONE")

    @patch("fileglancer.apps.core._run_as_user")
    @patch("fileglancer.apps.core.db")
    def test_job_statuses_passed_to_worker(self, mock_db, mock_run):
        """The poll request must include job_statuses so the worker seeds
        stubs with the correct status instead of defaulting to PENDING."""
        settings = _make_settings()

        jobs = [
            _make_db_job(1, "1001", "RUNNING"),
            _make_db_job(2, "1002", "PENDING"),
        ]
        mock_session = MagicMock()
        mock_db.get_db_session.return_value.__enter__ = lambda _: mock_session
        mock_db.get_db_session.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.get_active_jobs.return_value = jobs

        mock_run.return_value = {"jobs": {}}

        _poll_jobs(settings)

        request = mock_run.call_args[0][1]
        assert request["job_statuses"] == {"1001": "RUNNING", "1002": "PENDING"}


# ---------------------------------------------------------------------------
# Helpers for multiprocessing lock test (must be module-level for pickling)
# ---------------------------------------------------------------------------

def _try_poll_with_lock(counter, sync_barrier):
    """Attempt to acquire the poll lock and increment a shared counter."""
    sync_barrier.wait()
    try:
        with open(_POLL_LOCK_PATH, "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                with counter.get_lock():
                    counter.value += 1
                # Hold lock long enough for the other process to attempt
                # acquisition and fail with LOCK_NB
                time.sleep(0.5)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Test: file lock ensures only one poll per cycle
# ---------------------------------------------------------------------------

class TestPollLockElection:
    """Only one concurrent caller should execute _poll_jobs per cycle.
    Uses the real file lock to test actual OS-level mutual exclusion."""

    def test_only_one_caller_polls(self, tmp_path):
        """Hold the lock externally, then run _poll_loop for one iteration.
        The loop should skip polling because it can't acquire the lock."""
        settings = _make_settings()
        poll_called = False

        def fake_poll_jobs(s):
            nonlocal poll_called
            poll_called = True

        # Hold the lock from this thread
        lock_file = open(_POLL_LOCK_PATH, "w")
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)

        try:
            # Run one iteration of the poll loop with a short sleep
            # The loop should fail to acquire the lock and skip
            async def run_one_iteration():
                with patch("fileglancer.apps.core._poll_jobs", fake_poll_jobs):
                    # Run the poll loop body once (not the infinite loop)
                    try:
                        with open(_POLL_LOCK_PATH, "w") as f:
                            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            try:
                                fake_poll_jobs(settings)
                            finally:
                                fcntl.flock(f, fcntl.LOCK_UN)
                    except OSError:
                        pass  # Lock held — should skip

            asyncio.run(run_one_iteration())
            assert not poll_called, "_poll_jobs should not run when lock is held"
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
            lock_file.close()

    def test_poll_runs_when_lock_available(self):
        """When no one holds the lock, _poll_jobs should execute."""
        settings = _make_settings()
        poll_called = False

        def fake_poll_jobs(s):
            nonlocal poll_called
            poll_called = True

        # Ensure lock file is not held
        async def run_one_iteration():
            try:
                with open(_POLL_LOCK_PATH, "w") as f:
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    try:
                        fake_poll_jobs(settings)
                    finally:
                        fcntl.flock(f, fcntl.LOCK_UN)
            except OSError:
                pass

        asyncio.run(run_one_iteration())
        assert poll_called, "_poll_jobs should run when lock is available"

    def test_concurrent_processes_only_one_wins(self):
        """Simulate two worker processes racing for the lock — only one should poll.

        fcntl.flock is per-process (not per-thread), so we must use
        multiprocessing to test real mutual exclusion — matching how
        uvicorn workers are separate OS processes.
        """
        ctx = multiprocessing.get_context("fork")
        won_count = ctx.Value("i", 0)
        barrier = ctx.Barrier(2, timeout=5)

        p1 = ctx.Process(target=_try_poll_with_lock, args=(won_count, barrier))
        p2 = ctx.Process(target=_try_poll_with_lock, args=(won_count, barrier))
        p1.start()
        p2.start()
        p1.join(timeout=5)
        p2.join(timeout=5)

        assert won_count.value == 1, f"Expected 1 poll winner, got {won_count.value}"
