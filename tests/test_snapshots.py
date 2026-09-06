"""Tests for the immutable per-commit snapshot store (apps/manifest.py).

Uses real git repos in a temp directory: the branch clone is faked via
_ensure_repo_cache/_repo_cache_base monkeypatches, everything below that
(clone, checkout, cat-file, gc) runs the real git code paths.
"""

import asyncio
import os
import shutil
import subprocess

import pytest

import fileglancer.apps.manifest as m


MANIFEST_V1 = """\
name: Demo
runnables:
  - id: run
    name: Run
    command: echo hi
"""

MANIFEST_V2 = MANIFEST_V1.replace("name: Demo", "name: Demo v2")

REPO_URL = "https://github.com/owner/repo"


def _git(*args, cwd=None):
    subprocess.run(
        ["git", "-c", "user.email=test@test", "-c", "user.name=test",
         "-c", "protocol.file.allow=always", *args],
        cwd=cwd, check=True, capture_output=True,
    )


def _commit_all(clone, message):
    _git("add", ".", cwd=clone)
    _git("commit", "-m", message, cwd=clone)


def _head_sha(clone) -> str:
    return asyncio.run(m._git_head_sha(clone))


@pytest.fixture
def repo_setup(tmp_path, monkeypatch):
    """A fake per-user cache with a real git 'branch clone' at owner/repo/main."""
    cache_base = tmp_path / "cache"
    clone = cache_base / "owner" / "repo" / "main"
    clone.mkdir(parents=True)
    _git("init", "-b", "main", cwd=clone)
    (clone / "runnables.yaml").write_text(MANIFEST_V1)
    _commit_all(clone, "one")

    monkeypatch.setattr(m, "_repo_cache_base", lambda username=None: cache_base)

    async def fake_ensure_repo_cache(url, pull=False, username=None):
        return clone

    monkeypatch.setattr(m, "_ensure_repo_cache", fake_ensure_repo_cache)
    # Locks may be left over from other tests' event loops.
    monkeypatch.setattr(m, "_repo_locks", {})
    # Make gc deletion synchronous so tests (and tmp_path cleanup) are
    # deterministic.
    monkeypatch.setattr(
        m, "_delete_dirs_in_background",
        lambda paths: [shutil.rmtree(p, ignore_errors=True) for p in paths],
    )
    return cache_base, clone


def test_snapshot_of_current_head(repo_setup):
    cache_base, clone = repo_setup
    snap_dir, sha = asyncio.run(m.ensure_repo_snapshot(REPO_URL))

    assert sha == _head_sha(clone)
    assert snap_dir == cache_base / "owner" / "repo" / ".snapshots" / sha
    assert (snap_dir / "runnables.yaml").read_text() == MANIFEST_V1
    # Self-contained .git (a real directory from the hardlink clone, not a
    # worktree pointer file) so it works when bind-mounted into containers.
    assert (snap_dir / ".git").is_dir()

    # Idempotent: asking for the same sha finds the existing snapshot.
    snap_dir2, sha2 = asyncio.run(m.ensure_repo_snapshot(REPO_URL, sha=sha))
    assert (snap_dir2, sha2) == (snap_dir, sha)


def test_existing_snapshot_tree_is_locked_down_on_the_hot_path(repo_setup):
    """Launching a pinned app reaches neither _ensure_repo_cache nor
    _create_snapshot, so the hot path is the only chance to make a snapshot tree
    left world-readable by an older release private again."""
    _, clone = repo_setup
    snap_dir, sha = asyncio.run(m.ensure_repo_snapshot(REPO_URL))
    snapshots = snap_dir.parent
    os.chmod(snapshots, 0o755)

    snap_dir2, _ = asyncio.run(m.ensure_repo_snapshot(REPO_URL, sha=sha))

    assert snap_dir2 == snap_dir
    assert snapshots.stat().st_mode & 0o077 == 0


