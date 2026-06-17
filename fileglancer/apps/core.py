"""Apps module for fetching manifests, building commands, and managing cluster jobs."""

import asyncio
try:
    import fcntl
except ImportError:
    fcntl = None  # type: ignore[assignment]
try:
    import pwd
except ImportError:
    pwd = None  # type: ignore[assignment]
import os
import re
import shlex
import tempfile
from pathlib import Path
from datetime import datetime, UTC
from typing import Optional

import yaml
from loguru import logger

from cluster_api import ResourceSpec

from fileglancer import database as db
from fileglancer.apps.adapters import try_adapt
from fileglancer.model import AppManifest, AppEntryPoint, AppParameter
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


async def _run_git(args: list[str], timeout: int = 60):
    """Run a git command asynchronously.

    Raises ValueError with a readable message on failure.
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            ),
            timeout=timeout,
        )
        stdout, stderr = await proc.communicate()
    except asyncio.TimeoutError:
        raise ValueError(f"Git command timed out after {timeout}s: {' '.join(args)}")

    if proc.returncode != 0:
        err = stderr.decode().strip() if stderr else "unknown error"
        raise ValueError(f"Git command failed: {err}")


async def _resolve_default_branch(clone_url: str) -> str:
    """Query a remote repo for its default branch (HEAD).

    Falls back to 'main' if the remote cannot be queried.
    """
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                "git", "ls-remote", "--symref", clone_url, "HEAD",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            ),
            timeout=30,
        )
        stdout, _ = await proc.communicate()
        if proc.returncode == 0:
            # Output: "ref: refs/heads/master\tHEAD\n..."
            for line in stdout.decode().splitlines():
                if line.startswith("ref:"):
                    ref = line.split()[1]
                    return ref.removeprefix("refs/heads/")
    except (asyncio.TimeoutError, Exception):
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

    # No runnables.yaml found — check each adapter against the repo root
    for adapter in MANIFEST_ADAPTERS:
        try:
            if adapter.can_handle(repo_dir):
                results.append(("", adapter.convert(repo_dir)))
        except Exception as e:
            raise ValueError(f"Adapter {type(adapter).__name__} failed: {e}")


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


# --- Requirement Verification ---

_TOOL_REGISTRY = {
    "pixi": {
        "version_args": ["pixi", "--version"],
        "version_pattern": r"pixi (\S+)",
    },
    "npm": {
        "version_args": ["npm", "--version"],
        "version_pattern": r"^(\S+)$",
    },
    "maven": {
        "version_args": ["mvn", "--version"],
        "version_pattern": r"Apache Maven (\S+)",
    },
    "miniforge": {
        "version_args": ["conda", "--version"],
        "version_pattern": r"conda (\S+)",
    },
    "apptainer": {
        "version_args": ["apptainer", "--version"],
        "version_pattern": r"apptainer version (\S+)",
    },
    "nextflow": {
        "version_args": ["nextflow", "-version"],
        "version_pattern": r"version (\S+)",
    },
}

_REQ_PATTERN = re.compile(r"^([a-zA-Z][a-zA-Z0-9_-]*)\s*((?:>=|<=|!=|==|>|<)\s*[^,\s><=!]+)?$")


def merge_requirements(
    manifest_requirements: list[str], entry_point_requirements: list[str]
) -> list[str]:
    """Merge manifest-level and entry-point-level requirements.

    Entry-point requirements for the same tool override the manifest-level
    version spec (e.g. entry point 'pixi>=0.50' overrides manifest 'pixi>=0.40').
    Requirements are deduped by tool name, with entry-point taking precedence.
    """
    if not entry_point_requirements:
        return manifest_requirements
    if not manifest_requirements:
        return entry_point_requirements

    # Parse tool names from entry-point requirements
    ep_tools = set()
    for req in entry_point_requirements:
        tool = _REQ_PATTERN.match(req.strip())
        if tool:
            ep_tools.add(tool.group(1))

    # Keep manifest requirements that aren't overridden by entry-point
    merged = [
        req for req in manifest_requirements
        if _REQ_PATTERN.match(req.strip()) and _REQ_PATTERN.match(req.strip()).group(1) not in ep_tools
    ]
    merged.extend(entry_point_requirements)
    return merged


# Shared bash helpers emitted once at the top of a requirements-check snippet.
# Kept as a module constant so it is easy to read and test.
_REQ_CHECK_PREAMBLE = r"""__fg_errors=()
__fg_check_tool() {
  # $1 = tool name (for messages), $2 = binary to look for on PATH
  if command -v "$2" >/dev/null 2>&1; then return 0; fi
  __fg_errors+=("Required tool '$1' is not installed or not on PATH")
  return 1
}
__fg_extract_version() { grep -oE '[0-9]+([.][0-9]+)*' | head -n1 || true; }
__fg_ver_le() {
  # returns 0 if $1 <= $2 (version order)
  [ "$1" = "$2" ] && return 0
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$1" ]
}
__fg_check_version() {
  # $1=tool $2=installed $3=op $4=required
  local tool="$1" v="$2" op="$3" req="$4" ok=1
  if [ -z "$v" ]; then
    __fg_errors+=("Could not determine version for '$tool' to check $op$req")
    return 0
  fi
  case "$op" in
    ">=") __fg_ver_le "$req" "$v" && ok=0 ;;
    "<=") __fg_ver_le "$v" "$req" && ok=0 ;;
    ">")  { __fg_ver_le "$req" "$v" && [ "$v" != "$req" ]; } && ok=0 ;;
    "<")  { __fg_ver_le "$v" "$req" && [ "$v" != "$req" ]; } && ok=0 ;;
    "==") [ "$v" = "$req" ] && ok=0 ;;
    "!=") [ "$v" != "$req" ] && ok=0 ;;
  esac
  [ "$ok" -ne 0 ] && __fg_errors+=("'$tool' version $v does not satisfy $op$req")
  return 0
}"""

_REQ_OP_PATTERN = re.compile(r"(>=|<=|!=|==|>|<)\s*([^,\s><=!]+)")


def build_requirements_check(requirements: list[str]) -> str:
    """Build a bash snippet that verifies required tools at job runtime.

    This snippet runs inside the job on the compute node, as the user, after
    conda/env activation, so it reflects the actual execution environment
    rather than the server's PATH at submit time. On any unmet requirement it
    prints all errors to
    stderr and exits 1, which marks the job FAILED and surfaces the message in
    the job's stderr log.

    Returns an empty string when there are no requirements.
    """
    if not requirements:
        return ""

    checks = []
    for req in requirements:
        req = req.strip()
        match = _REQ_PATTERN.match(req)
        if not match:
            checks.append(f"__fg_errors+=({shlex.quote(f'Invalid requirement format: {req!r}')})")
            continue

        tool = match.group(1)
        version_spec = match.group(2)
        registry_entry = _TOOL_REGISTRY.get(tool)
        binary = registry_entry["version_args"][0] if registry_entry else tool

        if not version_spec:
            checks.append(f"__fg_check_tool {shlex.quote(tool)} {shlex.quote(binary)} || true")
            continue

        op_match = _REQ_OP_PATTERN.match(version_spec.strip())
        op = op_match.group(1)
        required = op_match.group(2)

        if not registry_entry:
            # Tool exists check still runs; version cannot be verified.
            msg = f"Cannot check version for '{tool}': no version command configured"
            checks.append(
                f"if __fg_check_tool {shlex.quote(tool)} {shlex.quote(binary)}; then\n"
                f"  __fg_errors+=({shlex.quote(msg)})\n"
                f"fi"
            )
            continue

        version_cmd = " ".join(shlex.quote(a) for a in registry_entry["version_args"])
        checks.append(
            f"if __fg_check_tool {shlex.quote(tool)} {shlex.quote(binary)}; then\n"
            f"  __fg_v=\"$({version_cmd} 2>&1 | __fg_extract_version)\"\n"
            f"  __fg_check_version {shlex.quote(tool)} \"$__fg_v\" {shlex.quote(op)} {shlex.quote(required)}\n"
            f"fi"
        )

    finalizer = (
        'if [ "${#__fg_errors[@]}" -gt 0 ]; then\n'
        '  echo "ERROR: This app\'s requirements are not met in the execution environment:" >&2\n'
        '  for __fg_e in "${__fg_errors[@]}"; do echo "  - $__fg_e" >&2; done\n'
        "  exit 1\n"
        "fi"
    )

    return "\n".join([
        "# Verify required tools are available in this environment (Fileglancer)",
        _REQ_CHECK_PREAMBLE,
        *checks,
        finalizer,
    ])


# --- Path Validation ---

# Characters that are dangerous in shell commands
_SHELL_METACHAR_PATTERN = re.compile(r'[;&|`$(){}!<>\n\r]')
_WINDOWS_DRIVE_PATTERN = re.compile(r'^[a-zA-Z]:/')


def validate_path_for_shell(path_value: str) -> str | None:
    """Validate path syntax for use in shell commands (no filesystem I/O).

    Checks for shell metacharacters, rejects '..', and requires paths to
    start with '/', '~', or './'.
    Returns an error message string if invalid, or None if valid.
    """
    normalized = path_value.replace("\\", "/")

    # Cloud storage URIs are passed through as opaque strings
    if normalized.startswith(("s3://", "gs://", "https://")):
        return None

    if _SHELL_METACHAR_PATTERN.search(normalized):
        return "Path contains invalid characters"

    if ".." in normalized:
        return "Path must not contain '..'"

    if not (normalized.startswith("/") or normalized.startswith("~") or normalized.startswith("./")
            or _WINDOWS_DRIVE_PATTERN.match(normalized)):
        return "Must be an absolute or relative path (starting with /, ~, or ./)"

    return None


def validate_path_in_filestore(path_value: str, fsps: list) -> str | None:
    """Validate a path exists and is readable within an allowed file share.

    Performs syntax checks, then resolves the path against the given list of
    file share paths. Returns an error message string if invalid, or None if
    valid.
    """
    # Syntax check first
    error = validate_path_for_shell(path_value)
    if error:
        return error

    normalized = path_value.replace("\\", "/")

    # Relative paths and cloud storage URIs are not local filesystem paths;
    # skip filestore validation.
    if normalized.startswith("./") or normalized.startswith(("s3://", "gs://", "https://")):
        return None

    expanded = os.path.expanduser(normalized)

    # Resolve to a file share path
    from fileglancer.database import find_fsp_in_paths
    result = find_fsp_in_paths(fsps, expanded)
    if result is None:
        return "Path is not within an allowed file share"

    fsp, subpath = result

    from fileglancer.filestore import Filestore
    filestore = Filestore(fsp)
    return filestore.validate_path(subpath)


# --- Command Building ---

# Valid environment variable name
_ENV_VAR_NAME_PATTERN = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _validate_parameter_value(param: AppParameter, value, session=None) -> str:
    """Validate a single parameter value against its schema and return the string representation.

    When session is provided and param type is file/directory, validates that
    the path is within an allowed file share mount. Otherwise falls back to
    syntax-only validation.

    Raises ValueError if validation fails.
    """
    if param.type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(f"Parameter '{param.name}' must be a boolean")
        return str(value)

    if param.type == "integer":
        try:
            int_val = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{param.name}' must be an integer")
        if param.min is not None and int_val < param.min:
            raise ValueError(f"Parameter '{param.name}' must be >= {param.min}")
        if param.max is not None and int_val > param.max:
            raise ValueError(f"Parameter '{param.name}' must be <= {param.max}")
        return str(int_val)

    if param.type == "number":
        try:
            num_val = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{param.name}' must be a number")
        if param.min is not None and num_val < param.min:
            raise ValueError(f"Parameter '{param.name}' must be >= {param.min}")
        if param.max is not None and num_val > param.max:
            raise ValueError(f"Parameter '{param.name}' must be <= {param.max}")
        return str(num_val)

    if param.type == "enum":
        str_val = str(value)
        if param.options and str_val not in param.options:
            raise ValueError(f"Parameter '{param.name}' must be one of {param.options}")
        return str_val

    # string, file, directory
    str_val = str(value)

    if param.type in ("file", "directory"):
        str_val = str_val.replace("\\", "/")
        # Expand ~ so the path works inside shlex.quote() single quotes,
        # where the shell would not perform tilde expansion.
        # Use euid so this works when the server runs as root with seteuid.
        if str_val.startswith("~/") or str_val == "~":
            try:
                home = pwd.getpwuid(os.geteuid()).pw_dir
            except (AttributeError, KeyError):
                home = os.path.expanduser("~")
            home = home.replace("\\", "/")
            str_val = home + str_val[1:]
        if session is not None:
            fsps = db.get_file_share_paths(session)
            error = validate_path_in_filestore(str_val, fsps)
        else:
            error = validate_path_for_shell(str_val)
        if error:
            raise ValueError(f"Parameter '{param.name}': {error}")

    if param.type == "string" and param.pattern:
        if not re.fullmatch(param.pattern, str_val):
            raise ValueError(f"Parameter '{param.name}' does not match required pattern")

    return str_val


def build_command(entry_point: AppEntryPoint, parameters: dict, session=None) -> str:
    """Build a shell command from an entry point and parameter values.

    All parameter values are validated and shell-escaped.
    Flagged parameters are emitted first in declaration order,
    then positional parameters (no flag) in declaration order.
    When session is provided, file/directory parameters are validated
    against allowed file share mounts.
    Raises ValueError for invalid parameters.
    """
    # Build a lookup of parameter definitions by key
    flat_params = entry_point.flat_parameters()
    param_defs = {p.key: p for p in flat_params}

    # Validate required parameters
    for param in flat_params:
        if param.required and param.key not in parameters:
            if param.default is None:
                raise ValueError(f"Required parameter '{param.name}' is missing")

    # Check for unknown parameters
    for param_key in parameters:
        if param_key not in param_defs:
            raise ValueError(f"Unknown parameter '{param_key}'")

    # Compute effective values: user-provided merged with defaults
    effective: dict[str, tuple[AppParameter, any]] = {}
    for param in flat_params:
        if param.key in parameters:
            effective[param.key] = (param, parameters[param.key])
        elif param.default is not None:
            effective[param.key] = (param, param.default)

    # Start with the base command
    parts = [entry_point.command]

    # Pass 1: Flagged args in declaration order
    for param in flat_params:
        if param.flag is None:
            continue
        if param.key not in effective:
            continue
        p, value = effective[param.key]
        validated = _validate_parameter_value(p, value, session=session)
        if p.type == "boolean":
            if value is True:
                parts.append(p.flag)
        else:
            parts.append(f"{p.flag} {shlex.quote(validated)}")

    # Pass 2: Positional args in declaration order
    for param in flat_params:
        if param.flag is not None:
            continue
        if param.key not in effective:
            continue
        p, value = effective[param.key]
        validated = _validate_parameter_value(p, value, session=session)
        if p.raw:
            if _SHELL_METACHAR_PATTERN.search(validated):
                raise ValueError(
                    f"Parameter '{p.name}' contains forbidden shell characters"
                )
            parts.append(validated)
        else:
            parts.append(shlex.quote(validated))

    return (" \\\n  ").join(parts)


# --- Job Monitoring ---
#
# The server process runs as root, which cannot execute LSF commands
# (bjobs, bsub, bkill) due to HPC root-squash policy.  All LSF
# operations go through the persistent per-user worker pool.
#
# The poll loop picks any user with active jobs and dispatches a ``poll``
# action through that user's worker, passing the explicit list of
# cluster_job_ids to query.  py-cluster-api's executor then runs ``bjobs``
# for just those IDs.  LSF normally allows querying jobs by ID across
# users, so one worker's call returns statuses for all users' jobs.

_poll_task = None
_POLL_LOCK_PATH = os.path.join(tempfile.gettempdir(), "fileglancer_poll.lock")


async def start_job_monitor():
    """Reconnect any in-flight jobs and start polling if needed.

    Only one uvicorn worker performs the reconnect (via file lock).
    The poll loop is only started if there are active jobs in the DB;
    otherwise it waits until a job is submitted (see ensure_poll_loop).
    """
    settings = get_settings()

    # Only one worker should reconnect at startup — use the same lock.
    try:
        with open(_POLL_LOCK_PATH, "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            await _reconnect_as_any_user(settings)
            fcntl.flock(f, fcntl.LOCK_UN)
        logger.info("Job monitor started (reconnected existing jobs)")
    except OSError:
        logger.info("Job monitor started (reconnect handled by another worker)")

    # Only start the poll loop if there are already active jobs
    if _get_any_active_username(settings) is not None:
        ensure_poll_loop()
        logger.info("Poll loop started (active jobs found at startup)")
    else:
        logger.info("Poll loop deferred (no active jobs)")


def ensure_poll_loop():
    """Start the poll loop if it is not already running.

    Called by submit_job after a new job is created, and by
    start_job_monitor if active jobs exist at startup.
    Safe to call multiple times — only one loop runs at a time.
    """
    global _poll_task

    if _poll_task is not None and not _poll_task.done():
        return  # already running

    settings = get_settings()
    _poll_task = asyncio.create_task(_poll_loop(settings))
    logger.info("Poll loop started")


async def stop_job_monitor():
    """Stop the background job poll loop."""
    global _poll_task

    if _poll_task:
        _poll_task.cancel()
        try:
            await _poll_task
        except asyncio.CancelledError:
            pass
        _poll_task = None

    logger.info("Job monitor stopped")


def _get_any_active_username(settings) -> str | None:
    """Return any username that has active (PENDING/RUNNING) jobs, or None."""
    with db.get_db_session(settings.db_url) as session:
        active_jobs = db.get_active_jobs(session)
        for job in active_jobs:
            if job.username:
                return job.username
    return None


async def _reconnect_as_any_user(settings):
    """Reconnect to existing cluster jobs via the persistent worker.

    Picks any user with active jobs in the DB and dispatches a ``reconnect``
    action through their worker; py-cluster-api re-attaches to the jobs it
    finds.  If no active jobs exist in the DB, reconnection is skipped
    (nothing to reconnect to).
    """
    username = _get_any_active_username(settings)
    if not username:
        logger.debug("No active jobs, skipping reconnect")
        return

    cluster_config = settings.cluster.model_dump(exclude_none=True)
    try:
        result = await _dispatch(username, "reconnect", cluster_config=cluster_config)
    except Exception as e:
        logger.debug(f"Job reconnection skipped: {e}")
        return

    jobs = result.get("jobs", {})
    if jobs:
        logger.info(f"Reconnected to {len(jobs)} existing cluster jobs")

    # Update DB for any reconnected jobs that we're tracking
    with db.get_db_session(settings.db_url) as session:
        for cluster_job_id, info in jobs.items():
            db_job = db.get_job_by_cluster_id(session, cluster_job_id)
            if db_job is None:
                continue
            new_status = info["status"].upper()
            if new_status != db_job.status:
                is_terminal = new_status in ("DONE", "FAILED", "KILLED")
                finished_at = _parse_iso_dt(info.get("finish_time")) if is_terminal else None
                db.update_job_status(
                    session, db_job.id, new_status,
                    exit_code=info.get("exit_code"),
                    started_at=_parse_iso_dt(info.get("start_time")),
                    finished_at=finished_at,
                )


async def _poll_loop(settings):
    """Periodically poll cluster job statuses via the persistent worker.

    All uvicorn workers run this loop, but only the one that acquires
    the file lock actually polls.  The lock is held through both the
    poll and the sleep, so staggered workers can't double-poll within
    the same interval.  If the lock-holding worker dies, the OS
    releases the lock and another worker takes over next cycle.

    The loop exits automatically when there are no active jobs,
    and is restarted on the next job submission via ensure_poll_loop().
    """
    global _poll_task

    while True:
        lock_fd = None
        try:
            lock_fd = open(_POLL_LOCK_PATH, "w")
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                has_jobs = await _poll_jobs(settings)
            except Exception:
                logger.exception("Error in job poll loop")
                has_jobs = True  # keep polling on error
            # Hold lock through the sleep so no other worker polls
            # until this interval is over
            await asyncio.sleep(settings.cluster.poll_interval)
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()

            if not has_jobs:
                logger.info("No active jobs — poll loop stopping")
                _poll_task = None
                return
        except OSError:
            # Another worker is polling this cycle — skip and retry
            if lock_fd:
                lock_fd.close()
            await asyncio.sleep(settings.cluster.poll_interval)


async def _poll_jobs(settings):
    """Run one poll cycle: query bjobs via worker, update DB.

    Returns True if there are active jobs to continue polling,
    False if the loop can stop.
    """
    with db.get_db_session(settings.db_url) as session:
        active_jobs = db.get_active_jobs(session)

        if not active_jobs:
            return False

        # Handle zombie jobs (no cluster_job_id after timeout)
        jobs_to_poll = []
        for db_job in active_jobs:
            if not db_job.cluster_job_id:
                created = db_job.created_at.replace(tzinfo=None) if db_job.created_at.tzinfo else db_job.created_at
                age_minutes = (datetime.now(UTC).replace(tzinfo=None) - created).total_seconds() / 60
                if age_minutes > settings.cluster.zombie_timeout_minutes:
                    db.update_job_status(session, db_job.id, "FAILED", finished_at=datetime.now(UTC))
                    logger.warning(
                        f"Job {db_job.id} has no cluster_job_id after "
                        f"{age_minutes:.0f} minutes, marked FAILED"
                    )
                continue
            jobs_to_poll.append(db_job)

        if not jobs_to_poll:
            return True  # zombie jobs still pending, keep polling

        # Local executor: poll by checking PID files instead of spawning
        # a worker subprocess (which would create a fresh executor with
        # no knowledge of the running processes).
        if settings.cluster.executor == "local":
            return _poll_local_jobs(session, jobs_to_poll)

        # Pick any user to run the poll through. py-cluster-api will query
        # each cluster_job_id explicitly; LSF allows querying jobs by ID
        # across users, so one worker's call covers everyone's jobs.
        poll_username = jobs_to_poll[0].username
        # Pass current known statuses so stubs are seeded correctly.
        # Without this, stubs default to PENDING and jobs whose status
        # bjobs doesn't return would revert to PENDING in the DB.
        job_statuses = {
            j.cluster_job_id: j.status for j in jobs_to_poll
        }

        cluster_config = settings.cluster.model_dump(exclude_none=True)
        try:
            result = await _dispatch(
                poll_username, "poll",
                cluster_config=cluster_config,
                cluster_job_ids=list(job_statuses.keys()),
                job_statuses=job_statuses,
            )
        except Exception as e:
            logger.warning(f"Poll failed: {e}")
            return True  # keep polling on error

        polled_jobs = result.get("jobs", {})

        # Update DB with polled statuses
        for db_job in jobs_to_poll:
            info = polled_jobs.get(db_job.cluster_job_id)
            if info is None:
                continue
            new_status = info["status"].upper()
            old_status = db_job.status
            if new_status == old_status:
                continue
            is_terminal = new_status in ("DONE", "FAILED", "KILLED")
            finished_at = _parse_iso_dt(info.get("finish_time")) if is_terminal else None
            db.update_job_status(
                session, db_job.id, new_status,
                exit_code=info.get("exit_code") if is_terminal else None,
                started_at=_parse_iso_dt(info.get("start_time")),
                finished_at=finished_at,
            )
            logger.info(f"Job {db_job.id} status updated: {old_status} -> {new_status}")

        return True


def _poll_local_jobs(session, jobs_to_poll: list) -> bool:
    """Poll local executor jobs by checking PID files and process liveness.

    The local executor runs jobs as bash subprocesses.  The submit worker
    writes the PID to ``{work_dir}/job.pid``, and the script writes its
    exit code to ``{work_dir}/exit_code`` via an EXIT trap.

    Returns True if there are still active jobs, False otherwise.
    """
    still_active = False

    for db_job in jobs_to_poll:
        work_dir = Path(db_job.work_dir) if db_job.work_dir else None
        if not work_dir:
            still_active = True
            continue

        pid_file = work_dir / "job.pid"
        if not pid_file.exists():
            still_active = True
            continue

        try:
            pid = int(pid_file.read_text().strip())
        except (ValueError, OSError):
            still_active = True
            continue

        old_status = db_job.status
        try:
            os.kill(pid, 0)
            # Process is still alive
            still_active = True
            if old_status == "PENDING":
                db.update_job_status(
                    session, db_job.id, "RUNNING",
                    started_at=datetime.now(UTC),
                )
                logger.info(f"Job {db_job.id} status updated: PENDING -> RUNNING")
        except ProcessLookupError:
            # Process has exited — read exit code from the trap file
            exit_code = _read_exit_code(work_dir)
            new_status = "DONE" if exit_code == 0 else "FAILED"
            now = datetime.now(UTC)
            db.update_job_status(
                session, db_job.id, new_status,
                exit_code=exit_code,
                finished_at=now,
                started_at=now if old_status == "PENDING" else None,
            )
            logger.info(f"Job {db_job.id} status updated: {old_status} -> {new_status}")
        except PermissionError:
            # Process exists but owned by another user — still running
            still_active = True
            if old_status == "PENDING":
                db.update_job_status(
                    session, db_job.id, "RUNNING",
                    started_at=datetime.now(UTC),
                )
                logger.info(f"Job {db_job.id} status updated: PENDING -> RUNNING")

    return still_active


def _read_exit_code(work_dir: Path) -> int | None:
    """Read the exit code written by the EXIT trap in the job script."""
    exit_code_file = work_dir / "exit_code"
    if not exit_code_file.exists():
        return None
    try:
        return int(exit_code_file.read_text().strip())
    except (ValueError, OSError):
        return None


def _parse_iso_dt(s: str | None) -> datetime | None:
    """Parse an ISO 8601 datetime string, or return None."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


