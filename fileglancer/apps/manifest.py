"""Worker dispatch, git repo caching, and app manifest discovery/loading."""

import asyncio
import os
import re
import shutil
import threading
import time
from contextlib import suppress
from pathlib import Path, PurePosixPath

import yaml
from loguru import logger

from fileglancer import database as db
from fileglancer.apps.adapters import try_adapt
from fileglancer.apps.jobfiles import ensure_private_dir
# GitHub URL parsing/canonicalization lives in fileglancer.giturls (which has no
# fileglancer deps) so the database layer can reuse it without an import cycle.
# Re-exported for the apps module's internal callers and existing imports.
from fileglancer.giturls import (  # noqa: F401
    _parse_github_url,
    canonical_github_url,
    github_url_at_branch,
    github_url_with_branch,
)
from fileglancer.model import AppManifest
from fileglancer.settings import get_settings


# Registered by server.py at startup. Dispatches an action to the per-user
# persistent worker (or in-process in dev mode). Signature mirrors
# server._worker_exec: (username, action, **kwargs) -> awaitable[dict].
_worker_exec = None


def set_worker_exec(fn):
    """Register the persistent worker dispatcher. Called from server lifespan."""
    global _worker_exec
    _worker_exec = fn


async def _dispatch(username: str, action: str, **kwargs) -> dict:
    if _worker_exec is None:
        raise RuntimeError(
            "Worker dispatcher not registered — apps module used before server startup"
        )
    return await _worker_exec(username, action, **kwargs)


_MANIFEST_FILENAME = "runnables.yaml"

# Immutable per-commit checkouts live under <owner>/<repo>/.snapshots/<sha>.
# The dirname starts with '.' so it can never collide with a branch-named
# clone directory (git forbids ref components that begin with a dot).
_SNAPSHOTS_DIRNAME = ".snapshots"
_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")


def validate_commit_sha(sha: str) -> str:
    """Validate a full 40-hex commit SHA. It becomes a path component and a
    git argument, so anything else is rejected."""
    if not sha or not _SHA_PATTERN.fullmatch(sha):
        raise ValueError(f"Invalid commit SHA: '{sha}'")
    return sha


def _repo_cache_base(username: str | None = None) -> Path:
    """Return the repo cache base directory, optionally for a specific user."""
    if username:
        home = os.path.expanduser(f"~{username}")
    else:
        home = os.path.expanduser("~")
    return Path(home) / ".fileglancer" / "apps"
_repo_locks: dict[str, asyncio.Lock] = {}


