"""Worker dispatch, git repo caching, and app manifest discovery/loading."""

import asyncio
import os
import shutil
from contextlib import suppress
from pathlib import Path, PurePosixPath

import yaml
from loguru import logger

from fileglancer import database as db
from fileglancer.apps.adapters import try_adapt
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
    repo_dir = (cache_base / owner / repo / branch).resolve()
    repo_dir.relative_to(cache_base.resolve())
    lock = _get_repo_lock(owner, repo, branch)

    async with lock:
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
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            await _clone_repo(owner, repo, branch, repo_dir)

    return repo_dir


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
) -> tuple[str, list[tuple[str, AppManifest]]]:
    """Clone/pull a GitHub repo and discover all manifest files.

    Returns (resolved_branch, [(relative_dir_path, AppManifest), ...]). The
    resolved branch is the revision actually cloned — resolved in the same
    process that does the clone, so a private repo's real default branch is used
    rather than a fallback. Raises ValueError if the URL is invalid or the clone
    fails.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user (which holds the user's SSH credentials).
    """
    if username:
        result = await _dispatch(username, "discover_manifests", url=url)
        manifests = [
            (item["path"], AppManifest(**item["manifest"]))
            for item in result["manifests"]
        ]
        return result["branch"], manifests

    repo_dir = await _ensure_repo_cache(url, pull=True)
    owner, repo, _ = _parse_github_url(url)
    branch = repo_dir.relative_to(
        (_repo_cache_base() / owner / repo).resolve()
    ).as_posix()
    return branch, _find_manifests_in_repo(repo_dir)


async def fetch_app_manifest(url: str, manifest_path: str = "",
                             username: str | None = None) -> AppManifest:
    """Fetch and validate an app manifest from a cloned repo.

    Clones the repo if needed, then reads the manifest from disk.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user.
    """
    # Reject traversal/unsafe input early, before any worker round-trip.
    validate_manifest_path(manifest_path)

    if username:
        result = await _dispatch(username, "read_manifest", url=url, manifest_path=manifest_path)
        return AppManifest(**result["manifest"])

    repo_dir = await _ensure_repo_cache(url)
    target_dir = _safe_repo_subdir(repo_dir, manifest_path)
    return _read_manifest_file(target_dir)


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

    if stored is not None:
        try:
            return AppManifest(**stored)
        except ValidationError as e:
            logger.warning(f"Stored manifest schema mismatch for {url}: {e}")

    fetch_url = clone_url_for_stored_app(row_url) if row_exists else url
    manifest = await fetch_app_manifest(fetch_url, manifest_path, username=username)

    if row_exists:
        # branch=None: this is a cache refresh, so leave the requested revision
        # (the branch column) untouched.
        with db.get_db_session(settings.db_url) as session:
            db.upsert_user_app(
                session, username,
                url=row_url, manifest_path=manifest_path,
                name=manifest.name, description=manifest.description,
                manifest=manifest.model_dump(mode="json"),
                bump_updated_at=False,
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

    fetch_url = clone_url_for_stored_app(row_url) if row_exists else url
    manifest = await fetch_app_manifest(fetch_url, manifest_path, username=username)

    with db.get_db_session(settings.db_url) as session:
        if row_exists:
            db.upsert_user_app(
                session, username,
                url=row_url, manifest_path=manifest_path,
                name=manifest.name, description=manifest.description,
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


def clone_url_for_stored_app(url: str) -> str:
    """Return the explicit GitHub URL to clone/fetch for a stored app URL.

    Stored app URLs are canonical and intentionally fold the fixed "main"
    revision to a bare URL for UI and de-dupe compatibility. A bare GitHub URL is
    unsafe for operational git work, though, because git interprets it as "the
    repo's current default branch". Treat a stored bare URL as the fixed "main"
    revision and make it explicit before cloning, fetching, or reading from disk.
    """
    owner, repo, branch = _parse_github_url(url)
    return github_url_with_branch(owner, repo, branch or "main")