# --- Job Submission ---

def _sanitize_for_path(s: str) -> str:
    """Sanitize a string for use in a directory name."""
    return re.sub(r'[^a-zA-Z0-9._-]', '_', s)


_CONTAINER_SIF_SAFE = re.compile(r'[^a-zA-Z0-9._-]')


def _container_sif_name(container_url: str) -> str:
    """Derive a safe SIF filename from a container URL."""
    url = container_url.removeprefix("docker://")
    return _CONTAINER_SIF_SAFE.sub('_', url) + ".sif"


_DEFAULT_CONTAINER_CACHE_DIR = "$HOME/.fileglancer/apptainer_cache"


def _build_container_script(
    container_url: str,
    command: str,
    work_dir: str,
    bind_paths: list[str],
    container_args: Optional[str] = None,
    cache_dir: Optional[str] = None,
) -> str:
    """Build shell script for running a command inside an Apptainer container."""
    sif_name = _container_sif_name(container_url)
    docker_url = container_url if container_url.startswith("docker://") else f"docker://{container_url}"

    # Deduplicate and sort bind paths
    all_binds = sorted(set([work_dir] + bind_paths))
    bind_flags = " ".join(f"--bind {shlex.quote(p)}" for p in all_binds)

    extra = f" {container_args}" if container_args else ""

    resolved_dir = shlex.quote(cache_dir) if cache_dir else _DEFAULT_CONTAINER_CACHE_DIR

    lines = [
        "# Apptainer container setup",
        f'APPTAINER_CACHE_DIR={resolved_dir}',
        'mkdir -p "$APPTAINER_CACHE_DIR"',
        f'SIF_PATH="$APPTAINER_CACHE_DIR/{sif_name}"',
        'if [ ! -f "$SIF_PATH" ]; then',
        f'  apptainer pull "$SIF_PATH" {shlex.quote(docker_url)}',
        'fi',
        f'apptainer exec {bind_flags}{extra} "$SIF_PATH" \\',
        f'  {command}',
    ]
    return "\n".join(lines)