def test_snapshot_immutable_when_branch_moves(repo_setup):
    """Pulling the branch clone past a pin never changes the pinned tree."""
    _, clone = repo_setup
    snap_v1, sha_v1 = asyncio.run(m.ensure_repo_snapshot(REPO_URL))

    (clone / "runnables.yaml").write_text(MANIFEST_V2)
    _commit_all(clone, "two")
    snap_v2, sha_v2 = asyncio.run(m.ensure_repo_snapshot(REPO_URL))

    assert sha_v2 != sha_v1
    assert snap_v2 != snap_v1
    assert (snap_v2 / "runnables.yaml").read_text() == MANIFEST_V2
    # The old snapshot still serves the old tree.
    assert (snap_v1 / "runnables.yaml").read_text() == MANIFEST_V1


def test_snapshot_of_older_commit_materialized_on_demand(repo_setup):
    """A pinned commit that predates the branch clone's tip (e.g. its snapshot
    was gc'd on another machine) is rebuilt from the clone's history."""
    _, clone = repo_setup
    sha_v1 = _head_sha(clone)
    (clone / "runnables.yaml").write_text(MANIFEST_V2)
    _commit_all(clone, "two")

    snap_dir, sha = asyncio.run(m.ensure_repo_snapshot(REPO_URL, sha=sha_v1))
    assert sha == sha_v1
    assert (snap_dir / "runnables.yaml").read_text() == MANIFEST_V1


def test_fetch_manifest_reads_pinned_snapshot(repo_setup):
    """fetch_app_manifest(sha=...) serves the manifest as of the pin, not the
    branch clone's current tip."""
    _, clone = repo_setup
    sha_v1 = _head_sha(clone)
    (clone / "runnables.yaml").write_text(MANIFEST_V2)
    _commit_all(clone, "two")

    pinned = asyncio.run(m.fetch_app_manifest(REPO_URL, "", sha=sha_v1))
    assert pinned.name == "Demo"
    tip = asyncio.run(m.fetch_app_manifest(REPO_URL, ""))
    assert tip.name == "Demo v2"


def test_gc_removes_only_unreferenced_snapshots(repo_setup, monkeypatch):
    _, clone = repo_setup
    # Disable the recency guard so freshly-created snapshots are eligible.
    monkeypatch.setattr(m, "_GC_GRACE_SECONDS", 0)
    snap_v1, sha_v1 = asyncio.run(m.ensure_repo_snapshot(REPO_URL))
    (clone / "runnables.yaml").write_text(MANIFEST_V2)
    _commit_all(clone, "two")
    snap_v2, sha_v2 = asyncio.run(m.ensure_repo_snapshot(REPO_URL))

    removed = asyncio.run(m.gc_repo_snapshots(REPO_URL, [sha_v2]))

    assert removed == [sha_v1]
    assert not snap_v1.exists()
    assert snap_v2.exists()
    # The branch clone is never gc'd.
    assert clone.exists()


def test_gc_grace_period_protects_recent_snapshots(repo_setup):
    """A just-created snapshot is exempt from gc even when unreferenced: the
    DB keep-set can't see a launch whose job row hasn't committed yet."""
    _, _ = repo_setup
    snap_dir, sha = asyncio.run(m.ensure_repo_snapshot(REPO_URL))

    removed = asyncio.run(m.gc_repo_snapshots(REPO_URL, []))
    assert removed == []
    assert snap_dir.exists()


def test_gc_ignores_foreign_directories(repo_setup, monkeypatch):
    """Only 40-hex snapshot dirs are eligible; anything else is left alone."""
    cache_base, _ = repo_setup
    monkeypatch.setattr(m, "_GC_GRACE_SECONDS", 0)
    snapshots = cache_base / "owner" / "repo" / m._SNAPSHOTS_DIRNAME
    snapshots.mkdir(parents=True)
    stray = snapshots / "not-a-sha"
    stray.mkdir()

    removed = asyncio.run(m.gc_repo_snapshots(REPO_URL, []))
    assert removed == []
    assert stray.exists()


def test_get_remote_head_sha_revision_is_itself():
    """A URL pinned to a commit SHA resolves without any network call."""
    sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
    result = asyncio.run(m.get_remote_head(f"https://github.com/owner/repo/tree/{sha}"))
    assert result == sha


@pytest.mark.parametrize("bad", ["", "abc", "HEAD", "../escape", "a" * 39, "g" * 40])
def test_validate_commit_sha_rejects_non_shas(bad):
    with pytest.raises(ValueError):
        m.validate_commit_sha(bad)
