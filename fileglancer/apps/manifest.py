"""Worker dispatch, git repo caching, and app manifest discovery/loading."""

import asyncio
import os
import re
from contextlib import suppress
from pathlib import Path

import yaml
from loguru import logger

from fileglancer import database as db
from fileglancer.apps.adapters import try_adapt
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


def _parse_github_url(url: str) -> tuple[str, str, str | None]:
    """Parse a GitHub repo URL into (owner, repo, branch).

    Branch is None when not specified in the URL.
    Raises ValueError if not a valid GitHub repo URL.
    """
    pattern = r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/([^/]+))?/?$"
    match = re.match(pattern, url)
    if not match:
        raise ValueError(
            f"Invalid app URL: '{url}'. Only GitHub repository URLs are supported "
            f"(e.g., https://github.com/owner/repo)."
        )
    owner, repo, branch = match.groups()

    # Validate segments to prevent path traversal
    for name, value in [("owner", owner), ("repo", repo)]:
        if ".." in value or "\x00" in value:
            raise ValueError(
                f"Invalid app URL: {name} '{value}' contains invalid characters"
            )
    if branch and (".." in branch or "\x00" in branch):
        raise ValueError(
            f"Invalid app URL: branch '{branch}' contains invalid characters"
        )

    return owner, repo, branch


async def _run_git(args: list[str], timeout: int = 60) -> tuple[bytes, bytes]:
    """Run a git command asynchronously.

    The timeout covers the command's full runtime, not just process creation.
    Raises ValueError with a readable message on failure.
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
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


async def _resolve_default_branch(clone_url: str) -> str:
    """Query a remote repo for its default branch (HEAD).

    Falls back to 'main' if the remote cannot be queried.
    """
    try:
        stdout, _ = await _run_git(
            ["git", "ls-remote", "--symref", clone_url, "HEAD"],
            timeout=30,
        )
        # Output: "ref: refs/heads/master\tHEAD\n..."
        for line in stdout.decode().splitlines():
            if line.startswith("ref:"):
                ref = line.split()[1]
                return ref.removeprefix("refs/heads/")
    except Exception:
        pass
    return "main"


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
    clone_url = f"https://github.com/{owner}/{repo}.git"
    if not branch:
        branch = await _resolve_default_branch(clone_url)

    if username:
        lock = _get_repo_lock(owner, repo, branch)
        async with lock:
            result = await _dispatch(username, "ensure_repo", url=url, pull=pull)
            return Path(result["repo_dir"])

    # Running as the current user (worker subprocess or dev mode)
    logger.debug(f"ensure_repo running in-process as euid={os.geteuid()}")
    cache_base = _repo_cache_base()
    repo_dir = (cache_base / owner / repo / branch).resolve()
    repo_dir.relative_to(cache_base.resolve())
    lock = _get_repo_lock(owner, repo, branch)

    async with lock:
        if repo_dir.exists():
            logger.debug(f"Repo cache hit: {owner}/{repo} ({branch})")
            if pull:
                logger.info(f"Pulling latest for {owner}/{repo} ({branch})")
                await _run_git(["git", "-C", str(repo_dir), "fetch", "origin", branch])
                await _run_git(["git", "-C", str(repo_dir), "reset", "--hard", f"origin/{branch}"])
        else:
            logger.info(f"Cloning {owner}/{repo} ({branch}) into {repo_dir}")
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            await _run_git(
                ["git", "clone", "--branch", branch, clone_url, str(repo_dir)],
                timeout=120,
            )

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


async def discover_app_manifests(url: str,
                                 username: str | None = None) -> list[tuple[str, AppManifest]]:
    """Clone/pull a GitHub repo and discover all manifest files.

    Returns a list of (relative_dir_path, AppManifest) tuples.
    Raises ValueError if the URL is invalid or the clone fails.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user.
    """
    if username:
        result = await _dispatch(username, "discover_manifests", url=url)
        return [
            (item["path"], AppManifest(**item["manifest"]))
            for item in result["manifests"]
        ]

    repo_dir = await _ensure_repo_cache(url, pull=True)
    return _find_manifests_in_repo(repo_dir)


async def fetch_app_manifest(url: str, manifest_path: str = "",
                             username: str | None = None) -> AppManifest:
    """Fetch and validate an app manifest from a cloned repo.

    Clones the repo if needed, then reads the manifest from disk.

    When username is provided, the work is delegated to a worker subprocess
    running as the target user.
    """
    if username:
        result = await _dispatch(username, "read_manifest", url=url, manifest_path=manifest_path)
        return AppManifest(**result["manifest"])

    repo_dir = await _ensure_repo_cache(url)
    target_dir = repo_dir / manifest_path if manifest_path else repo_dir
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

    if stored is not None:
        try:
            return AppManifest(**stored)
        except ValidationError as e:
            logger.warning(f"Stored manifest schema mismatch for {url}: {e}")

    manifest = await fetch_app_manifest(url, manifest_path, username=username)

    if row_exists:
        branch = await get_app_branch(url)
        with db.get_db_session(settings.db_url) as session:
            db.upsert_user_app(
                session, username,
                url=url, manifest_path=manifest_path,
                name=manifest.name, description=manifest.description,
                branch=branch,
                manifest=manifest.model_dump(mode="json"),
                bump_updated_at=False,
            )

    return manifest


async def refresh_cached_manifest(username: str, url: str,
                                   manifest_path: str = "",
                                   bump_updated_at: bool = False
                                   ) -> tuple[AppManifest, str]:
    """Re-read the manifest from disk and sync the cache.

    Call this after any operation that mutates the on-disk YAML
    (clone or git pull) so the DB cache stays in lockstep with disk.

    No-op on the DB if (username, url, manifest_path) has no row —
    callers that need to insert a new row should use upsert_user_app
    directly.

    Returns (manifest, branch).
    """
    manifest = await fetch_app_manifest(url, manifest_path, username=username)
    branch = await get_app_branch(url)

    settings = get_settings()
    with db.get_db_session(settings.db_url) as session:
        if db.get_user_app(session, username, url, manifest_path) is not None:
            db.upsert_user_app(
                session, username,
                url=url, manifest_path=manifest_path,
                name=manifest.name, description=manifest.description,
                branch=branch,
                manifest=manifest.model_dump(mode="json"),
                bump_updated_at=bump_updated_at,
            )

    return manifest, branch


async def get_app_branch(url: str) -> str:
    """Return the branch name for a GitHub app URL.

    If the URL doesn't specify a branch, resolves the remote's default branch.
    """
    _, _, branch = _parse_github_url(url)
    if not branch:
        clone_url = re.sub(r"(/tree/[^/]+)?/?$", ".git", url)
        branch = await _resolve_default_branch(clone_url)
    return branch