def _build_work_dir(job_id: int, app_name: str, entry_point_id: str,
                    job_name_prefix: Optional[str] = None,
                    username: Optional[str] = None) -> Path:
    """Build a working directory path under ~/.fileglancer/jobs/.

    When username is provided, expands ~username to the user's home directory
    instead of the server process's home (which is typically root).
    """
    safe_app = _sanitize_for_path(app_name)
    safe_ep = _sanitize_for_path(entry_point_id)
    prefix = f"{_sanitize_for_path(job_name_prefix)}-" if job_name_prefix else ""
    home = os.path.expanduser(f"~{username}") if username else os.path.expanduser("~")
    return Path(f"{home}/.fileglancer/jobs/{prefix}{job_id}-{safe_app}-{safe_ep}")


async def submit_job(
    username: str,
    app_url: str,
    entry_point_id: str,
    parameters: dict,
    resources: Optional[dict] = None,
    extra_args: Optional[str] = None,
    manifest_path: str = "",
    env: Optional[dict] = None,
    pre_run: Optional[str] = None,
    post_run: Optional[str] = None,
    container: Optional[str] = None,
    container_args: Optional[str] = None,
) -> db.JobDB:
    """Submit a new job to the cluster.

    Fetches the manifest, validates parameters, builds the command,
    submits to the executor, and creates a DB record.
    Each job runs in its own directory under ~/.fileglancer/jobs/.
    """
    settings = get_settings()

    # Read manifest from the cache when available; fall back to disk.
    manifest = await get_or_load_manifest(username, app_url, manifest_path)

    # Find entry point
    entry_point = None
    for ep in manifest.runnables:
        if ep.id == entry_point_id:
            entry_point = ep
            break
    if entry_point is None:
        raise ValueError(f"Entry point '{entry_point_id}' not found in manifest")

    # Merge manifest-level with entry-point-level requirements. These are
    # verified at job runtime (see build_requirements_check below) rather than
    # here on the server, because the job runs on the compute node as the user
    # with a potentially different environment.
    effective_requirements = merge_requirements(
        manifest.requirements, entry_point.requirements
    )

    # Build command (with DB session for path validation against file shares)
    with db.get_db_session(settings.db_url) as session:
        command = build_command(entry_point, parameters, session=session)

    # Build resource spec (extra_args passed separately, not from manifest)
    overrides = dict(resources) if resources else {}
    if extra_args is not None:
        overrides["extra_args"] = extra_args
    resource_spec = _build_resource_spec(entry_point, overrides or None, settings)

    # Merge env/pre_run/post_run: manifest defaults overridden by user values
    merged_env = dict(entry_point.env or {})
    if env:
        merged_env.update(env)
    effective_pre_run = pre_run if pre_run is not None else (entry_point.pre_run or None)
    effective_post_run = post_run if post_run is not None else (entry_point.post_run or None)
    effective_container = container if container is not None else (entry_point.container or None)
    effective_container_args = container_args if container_args is not None else (entry_point.container_args or None)

    # Create DB record first to get job ID for the work directory
    resources_dict = None
    if resource_spec:
        resources_dict = {
            "cpus": resource_spec.cpus,
            "memory": resource_spec.memory,
            "walltime": resource_spec.walltime,
            "queue": resource_spec.queue,
            "extra_args": " ".join(resource_spec.extra_args) if resource_spec.extra_args else None,
        }

    with db.get_db_session(settings.db_url) as session:
        # Read user's container cache dir preference
        cache_dir_pref = db.get_user_preference(session, username, "apptainerCacheDir")
        container_cache_dir = cache_dir_pref.get("value") if cache_dir_pref else None

        db_job = db.create_job(
            session=session,
            username=username,
            app_url=app_url,
            app_name=manifest.name,
            entry_point_id=entry_point.id,
            entry_point_name=entry_point.name,
            entry_point_type=entry_point.type,
            parameters=parameters,
            resources=resources_dict,
            manifest_path=manifest_path,
            env=merged_env or None,
            pre_run=effective_pre_run,
            post_run=effective_post_run,
            container=effective_container,
            container_args=effective_container_args,
        )
        job_id = db_job.id

        # Compute and persist work_dir now that we have the job ID
        work_dir = _build_work_dir(job_id, manifest.name, entry_point.id,
                                   job_name_prefix=settings.cluster.job_name_prefix,
                                   username=username)
        db_job.work_dir = str(work_dir)
        session.commit()

    # Ensure the repo is cached in the user's cache (~username/.fileglancer/apps).
    # Pulling is never done here; updates are an explicit user action via the
    # "Update" app endpoint. The manifest read above already reflects the cache.
    if manifest.repo_url and manifest.repo_url != app_url:
        # Manifest and tool code live in separate repos: cache the code repo
        # and run from its root.
        cached_repo_dir = await _ensure_repo_cache(manifest.repo_url, username=username)
        cd_suffix = "repo"
    else:
        # Manifest and tool code share one repo: cache it and run from the
        # subdirectory that contains the manifest.
        cached_repo_dir = await _ensure_repo_cache(app_url, username=username)
        cd_suffix = f"repo/{manifest_path}" if manifest_path else "repo"

    # Build environment variable export lines
    env_lines = ""
    if merged_env:
        parts = []
        for var_name, var_value in merged_env.items():
            if not _ENV_VAR_NAME_PATTERN.match(var_name):
                raise ValueError(f"Invalid environment variable name: '{var_name}'")
            parts.append(f"export {var_name}={shlex.quote(var_value)}")
        env_lines = "\n".join(parts) + "\n"

    # Set up the script preamble:
    # - FG_WORK_DIR: the job's working directory (used by subsequent variables)
    # - Unset PIXI_PROJECT_MANIFEST so pixi uses the repo's own manifest
    # - SERVICE_URL_PATH: for service-type jobs, where to write the service URL
    # - cd into the repo so commands can find project files (pixi.toml, scripts, etc.)
    preamble_lines = [
        "unset PIXI_PROJECT_MANIFEST",
        f"export FG_WORK_DIR={shlex.quote(str(work_dir))}",
    ]
    # For local executor, trap EXIT to write the exit code to a file so
    # PID-based polling can determine the final status after the process exits.
    if settings.cluster.executor == "local":
        preamble_lines.append(
            'trap \'echo $? > "$FG_WORK_DIR/exit_code"\' EXIT'
        )
    if settings.apps.extra_paths:
        path_suffix = os.pathsep.join(shlex.quote(p) for p in settings.apps.extra_paths)
        preamble_lines.append(f"export PATH=$PATH:{path_suffix}")
    if entry_point.type == "service":
        preamble_lines.append('export SERVICE_URL_PATH="$FG_WORK_DIR/service_url"')
    preamble_lines.append(f'cd "$FG_WORK_DIR/{cd_suffix}"')
    script_parts = ["\n".join(preamble_lines)]

    # Conda environment activation
    if entry_point.conda_env:
        conda_activation = (
            'eval "$(conda shell.bash hook)"\n'
            f'conda activate {shlex.quote(entry_point.conda_env)}'
        )
        script_parts.append(conda_activation)

    # If container is defined, wrap command in apptainer exec
    if effective_container:
        bind_paths = []
        for param in entry_point.flat_parameters():
            if param.type in ("file", "directory") and param.key in parameters:
                path_val = str(parameters[param.key])
                expanded = os.path.expanduser(path_val)
                if param.type == "directory":
                    bind_paths.append(expanded)
                else:
                    bind_paths.append(str(Path(expanded).parent))
        if entry_point.bind_paths:
            bind_paths.extend(entry_point.bind_paths)

        command = _build_container_script(
            container_url=effective_container,
            command=command,
            work_dir=str(work_dir),
            bind_paths=bind_paths,
            container_args=effective_container_args,
            cache_dir=container_cache_dir,
        )

    if env_lines:
        script_parts.append(env_lines.rstrip())
    # Verify required tools now that PATH, conda, and env vars are set up, but
    # before pre_run/command do any real work. Fails the job with a readable
    # message in stderr if a requirement is unmet.
    req_check = build_requirements_check(effective_requirements)
    if req_check:
        script_parts.append(req_check)
    if effective_pre_run:
        script_parts.append(effective_pre_run.rstrip())
    script_parts.append(command)
    if effective_post_run:
        script_parts.append(effective_post_run.rstrip())
    full_command = "\n\n".join(script_parts)

    # Set work_dir and log paths on resource spec
    resource_spec.work_dir = str(work_dir)
    resource_spec.stdout_path = str(work_dir / "stdout.log")
    resource_spec.stderr_path = str(work_dir / "stderr.log")

    # Submit to the cluster as the target user via the persistent worker:
    # it creates the work directory, symlinks the repo, and calls
    # executor.submit() — all with the user's identity.
    job_name = f"{manifest.name}-{entry_point.id}"
    cluster_config = settings.cluster.model_dump(exclude_none=True)
    try:
        worker_result = await _dispatch(
            username, "submit",
            cluster_config=cluster_config,
            command=full_command,
            job_name=job_name,
            resources={
                "cpus": resource_spec.cpus,
                "gpus": resource_spec.gpus,
                "memory": resource_spec.memory,
                "walltime": resource_spec.walltime,
                "queue": resource_spec.queue,
                "work_dir": resource_spec.work_dir,
                "stdout_path": resource_spec.stdout_path,
                "stderr_path": resource_spec.stderr_path,
                "extra_directives": resource_spec.extra_directives,
                "extra_args": resource_spec.extra_args,
            },
            work_dir=str(work_dir),
            cached_repo_dir=str(cached_repo_dir),
        )
    except Exception:
        # Cluster submission failed — remove the PENDING DB record so
        # the job does not appear in the user's jobs list.
        with db.get_db_session(settings.db_url) as session:
            db.delete_job(session, job_id, username)
        raise

    cluster_job_id = worker_result["job_id"]

    # Update DB with cluster job ID — the poll loop will track status from here
    with db.get_db_session(settings.db_url) as session:
        db.update_job_status(
            session, job_id, "PENDING",
            cluster_job_id=cluster_job_id,
        )
        db_job = db.get_job(session, job_id, username)
        session.expunge(db_job)

    ensure_poll_loop()
    logger.info(f"Job {db_job.id} submitted for user {username} in {work_dir}")
    return db_job