def _get_repo_lock(owner: str, repo: str, branch: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a specific repo+branch."""
    key = f"{owner}/{repo}/{branch}"
    if key not in _repo_locks:
        _repo_locks[key] = asyncio.Lock()
    return _repo_locks[key]


def validate_manifest_path(manifest_path: str) -> str:
    """Validate and normalize a user-supplied manifest path.

    A manifest path is a directory path, relative to the repository root, that
    locates a runnables.yaml (or auto-detected project). It originates from API
    request bodies and query params, so it must never escape the cloned repo
    (path traversal) nor carry shell-significant content into the generated job
    script.

    Returns the normalized relative POSIX path ("" for the repo root). Raises
    ValueError for NUL bytes, backslashes, absolute paths, or '..' segments.
    """
    if not manifest_path:
        return ""
    if "\x00" in manifest_path:
        raise ValueError("manifest_path must not contain NUL bytes")
    if "\\" in manifest_path:
        raise ValueError(
            f"manifest_path must use '/' separators, not '\\': '{manifest_path}'"
        )
    pure = PurePosixPath(manifest_path)
    if pure.is_absolute():
        raise ValueError(
            f"manifest_path must be relative, not absolute: '{manifest_path}'"
        )
    safe_parts: list[str] = []
    for part in pure.parts:
        # PurePosixPath already drops empty and '.' segments.
        if part == "..":
            raise ValueError(
                f"manifest_path must not contain '..' segments: '{manifest_path}'"
            )
        safe_parts.append(part)
    return "/".join(safe_parts)


def _safe_repo_subdir(repo_dir: Path, manifest_path: str) -> Path:
    """Resolve manifest_path under repo_dir, guaranteeing it stays inside.

    Validates the path, joins it with the repo root, resolves symlinks, and
    asserts the result is contained within the repo (defends against symlinks
    that resolve outward). Raises ValueError otherwise.
    """
    safe = validate_manifest_path(manifest_path)
    repo_root = repo_dir.resolve()
    target = (repo_root / safe).resolve() if safe else repo_root
    # Raises ValueError if target escaped the repo root.
    target.relative_to(repo_root)
    return target


# When cloning over SSH, never prompt interactively (that would hang the
# worker under GIT_TERMINAL_PROMPT=0, which only governs git's own prompts, not
# ssh's). BatchMode disables passphrase/password prompts; accept-new trusts the
# GitHub host key on first use so a missing known_hosts entry isn't a hard fail.
_SSH_GIT_ENV = {
    "GIT_SSH_COMMAND": "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
}

# Substrings (lowercased) that mark an HTTPS git failure as an auth/access
# problem — the signal to retry the same repo over SSH. Private and nonexistent
# repos both look like this over HTTPS (GitHub won't confirm a repo exists to an
# unauthenticated client).
_GIT_AUTH_ERROR_MARKERS = (
    "could not read username",
    "authentication failed",
    "terminal prompts disabled",
    "repository not found",
    "fatal: could not read",
)


def _is_git_auth_error(message: str) -> bool:
    low = message.lower()
    return any(marker in low for marker in _GIT_AUTH_ERROR_MARKERS)


def _github_remote_urls(owner: str, repo: str) -> tuple[str, str]:
    """Return (https, ssh) clone URLs for a GitHub owner/repo."""
    return (
        f"https://github.com/{owner}/{repo}.git",
        f"git@github.com:{owner}/{repo}.git",
    )


def _is_git_ref_not_found(message: str) -> bool:
    """True if a git failure means the requested branch/tag doesn't exist
    (as opposed to an auth/access problem) — i.e. the remote was reachable."""
    low = message.lower()
    return (
        "not found in upstream" in low
        or "could not find remote ref" in low
        or ("remote branch" in low and "not found" in low)
    )


def _ref_not_found_error(owner: str, repo: str, branch: str) -> str:
    """User-facing message for a revision that doesn't exist in the repo."""
    return (
        f"Revision '{branch}' was not found in repository {owner}/{repo}. "
        f"Check that the tag or branch name is spelled correctly."
    )


def _repo_access_error(owner: str, repo: str, branch: str,
                       https_err: str, ssh_err: str) -> str:
    """Build a user-facing message for a repo that couldn't be cloned either way."""
    return (
        f"Could not access the repository {owner}/{repo} (revision '{branch}'). "
        f"If it is private, make sure it exists and that you have access. Fileglancer "
        f"tried HTTPS and then SSH (git@github.com) as your user — for SSH access, your "
        f"SSH key must be configured on this server and added to your GitHub account.\n"
        f"  HTTPS: {https_err}\n"
        f"  SSH: {ssh_err}"
    )


async def _run_git(args: list[str], timeout: int = 60,
                   extra_env: dict | None = None) -> tuple[bytes, bytes]:
    """Run a git command asynchronously.

    The timeout covers the command's full runtime, not just process creation.
    extra_env is merged into the subprocess environment (e.g. GIT_SSH_COMMAND).
    Raises ValueError with a readable message on failure.
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    if extra_env:
        env.update(extra_env)
    proc = None

    async def _create_and_communicate() -> tuple[bytes, bytes]:
        nonlocal proc
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            return await proc.communicate()
        except asyncio.CancelledError:
            if proc is not None:
                if proc.returncode is None:
                    with suppress(ProcessLookupError):
                        proc.kill()
                with suppress(Exception):
                    await proc.communicate()
            raise

    try:
        stdout, stderr = await asyncio.wait_for(
            _create_and_communicate(),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise ValueError(f"Git command timed out after {timeout}s: {' '.join(args)}")

    if proc.returncode != 0:
        err = stderr.decode().strip() if stderr else "unknown error"
        raise ValueError(f"Git command failed: {err}")

    return stdout, stderr


async def _resolve_default_branch(owner: str, repo: str) -> str:
    """Query a remote repo for its default branch (HEAD).

    Tries HTTPS first, then SSH if HTTPS fails for auth/access reasons (private
    repos). Falls back to 'main' if the remote cannot be queried.
    """
    https_url, ssh_url = _github_remote_urls(owner, repo)
    for url, extra_env in ((https_url, None), (ssh_url, _SSH_GIT_ENV)):
        try:
            stdout, _ = await _run_git(
                ["git", "ls-remote", "--symref", url, "HEAD"],
                timeout=30, extra_env=extra_env,
            )
            # Output: "ref: refs/heads/master\tHEAD\n..."
            for line in stdout.decode().splitlines():
                if line.startswith("ref:"):
                    ref = line.split()[1]
                    return ref.removeprefix("refs/heads/")
            # Reached the remote but found no symref line — stop, use the default.
            break
        except ValueError as e:
            # Only fall through to the SSH attempt for auth/access failures.
            if not _is_git_auth_error(str(e)):
                break
        except Exception:
            break
    return "main"


async def _clone_repo(owner: str, repo: str, branch: str, repo_dir: Path) -> None:
    """Clone owner/repo at branch into repo_dir, trying HTTPS then SSH.

    On an HTTPS auth/access failure (e.g. a private repo), retries over SSH as
    the current user. If both transports fail, raises ValueError with a
    user-facing message describing both errors.
    """
    https_url, ssh_url = _github_remote_urls(owner, repo)
    try:
        await _run_git(
            ["git", "clone", "--branch", branch, https_url, str(repo_dir)],
            timeout=120,
        )
        return
    except ValueError as https_err:
        shutil.rmtree(repo_dir, ignore_errors=True)
        # The remote was reachable over HTTPS but the branch/tag doesn't exist
        # (public repo, mistyped revision) — authoritative, don't try SSH.
        if _is_git_ref_not_found(str(https_err)):
            raise ValueError(_ref_not_found_error(owner, repo, branch))
        # Anything other than an auth/access failure is surfaced as-is.
        if not _is_git_auth_error(str(https_err)):
            raise
        logger.info(
            f"HTTPS clone of {owner}/{repo} failed authentication; retrying over SSH"
        )
        try:
            await _run_git(
                ["git", "clone", "--branch", branch, ssh_url, str(repo_dir)],
                timeout=120, extra_env=_SSH_GIT_ENV,
            )
        except ValueError as ssh_err:
            shutil.rmtree(repo_dir, ignore_errors=True)
            # SSH reached the repo (auth worked) but the revision is missing —
            # report that plainly instead of the misleading "can't access" text.
            if _is_git_ref_not_found(str(ssh_err)):
                raise ValueError(_ref_not_found_error(owner, repo, branch))
            raise ValueError(
                _repo_access_error(owner, repo, branch, str(https_err), str(ssh_err))
            )


async def _ensure_repo_cache(url: str, pull: bool = False,
                             username: str | None = None) -> Path:
    """Clone or update the GitHub repo in per-user cache. Returns repo path.

    Cache is keyed by owner/repo/branch to avoid checkout races between branches.
    An asyncio lock serializes git operations for the same repo+branch.

    When username is provided, the work is delegated to a worker subprocess
    that runs with the target user's real UID/GID, avoiding the process-wide
    euid race condition that seteuid/setegid has with concurrent async
    requests.  When username is None, git commands run in-process (used by
    the worker subprocess itself, or in single-user dev mode).
    """
    owner, repo, branch = _parse_github_url(url)
    if not branch:
        branch = await _resolve_default_branch(owner, repo)

    if username:
        lock = _get_repo_lock(owner, repo, branch)
        async with lock:
            result = await _dispatch(username, "ensure_repo", url=url, pull=pull)
            return Path(result["repo_dir"])

    # Running as the current user (worker subprocess or dev mode)
    euid = os.geteuid() if hasattr(os, "geteuid") else "n/a"
    logger.debug(f"ensure_repo running in-process as euid={euid}")
    cache_base = _repo_cache_base()
    # Kept alongside the resolved path because the two are not interchangeable:
    # containment and git want the real location, while the permission walk
    # needs to still see the .fileglancer component that resolve() collapses
    # away when any part of the path (a relocated state directory, an
    # automounted home) is a symlink.
    lexical_repo_dir = cache_base / owner / repo / branch
    repo_dir = lexical_repo_dir.resolve()
    repo_dir.relative_to(cache_base.resolve())
    lock = _get_repo_lock(owner, repo, branch)

    async with lock:
        # Before the cache-hit check, not just on the clone path: this is the
        # call every user reaches, so it is what locks down a state directory
        # left world-readable by an earlier version.
        ensure_private_dir(lexical_repo_dir.parent)
        if repo_dir.exists():
            logger.debug(f"Repo cache hit: {owner}/{repo} ({branch})")
            if pull:
                logger.info(f"Pulling latest for {owner}/{repo} ({branch})")
                # `branch` may be a tag or commit, not a branch, so there is no
                # origin/<branch> tracking ref to reset to. Fetch the ref and
                # reset to FETCH_HEAD, which works for branches, tags and SHAs.
                # Pass the SSH env so private repos with an SSH origin don't
                # prompt (harmless for HTTPS origins, which ignore GIT_SSH_COMMAND).
                await _run_git(
                    ["git", "-C", str(repo_dir), "fetch", "origin", branch],
                    extra_env=_SSH_GIT_ENV,
                )
                await _run_git(
                    ["git", "-C", str(repo_dir), "reset", "--hard", "FETCH_HEAD"]
                )
        else:
            logger.info(f"Cloning {owner}/{repo} ({branch}) into {repo_dir}")
            await _clone_repo(owner, repo, branch, repo_dir)

    return repo_dir


# --- Immutable per-commit snapshots -----------------------------------------
#
# Apps are pinned to a commit (user_apps.commit_sha) and jobs run from an
# immutable checkout of that commit, not from the mutable branch clone. The
# branch clone remains the fetch target; snapshots are materialized from it as
# local hardlink clones, so they are cheap in time and disk while still being
# fully self-contained (their .git works when bind-mounted into a container).
# Updating an app creates a new snapshot and repoints the row — sibling apps
# in the same repo and already-running jobs keep the tree they were pinned to.


def _snapshots_dir(owner: str, repo: str) -> Path:
    return _repo_cache_base() / owner / repo / _SNAPSHOTS_DIRNAME


async def _git_head_sha(repo_dir: Path) -> str:
    stdout, _ = await _run_git(["git", "-C", str(repo_dir), "rev-parse", "HEAD"])
    return stdout.decode().strip()


async def _create_snapshot(owner: str, repo: str, repo_dir: Path, sha: str,
                           snapshot_dir: Path) -> None:
    """Materialize an immutable checkout of sha from the branch clone.

    Builds the snapshot in a sibling .tmp dir and renames it into place, so a
    half-built snapshot is never observable at the final path. Caller holds
    the per-snapshot lock.
    """
    # The pinned commit may predate the branch clone's current tip (a sibling
    # app's update pulled past it). If the object isn't present locally, fetch
    # it explicitly — GitHub serves reachable commits by SHA.
    try:
        await _run_git(["git", "-C", str(repo_dir), "cat-file", "-e",
                        f"{sha}^{{commit}}"])
    except ValueError:
        try:
            await _run_git(["git", "-C", str(repo_dir), "fetch", "origin", sha],
                           timeout=120, extra_env=_SSH_GIT_ENV)
        except ValueError as e:
            raise ValueError(
                f"Commit {sha[:7]} is no longer available in {owner}/{repo} "
                f"(its history may have been rewritten). Update the app to "
                f"pin it to the current revision. ({e})"
            )

    ensure_private_dir(snapshot_dir.parent)
    tmp_dir = snapshot_dir.parent / f".tmp-{sha}"
    shutil.rmtree(tmp_dir, ignore_errors=True)
    try:
        # Local clone: objects are hardlinked. --no-checkout because the
        # branch clone's HEAD may be detached (tag-pinned apps), which some
        # git versions refuse to check out during clone; we check out the
        # exact commit ourselves either way.
        await _run_git(["git", "clone", "--no-checkout", str(repo_dir),
                        str(tmp_dir)], timeout=300)
        await _run_git(["git", "-C", str(tmp_dir), "checkout", "--detach", sha],
                       timeout=300)
        # Keep the commit reachable inside the snapshot regardless of where
        # its branches move, so nothing can ever gc it out from under a job.
        await _run_git(["git", "-C", str(tmp_dir), "tag", "-f",
                        "fileglancer-pin", sha])
        # Point origin at GitHub rather than at the local branch clone.
        https_url, _ = _github_remote_urls(owner, repo)
        await _run_git(["git", "-C", str(tmp_dir), "remote", "set-url",
                        "origin", https_url])
        try:
            os.rename(tmp_dir, snapshot_dir)
        except OSError:
            # Lost a creation race — the existing snapshot is equivalent.
            if not (snapshot_dir / ".git").exists():
                raise
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def ensure_repo_snapshot(url: str, sha: str | None = None,
                               pull: bool = False,
                               username: str | None = None) -> tuple[Path, str]:
    """Return (snapshot_dir, sha) for an immutable checkout of the repo at sha.

    sha=None means "the branch clone's current HEAD" (after pulling when
    pull=True): used at add/update time to pin an app, and at launch time to
    backfill legacy unpinned rows.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user.
    """
    if sha is not None:
        validate_commit_sha(sha)

    if username:
        result = await _dispatch(username, "ensure_snapshot", url=url, sha=sha,
                                 pull=pull)
        return Path(result["snapshot_dir"]), result["sha"]

    owner, repo, _ = _parse_github_url(url)

    # Hot path (job launch of a pinned app): the snapshot already exists, so
    # no git work — and no network — happens at all. Touch the directory so
    # the GC grace period protects a snapshot that is about to be launched
    # from but isn't yet referenced by a committed job row.
    if sha is not None and not pull:
        snapshot_dir = _snapshots_dir(owner, repo) / sha
        if (snapshot_dir / ".git").exists():
            with suppress(OSError):
                os.utime(snapshot_dir)
            # Launching a pinned app reaches neither _ensure_repo_cache nor
            # _create_snapshot, so for a user whose snapshots all predate this
            # it is the only place the tree gets locked down.
            ensure_private_dir(snapshot_dir.parent)
            return snapshot_dir, sha

    repo_dir = await _ensure_repo_cache(url, pull=pull)
    if sha is None:
        sha = await _git_head_sha(repo_dir)
    snapshot_dir = _snapshots_dir(owner, repo) / sha

    lock = _get_repo_lock(owner, repo, f"snapshot/{sha}")
    async with lock:
        if (snapshot_dir / ".git").exists():
            with suppress(OSError):
                os.utime(snapshot_dir)
            return snapshot_dir, sha
        # A directory without .git is debris from an interrupted delete.
        if snapshot_dir.exists():
            shutil.rmtree(snapshot_dir, ignore_errors=True)
        await _create_snapshot(owner, repo, repo_dir, sha, snapshot_dir)

    # Opportunistically resume deleting stale trash left by a gc whose
    # background delete was cut short (e.g. worker eviction mid-rmtree).
    _delete_dirs_in_background(_stale_trash_dirs(_snapshots_dir(owner, repo)))
    return snapshot_dir, sha


def _delete_dirs_in_background(paths: list[Path]) -> None:
    """Delete directories on a daemon thread.

    Snapshot trees can be large (pixi envs build inside them) and live on NFS;
    deleting inline would stall the worker's serial request loop.
    """
    if not paths:
        return

    def _rm():
        for p in paths:
            shutil.rmtree(p, ignore_errors=True)

    threading.Thread(target=_rm, daemon=True, name="fg-snapshot-gc").start()


# How recently a snapshot (or .tmp/.trash dir) must have been touched to be
# exempt from gc. Guards the windows the DB keep-set cannot see: a snapshot
# resolved by a launch whose job row isn't committed yet, a .tmp dir another
# process is mid-clone into (the per-repo locks are process-local), and a
# .trash dir another process's delete thread is still working through.
_GC_GRACE_SECONDS = 3600


def _is_recent(path: Path) -> bool:
    try:
        return (time.time() - path.stat().st_mtime) < _GC_GRACE_SECONDS
    except OSError:
        # Vanished (e.g. another process's delete finished) — nothing to do.
        return True


def _stale_trash_dirs(snapshots_dir: Path) -> list[Path]:
    """Trash dirs old enough that no delete thread can still be on them."""
    if not snapshots_dir.is_dir():
        return []
    return [
        entry for entry in snapshots_dir.iterdir()
        if entry.name.startswith(".trash-") and not _is_recent(entry)
    ]


async def gc_repo_snapshots(url: str, keep_shas: list[str],
                            username: str | None = None) -> list[str]:
    """Remove snapshots of this repo that no app or retained job references.

    keep_shas is computed by the caller from the database (every user_apps pin
    for this owner/repo plus the SHAs of retained jobs). Anything created or
    used within the grace period is skipped regardless — the DB can't see a
    launch that hasn't committed its job row yet, nor another server process's
    in-flight snapshot creation. Directories are renamed out of the way
    immediately and deleted in the background. Returns the SHAs removed.
    Never touches branch clones.
    """
    if username:
        result = await _dispatch(username, "gc_snapshots", url=url,
                                 keep_shas=list(keep_shas))
        return result["removed"]

    owner, repo, _ = _parse_github_url(url)
    keep = {s for s in keep_shas if s and _SHA_PATTERN.fullmatch(s)}
    snapshots_dir = _snapshots_dir(owner, repo)
    if not snapshots_dir.is_dir():
        return []

    removed: list[str] = []
    to_delete: list[Path] = []
    for entry in list(snapshots_dir.iterdir()):
        name = entry.name
        if name.startswith(".trash-"):
            # Leftover from a previous gc whose delete never finished. Recent
            # trash may still have an active delete thread — leave it alone.
            if not _is_recent(entry):
                to_delete.append(entry)
            continue
        is_tmp = name.startswith(".tmp-")
        sha = name[len(".tmp-"):] if is_tmp else name
        if not _SHA_PATTERN.fullmatch(sha) or sha in keep:
            continue
        if _is_recent(entry):
            continue
        # The per-snapshot lock serializes against an in-flight creation in
        # this process: if one was underway, it completes first (and a .tmp
        # entry will have been renamed to its final path, making it vanish
        # from under us).
        async with _get_repo_lock(owner, repo, f"snapshot/{sha}"):
            if not entry.exists() or _is_recent(entry):
                continue
            trash = snapshots_dir / f".trash-{sha}-{os.getpid()}-{len(to_delete)}"
            try:
                os.rename(entry, trash)
            except OSError:
                continue
        to_delete.append(trash)
        if not is_tmp:
            removed.append(sha)

    _delete_dirs_in_background(to_delete)
    if removed:
        logger.info(f"GC removed {len(removed)} snapshot(s) of {owner}/{repo}")
    return removed


# Timeout per ls-remote for update checks. These run while the user's serial
# worker is occupied (blocking their file browsing etc.), so fail fast — a
# missed badge beats a hung UI when GitHub is slow.
_LS_REMOTE_TIMEOUT = 10


async def get_remote_head(url: str, username: str | None = None) -> str | None:
    """Resolve the remote tip commit of the revision baked into a stored URL.

    Used by the update-available check: compares against the app's pinned
    commit_sha. Returns None when the remote can't be reached or the revision
    no longer exists (no badge rather than an error). A revision that is
    itself a commit SHA resolves to itself — such an app can never drift.

    A URL without a revision only reaches here for legacy branch=None rows
    (clone_url_for_stored_app makes pinned revisions explicit) and for code
    repos referenced by bare manifest repo_urls; both track the remote's
    *current default*, so resolve HEAD rather than assuming "main".
    """
    if username:
        result = await _dispatch(username, "remote_heads", urls=[url])
        return (result.get("shas") or {}).get(url)

    owner, repo, branch = _parse_github_url(url)
    if branch and _SHA_PATTERN.fullmatch(branch):
        return branch

    if branch:
        patterns = [f"refs/heads/{branch}", f"refs/tags/{branch}"]
        # Branch tips win; for annotated tags prefer the peeled commit
        # (refs/tags/x^{}) that ls-remote emits alongside the tag object.
        preference = (f"refs/heads/{branch}",
                      f"refs/tags/{branch}^{{}}",
                      f"refs/tags/{branch}")
    else:
        patterns = ["HEAD"]
        preference = ("HEAD",)

    https_url, ssh_url = _github_remote_urls(owner, repo)
    for remote, extra_env in ((https_url, None), (ssh_url, _SSH_GIT_ENV)):
        try:
            stdout, _ = await _run_git(
                ["git", "ls-remote", remote, *patterns],
                timeout=_LS_REMOTE_TIMEOUT, extra_env=extra_env,
            )
        except ValueError as e:
            # Private repo over HTTPS: retry via SSH; anything else, give up.
            if _is_git_auth_error(str(e)):
                continue
            return None
        except Exception:
            return None

        shas_by_ref: dict[str, str] = {}
        for line in stdout.decode().splitlines():
            parts = line.split()
            if len(parts) == 2:
                shas_by_ref[parts[1]] = parts[0]
        for ref in preference:
            sha = shas_by_ref.get(ref)
            if sha and _SHA_PATTERN.fullmatch(sha):
                return sha
        return None
    return None


async def get_remote_heads(urls: list[str],
                           username: str | None = None) -> dict[str, str | None]:
    """Resolve remote tips for several stored URLs in one worker round-trip.

    The per-user worker handles one request at a time, so N sequential
    dispatches would occupy it for N ls-remote timeouts; batching bounds the
    occupancy to the slowest single lookup (they run concurrently in-process).
    """
    urls = list(dict.fromkeys(urls))
    if not urls:
        return {}

    if username:
        result = await _dispatch(username, "remote_heads", urls=urls)
        shas = result.get("shas") or {}
        return {url: shas.get(url) for url in urls}

    results = await asyncio.gather(
        *(get_remote_head(url) for url in urls), return_exceptions=True,
    )
    return {
        url: (sha if isinstance(sha, str) else None)
        for url, sha in zip(urls, results)
    }


_SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.pixi', '.venv', 'venv'}


def _read_manifest_file(manifest_dir: Path) -> AppManifest:
    """Read and validate a runnables.yaml file from the given directory.

    Falls back to registered manifest adapters if no runnables.yaml is found.
    Raises ValueError if no adapter can handle the directory.
    """
    filepath = manifest_dir / _MANIFEST_FILENAME
    if filepath.is_file():
        data = yaml.safe_load(filepath.read_text())
        return AppManifest(**data)

    # Try registered adapters (e.g. Nextflow, Snakemake, etc.)
    adapted = try_adapt(manifest_dir)
    if adapted is not None:
        return adapted

    raise ValueError(
        f"No {_MANIFEST_FILENAME} or recognized project config found in {manifest_dir}."
    )


def _find_manifests_in_repo(repo_dir: Path) -> list[tuple[str, AppManifest]]:
    """Walk the cloned repo and discover all manifest files.

    First pass: walk the repo looking for runnables.yaml files.
    If none are found, fall back to registered manifest adapters, letting
    each adapter search the repo on its own terms (e.g. Nextflow only checks
    the repo root for nextflow_schema.json).

    Returns a list of (relative_dir_path, AppManifest) tuples.
    Uses "" for root-level manifests.
    """
    from fileglancer.apps.adapters import MANIFEST_ADAPTERS

    # First pass: walk the repo looking for runnables.yaml files
    results: list[tuple[str, AppManifest]] = []
    for dirpath, dirnames, filenames in os.walk(repo_dir, topdown=True):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]

        if _MANIFEST_FILENAME not in filenames:
            continue

        current = Path(dirpath)
        filepath = current / _MANIFEST_FILENAME
        try:
            data = yaml.safe_load(filepath.read_text())
            manifest = AppManifest(**data)
        except Exception as e:
            logger.warning(f"Skipping invalid manifest in {dirpath}: {e}")
            continue

        rel = current.relative_to(repo_dir)
        rel_str = str(rel) if str(rel) != "." else ""
        results.append((rel_str, manifest))

    if results:
        return results

    # No runnables.yaml found — check each adapter against the repo root.
    # Collect any conversion errors rather than raising on the first one, so a
    # single adapter's failure doesn't prevent a later adapter from handling the
    # repo. Errors are only surfaced if no adapter ultimately produced a manifest.
    adapter_errors: list[str] = []
    for adapter in MANIFEST_ADAPTERS:
        try:
            if adapter.can_handle(repo_dir):
                results.append(("", adapter.convert(repo_dir)))
        except Exception as e:
            adapter_errors.append(f"{type(adapter).__name__}: {e}")

    if results:
        # At least one adapter succeeded; log the rest so failures aren't silent.
        for err in adapter_errors:
            logger.warning(f"Adapter failed but another handled the repo — {err}")
        return results

    if adapter_errors:
        raise ValueError(
            "Failed to build a manifest from the repository:\n  - "
            + "\n  - ".join(adapter_errors)
        )

    return results


MANIFEST_FILENAME = _MANIFEST_FILENAME


async def discover_app_manifests(
    url: str,
    username: str | None = None,
) -> tuple[str, str | None, list[tuple[str, AppManifest]]]:
    """Clone/pull a GitHub repo and discover all manifest files.

    Returns (resolved_branch, head_sha, [(relative_dir_path, AppManifest), ...]).
    The resolved branch is the revision actually cloned — resolved in the same
    process that does the clone, so a private repo's real default branch is used
    rather than a fallback. head_sha is the commit at the tip of that revision,
    used to pin apps added from this discovery. Raises ValueError if the URL is
    invalid or the clone fails.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user (which holds the user's SSH credentials).
    """
    if username:
        result = await _dispatch(username, "discover_manifests", url=url)
        manifests = [
            (item["path"], AppManifest(**item["manifest"]))
            for item in result["manifests"]
        ]
        return result["branch"], result.get("head_sha"), manifests

    repo_dir = await _ensure_repo_cache(url, pull=True)
    owner, repo, _ = _parse_github_url(url)
    branch = repo_dir.relative_to(
        (_repo_cache_base() / owner / repo).resolve()
    ).as_posix()
    head_sha = await _git_head_sha(repo_dir)
    return branch, head_sha, _find_manifests_in_repo(repo_dir)


async def fetch_app_manifest(url: str, manifest_path: str = "",
                             username: str | None = None,
                             sha: str | None = None) -> AppManifest:
    """Fetch and validate an app manifest from a cloned repo.

    With sha, the manifest is read from the immutable snapshot of that commit
    (materializing it if needed) — a pinned app's manifest never drifts just
    because the branch clone was pulled past its pin. Without sha, reads from
    the mutable branch clone (preview semantics), cloning if needed.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user.
    """
    # Reject traversal/unsafe input early, before any worker round-trip.
    validate_manifest_path(manifest_path)
    if sha is not None:
        validate_commit_sha(sha)

    if username:
        result = await _dispatch(username, "read_manifest", url=url,
                                 manifest_path=manifest_path, sha=sha)
        return AppManifest(**result["manifest"])

    if sha is not None:
        repo_dir, _ = await ensure_repo_snapshot(url, sha=sha)
    else:
        repo_dir = await _ensure_repo_cache(url)
    target_dir = _safe_repo_subdir(repo_dir, manifest_path)
    return _read_manifest_file(target_dir)


async def _fetch_manifest_with_pin_fallback(fetch_url: str, manifest_path: str,
                                            username: str | None,
                                            sha: str | None) -> AppManifest:
    """Read the manifest at the pinned commit, falling back to the branch
    clone when the pin can't be materialized (snapshot lost and the commit
    rewritten away upstream). A drifted manifest beats an unusable app; the
    next successful update re-pins.
    """
    if sha is None:
        return await fetch_app_manifest(fetch_url, manifest_path, username=username)
    try:
        return await fetch_app_manifest(fetch_url, manifest_path,
                                        username=username, sha=sha)
    except Exception as e:
        logger.warning(
            f"Pinned manifest read failed for {fetch_url}@{sha[:7]} ({e}); "
            f"falling back to the branch clone"
        )
        return await fetch_app_manifest(fetch_url, manifest_path, username=username)


async def get_or_load_manifest(username: str, url: str,
                                manifest_path: str = "") -> AppManifest:
    """Return the manifest for an app, preferring the DB cache.

    Hot path: a single SELECT plus model_validate — no disk I/O,
    no worker dispatch.

    If the cached manifest is missing (NULL) or fails validation
    (schema drift), falls back to reading from disk via
    fetch_app_manifest and writes the fresh value back to the row.

    If no row exists for (username, url, manifest_path), reads from
    disk and returns the manifest without creating a row (preview
    semantics for not-yet-installed apps).
    """
    from pydantic import ValidationError

    settings = get_settings()

    with db.get_db_session(settings.db_url) as session:
        row = db.get_user_app(session, username, url, manifest_path)
        stored = row.manifest if row else None
        row_exists = row is not None
        row_url = row.url if row is not None else url
        row_branch = row.branch if row is not None else None
        row_sha = row.commit_sha if row is not None else None

    if stored is not None:
        try:
            return AppManifest(**stored)
        except ValidationError as e:
            logger.warning(f"Stored manifest schema mismatch for {url}: {e}")

    fetch_url = clone_url_for_stored_app(row_url, row_branch) if row_exists else url
    manifest = await _fetch_manifest_with_pin_fallback(
        fetch_url, manifest_path, username, row_sha)

    if row_exists:
        # Cache refresh: sync only the manifest column. Name/description stay
        # untouched — they may be user-chosen (e.g. a custom catalog name) —
        # as do the requested revision and pins.
        with db.get_db_session(settings.db_url) as session:
            db.update_user_app_manifest_cache(
                session, username,
                url=row_url, manifest_path=manifest_path,
                manifest=manifest.model_dump(mode="json"),
            )

    return manifest


async def refresh_cached_manifest(username: str, url: str,
                                   manifest_path: str = "",
                                   bump_updated_at: bool = False
                                   ) -> AppManifest:
    """Re-read the manifest from disk and sync the cache.

    Call this after any operation that mutates the on-disk YAML
    (clone or git pull) so the DB cache stays in lockstep with disk.

    No-op on the DB if (username, url, manifest_path) has no row —
    callers that need to insert a new row should use upsert_user_app
    directly. Leaves the requested revision (the branch column) untouched.

    Returns the refreshed manifest.
    """
    settings = get_settings()
    with db.get_db_session(settings.db_url) as session:
        row = db.get_user_app(session, username, url, manifest_path)
        row_exists = row is not None
        row_url = row.url if row_exists else url
        row_branch = row.branch if row_exists else None
        row_sha = row.commit_sha if row_exists else None

    fetch_url = clone_url_for_stored_app(row_url, row_branch) if row_exists else url
    manifest = await _fetch_manifest_with_pin_fallback(
        fetch_url, manifest_path, username, row_sha)

    with db.get_db_session(settings.db_url) as session:
        if row_exists:
            # Sync only the manifest column: name/description may be
            # user-chosen (e.g. a custom catalog name) and must survive
            # cache refreshes.
            db.update_user_app_manifest_cache(
                session, username,
                url=row_url, manifest_path=manifest_path,
                manifest=manifest.model_dump(mode="json"),
                bump_updated_at=bump_updated_at,
            )

    return manifest


async def get_app_branch(url: str) -> str:
    """Return the branch name for a GitHub app URL.

    If the URL doesn't specify a branch, resolves the remote's default branch.
    """
    owner, repo, branch = _parse_github_url(url)
    if not branch:
        branch = await _resolve_default_branch(owner, repo)
    return branch


def canonical_app_url(url: str, resolved_branch: str) -> tuple[str, str]:
    """Build the (canonical_url, requested_branch) pair to store for an app.

    Called once, at add time, to fix the app's revision. Pure string work — no
    network: the resolved branch is supplied by the caller (resolved in whatever
    process actually cloned the repo, e.g. the user's worker for private repos).

    The canonical URL carries the resolved revision being cloned, so a repo whose
    default is "master" yields ".../tree/master" while "main" folds to the bare
    URL. requested_branch is the revision the user asked for verbatim — "" means
    they gave a bare URL and took whatever the default was at add time. The
    revision is fixed from here on; the app does not re-resolve later (re-add it
    to pick up a moved default).
    """
    owner, repo, url_branch = _parse_github_url(url)
    return github_url_at_branch(owner, repo, resolved_branch), (url_branch or "")


def clone_url_for_stored_app(url: str, branch: str | None) -> str:
    """Return the explicit GitHub URL to clone/fetch for a stored app.

    Stored app URLs are canonical and intentionally fold the fixed "main"
    revision to a bare URL for UI and de-dupe compatibility. A bare GitHub URL is
    unsafe for operational git work, though, because git interprets it as "the
    repo's current default branch", which can move. So for a *pinned* app, make
    the revision explicit (a bare URL means the fixed "main").

    branch is the row's recorded revision. None marks a legacy row migrated from
    user_preferences whose default branch was never recorded: those historically
    tracked the repo's default branch, so the URL is returned unchanged (a bare
    URL keeps resolving the current default) rather than guessing "main", which
    would break a repo that defaults to e.g. "master". Such rows get pinned the
    next time the app is re-added.
    """
    if branch is None:
        return url
    owner, repo, url_branch = _parse_github_url(url)
    return github_url_with_branch(owner, repo, url_branch or "main")