def _build_resource_spec(entry_point: AppEntryPoint, overrides: Optional[dict], settings) -> ResourceSpec:
    """Build a ResourceSpec from entry point defaults, user overrides, and global defaults."""
    cpus = settings.cluster.cpus
    memory = settings.cluster.memory
    walltime = settings.cluster.walltime
    queue = settings.cluster.queue

    # Apply entry point defaults
    if entry_point.resources:
        if entry_point.resources.cpus is not None:
            cpus = entry_point.resources.cpus
        if entry_point.resources.memory is not None:
            memory = entry_point.resources.memory
        if entry_point.resources.walltime is not None:
            walltime = entry_point.resources.walltime
        if entry_point.resources.queue is not None:
            queue = entry_point.resources.queue

    # Apply user overrides
    # extra_args default to config values; user overrides replace them entirely
    extra_args = list(settings.cluster.extra_args) if settings.cluster.extra_args else None
    if overrides:
        if overrides.get("cpus") is not None:
            cpus = overrides["cpus"]
        if overrides.get("memory") is not None:
            memory = overrides["memory"]
        if overrides.get("walltime") is not None:
            walltime = overrides["walltime"]
        if overrides.get("queue") is not None:
            queue = overrides["queue"]
        if overrides.get("extra_args") is not None:
            extra_args = [overrides["extra_args"]]

    return ResourceSpec(
        cpus=cpus,
        memory=memory,
        walltime=walltime,
        queue=queue,
        extra_args=extra_args,
    )


async def cancel_job(job_id: int, username: str) -> db.JobDB:
    """Cancel a running or pending job."""
    settings = get_settings()

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, username)
        if db_job is None:
            raise ValueError(f"Job {job_id} not found")
        if db_job.status not in ("PENDING", "RUNNING"):
            raise ValueError(f"Job {job_id} is not cancellable (status: {db_job.status})")

        # Cancel on cluster as the target user
        if db_job.cluster_job_id:
            cluster_config = settings.cluster.model_dump(exclude_none=True)
            await _dispatch(
                username, "cancel",
                cluster_config=cluster_config,
                job_id=db_job.cluster_job_id,
            )

        # Update DB
        now = datetime.now(UTC)
        db.update_job_status(session, db_job.id, "KILLED", finished_at=now)
        db_job = db.get_job(session, db_job.id, username)
        session.expunge(db_job)

    logger.info(f"Job {job_id} cancelled by user {username}")
    return db_job


# --- Job File Access ---

def _resolve_work_dir(db_job: db.JobDB) -> Path:
    """Resolve a job's work directory to an absolute path."""
    if db_job.work_dir:
        return Path(db_job.work_dir)
    return _build_work_dir(db_job.id, db_job.app_name, db_job.entry_point_id)


def _resolve_browse_path(abs_path: str, fsps: Optional[list] = None) -> tuple[str | None, str | None]:
    """Resolve an absolute path to an FSP name and subpath for browse links.

    If *fsps* is None, queries the database directly. Pass a pre-fetched list
    to avoid the DB hit (used from the worker subprocess, which has no DB
    access).
    """
    if fsps is None:
        settings = get_settings()
        with db.get_db_session(settings.db_url) as session:
            result = db.find_fsp_from_absolute_path(session, abs_path)
    else:
        result = db.find_fsp_in_paths(fsps, abs_path)
    if result:
        return result[0].name, result[1]
    return None, None


def _make_file_info(file_path: str, exists: bool, fsps: Optional[list] = None) -> dict:
    """Create a file info dict with browse link resolution."""
    fsp_name, subpath = _resolve_browse_path(file_path, fsps) if exists else (None, None)
    return {
        "path": file_path,
        "exists": exists,
        "fsp_name": fsp_name,
        "subpath": subpath,
    }


def get_service_url(db_job: db.JobDB) -> Optional[str]:
    """Read the service URL from a job's work directory.

    Only returns a URL when the job is a service type and is currently RUNNING.
    The service writes its URL to a plain text file named 'service_url' in the
    job's work directory.
    """
    if getattr(db_job, 'entry_point_type', 'job') != 'service':
        return None
    if db_job.status != 'RUNNING':
        return None

    work_dir = _resolve_work_dir(db_job)
    url_file = work_dir / "service_url"

    if not url_file.is_file():
        return None

    try:
        url = url_file.read_text().strip()
    except OSError:
        return None

    if not url.startswith(("http://", "https://")):
        return None

    return url


def get_job_file_paths(db_job: db.JobDB, fsps: Optional[list] = None) -> dict[str, dict]:
    """Return file path info for a job's files (script, stdout, stderr, service_url).

    Returns a dict keyed by file type with path and existence info. Pass *fsps*
    to skip the per-file DB lookup needed for browse-link resolution.
    """
    work_dir = _resolve_work_dir(db_job)

    # Find script file
    scripts = sorted(work_dir.glob("*.sh")) if work_dir.exists() else []
    script_path = str(scripts[0]) if scripts else str(work_dir / "script.sh")

    stdout_path = work_dir / "stdout.log"
    stderr_path = work_dir / "stderr.log"

    files = {
        "script": _make_file_info(script_path, len(scripts) > 0, fsps),
        "stdout": _make_file_info(str(stdout_path), stdout_path.is_file(), fsps),
        "stderr": _make_file_info(str(stderr_path), stderr_path.is_file(), fsps),
    }

    # Include service_url file info for service-type jobs
    if getattr(db_job, 'entry_point_type', 'job') == 'service':
        service_url_path = work_dir / "service_url"
        files["service_url"] = _make_file_info(str(service_url_path), service_url_path.is_file(), fsps)

    return files


def read_job_file(db_job, file_type: str) -> Optional[str]:
    """Read the content of a job file given a loaded job record.

    All job files live in the job's work directory:
      - *.sh        — the generated script (written by cluster-api)
      - stdout.log  — captured standard output
      - stderr.log  — captured standard error

    Returns the file content as a string, or None if the file doesn't exist.
    """
    work_dir = _resolve_work_dir(db_job)

    if file_type == "script":
        # Find the script generated by cluster-api (e.g. jobname.1.sh)
        scripts = sorted(work_dir.glob("*.sh"))
        if scripts:
            return scripts[0].read_text()
        return None
    elif file_type == "stdout":
        path = work_dir / "stdout.log"
    elif file_type == "stderr":
        path = work_dir / "stderr.log"
    else:
        raise ValueError(f"Unknown file type: {file_type}")

    if path.is_file():
        return path.read_text()
    return None


def get_job_file_content(job_id: int, username: str, file_type: str) -> Optional[str]:
    """Read job file by id+username (does its own DB lookup)."""
    settings = get_settings()

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, username)
        if db_job is None:
            raise ValueError(f"Job {job_id} not found")
        session.expunge(db_job)

    return read_job_file(db_job, file_type)
