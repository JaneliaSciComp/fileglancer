"""Apps module for fetching manifests, building commands, and managing cluster jobs."""

import asyncio
import os
import re
import shlex
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, UTC
from typing import Optional

import yaml
from loguru import logger
from packaging.specifiers import SpecifierSet
from packaging.version import Version

from cluster_api import create_executor, ResourceSpec, JobMonitor
from cluster_api._types import JobStatus

from fileglancer import database as db
from fileglancer.model import AppManifest, AppEntryPoint, AppParameter
from fileglancer.settings import get_settings


_MANIFEST_FILENAME = "runnables.yaml"

_REPO_CACHE_BASE = Path(os.path.expanduser("~/.fileglancer/apps"))
_repo_locks: dict[str, asyncio.Lock] = {}


def _get_repo_lock(owner: str, repo: str, branch: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a specific repo+branch."""
    key = f"{owner}/{repo}/{branch}"
    if key not in _repo_locks:
        _repo_locks[key] = asyncio.Lock()
    return _repo_locks[key]


def _parse_github_url(url: str) -> tuple[str, str, str]:
    """Parse a GitHub repo URL into (owner, repo, branch).

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
    branch = branch or "main"

    # Validate segments to prevent path traversal
    for name, value in [("owner", owner), ("repo", repo), ("branch", branch)]:
        if ".." in value or "\x00" in value:
            raise ValueError(
                f"Invalid app URL: {name} '{value}' contains invalid characters"
            )

    return owner, repo, branch


async def _run_git(args: list[str], timeout: int = 60):
    """Run a git command asynchronously.

    Raises ValueError with a readable message on failure.
    """
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            ),
            timeout=timeout,
        )
        stdout, stderr = await proc.communicate()
    except asyncio.TimeoutError:
        raise ValueError(f"Git command timed out after {timeout}s: {' '.join(args)}")

    if proc.returncode != 0:
        err = stderr.decode().strip() if stderr else "unknown error"
        raise ValueError(f"Git command failed: {err}")


async def _ensure_repo_cache(url: str, pull: bool = False) -> Path:
    """Clone or update the GitHub repo in per-user cache. Returns repo path.

    Cache is keyed by owner/repo/branch to avoid checkout races between branches.
    An asyncio lock serializes git operations for the same repo+branch.
    """
    owner, repo, branch = _parse_github_url(url)
    repo_dir = _REPO_CACHE_BASE / owner / repo / branch
    lock = _get_repo_lock(owner, repo, branch)

    async with lock:
        if repo_dir.exists():
            logger.debug(f"Repo cache hit: {owner}/{repo} ({branch})")
            if pull:
                logger.info(f"Pulling latest for {owner}/{repo} ({branch})")
                await _run_git(["git", "-C", str(repo_dir), "pull", "origin", branch])
        else:
            logger.info(f"Cloning {owner}/{repo} ({branch}) into {repo_dir}")
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            clone_url = f"https://github.com/{owner}/{repo}.git"
            await _run_git(
                ["git", "clone", "--branch", branch, clone_url, str(repo_dir)],
                timeout=120,
            )

    return repo_dir


_SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.pixi', '.venv', 'venv'}


def _read_manifest_file(manifest_dir: Path) -> AppManifest:
    """Read and validate a runnables.yaml file from the given directory.

    Raises ValueError if the file is not found.
    """
    filepath = manifest_dir / _MANIFEST_FILENAME
    if not filepath.is_file():
        raise ValueError(
            f"No {_MANIFEST_FILENAME} found in {manifest_dir}."
        )
    data = yaml.safe_load(filepath.read_text())
    return AppManifest(**data)


def _find_manifests_in_repo(repo_dir: Path) -> list[tuple[str, AppManifest]]:
    """Walk the cloned repo and discover all manifest files.

    Returns a list of (relative_dir_path, AppManifest) tuples.
    Uses "" for root-level manifests.
    """
    results: list[tuple[str, AppManifest]] = []

    for dirpath, dirnames, filenames in os.walk(repo_dir, topdown=True):
        # Prune directories we should skip
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]

        if _MANIFEST_FILENAME not in filenames:
            continue

        current = Path(dirpath)
        try:
            manifest = _read_manifest_file(current)
        except (ValueError, Exception) as e:
            logger.warning(f"Skipping invalid manifest in {dirpath}: {e}")
            continue

        # Compute relative path from repo root
        rel = current.relative_to(repo_dir)
        rel_str = str(rel) if str(rel) != "." else ""
        results.append((rel_str, manifest))

    return results


async def fetch_app_manifest(url: str, manifest_path: str = "") -> AppManifest:
    """Fetch and validate an app manifest from a cloned repo.

    Clones the repo if needed, then reads the manifest from disk.
    """
    repo_dir = await _ensure_repo_cache(url)
    target_dir = repo_dir / manifest_path if manifest_path else repo_dir
    return _read_manifest_file(target_dir)


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
}

_REQ_PATTERN = re.compile(r"^([a-zA-Z][a-zA-Z0-9_-]*)\s*((?:>=|<=|!=|==|>|<)\s*\S+)?$")


def verify_requirements(requirements: list[str]):
    """Verify that all required tools are available and meet version constraints.

    Raises ValueError with a message listing all unmet requirements.
    """
    if not requirements:
        return

    errors = []

    for req in requirements:
        match = _REQ_PATTERN.match(req.strip())
        if not match:
            errors.append(f"Invalid requirement format: '{req}'")
            continue

        tool = match.group(1)
        version_spec = match.group(2)

        # Check tool exists on PATH
        if shutil.which(tool) is None:
            # For maven, the binary is 'mvn' not 'maven'
            registry_entry = _TOOL_REGISTRY.get(tool)
            binary = registry_entry["version_args"][0] if registry_entry else tool
            if binary != tool and shutil.which(binary) is not None:
                pass  # binary found under alternate name
            else:
                errors.append(f"Required tool '{tool}' is not installed or not on PATH")
                continue

        if version_spec:
            registry_entry = _TOOL_REGISTRY.get(tool)
            if not registry_entry:
                errors.append(f"Cannot check version for '{tool}': no version command configured")
                continue

            try:
                result = subprocess.run(
                    registry_entry["version_args"],
                    capture_output=True, text=True, timeout=10,
                )
                output = result.stdout.strip() or result.stderr.strip()
                ver_match = re.search(registry_entry["version_pattern"], output)
                if not ver_match:
                    errors.append(
                        f"Could not parse version for '{tool}' from output: {output!r}"
                    )
                    continue

                installed = Version(ver_match.group(1))
                specifier = SpecifierSet(version_spec.strip())
                if not specifier.contains(installed):
                    errors.append(
                        f"'{tool}' version {installed} does not satisfy {version_spec.strip()}"
                    )
            except FileNotFoundError:
                errors.append(f"Required tool '{tool}' is not installed or not on PATH")
            except subprocess.TimeoutExpired:
                errors.append(f"Timed out checking version for '{tool}'")

    if errors:
        raise ValueError("Unmet requirements:\n  - " + "\n  - ".join(errors))


# --- Command Building ---

# Characters that are dangerous in shell commands
_SHELL_METACHAR_PATTERN = re.compile(r'[;&|`$(){}!<>\n\r]')

# Valid environment variable name
_ENV_VAR_NAME_PATTERN = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _validate_parameter_value(param: AppParameter, value) -> str:
    """Validate a single parameter value against its schema and return the string representation.

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
        # Normalize backslashes to forward slashes
        str_val = str_val.replace("\\", "/")

        # Validate path characters
        if _SHELL_METACHAR_PATTERN.search(str_val):
            raise ValueError(f"Parameter '{param.name}' contains invalid characters")

        # Require absolute path
        if not str_val.startswith("/") and not str_val.startswith("~"):
            raise ValueError(f"Parameter '{param.name}' must be an absolute path (starting with / or ~)")

        # Verify path exists
        expanded = os.path.expanduser(str_val)
        if not os.path.exists(expanded):
            raise ValueError(f"Parameter '{param.name}': path does not exist: {str_val}")
        if not os.access(expanded, os.R_OK):
            raise ValueError(f"Parameter '{param.name}': path is not accessible: {str_val}")

    if param.type == "string" and param.pattern:
        if not re.fullmatch(param.pattern, str_val):
            raise ValueError(f"Parameter '{param.name}' does not match required pattern")

    return str_val


def build_command(entry_point: AppEntryPoint, parameters: dict) -> str:
    """Build a shell command from an entry point and parameter values.

    All parameter values are validated and shell-escaped.
    Positional parameters (no flag) are emitted first in declaration order,
    then flagged parameters in declaration order.
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

    # Pass 1: Positional args in declaration order
    for param in flat_params:
        if param.flag is not None:
            continue
        if param.key not in effective:
            continue
        p, value = effective[param.key]
        validated = _validate_parameter_value(p, value)
        parts.append(shlex.quote(validated))

    # Pass 2: Flagged args in declaration order
    for param in flat_params:
        if param.flag is None:
            continue
        if param.key not in effective:
            continue
        p, value = effective[param.key]
        validated = _validate_parameter_value(p, value)
        if p.type == "boolean":
            if value is True:
                parts.append(p.flag)
        else:
            parts.append(f"{p.flag} {shlex.quote(validated)}")

    return (" \\\n  ").join(parts)


# --- Executor Management ---

_executor = None
_monitor = None
_monitor_task = None


async def get_executor():
    """Get or create the cluster executor singleton."""
    global _executor
    if _executor is None:
        settings = get_settings()
        config = settings.cluster.model_dump(exclude_none=True)
        _executor = create_executor(**config)
    return _executor


async def start_job_monitor():
    """Start the background job monitoring loop."""
    global _monitor, _monitor_task

    settings = get_settings()
    executor = await get_executor()

    # Reconnect to any previously submitted jobs (e.g. after server restart)
    try:
        reconnected = await executor.reconnect()
        if reconnected:
            for record in reconnected:
                record.on_exit(_on_job_exit)
            logger.info(f"Reconnected to {len(reconnected)} existing cluster jobs")
    except Exception as e:
        logger.debug(f"Job reconnection skipped: {e}")

    _monitor = JobMonitor(executor, poll_interval=settings.cluster.poll_interval)
    await _monitor.start()

    # Start reconciliation loop
    _monitor_task = asyncio.create_task(_reconcile_loop(settings))
    logger.info("Job monitor started")


async def stop_job_monitor():
    """Stop the background job monitoring loop."""
    global _monitor, _monitor_task

    if _monitor_task:
        _monitor_task.cancel()
        try:
            await _monitor_task
        except asyncio.CancelledError:
            pass
        _monitor_task = None

    if _monitor:
        await _monitor.stop()
        _monitor = None

    logger.info("Job monitor stopped")


async def _reconcile_loop(settings):
    """Periodically reconcile DB job statuses with cluster state."""
    while True:
        try:
            await _reconcile_jobs(settings)
        except Exception:
            logger.exception("Error in job reconciliation loop")

        await asyncio.sleep(settings.cluster.poll_interval)


async def _reconcile_jobs(settings):
    """Reconcile DB job statuses with the executor's tracked jobs."""
    executor = await get_executor()

    with db.get_db_session(settings.db_url) as session:
        active_jobs = db.get_active_jobs(session)

        for db_job in active_jobs:
            if not db_job.cluster_job_id:
                # Job never got a cluster_job_id - submission didn't complete.
                # Mark FAILED if it's been stuck longer than zombie_timeout.
                created = db_job.created_at.replace(tzinfo=None) if db_job.created_at.tzinfo else db_job.created_at
                age_minutes = (datetime.now(UTC).replace(tzinfo=None) - created).total_seconds() / 60
                if age_minutes > settings.cluster.zombie_timeout_minutes:
                    db.update_job_status(session, db_job.id, "FAILED", finished_at=datetime.now(UTC))
                    logger.warning(
                        f"Job {db_job.id} has no cluster_job_id after "
                        f"{age_minutes:.0f} minutes, marked FAILED"
                    )
                continue

            # Check if executor is tracking this job
            tracked = executor.jobs.get(db_job.cluster_job_id)
            if tracked is None:
                # Job was purged from executor tracking. Terminal status
                # updates are handled by the on_exit callback, so this
                # means either the callback already fired or the job was
                # lost (e.g. server restart without reconnection).
                # Skip it here — the zombie timeout above will catch
                # truly stuck jobs that never got a cluster_job_id.
                continue

            # Sync non-terminal status changes (e.g. PENDING -> RUNNING).
            # Terminal transitions are handled by the on_exit callback.
            new_status = _map_status(tracked.status)
            if new_status != db_job.status:
                db.update_job_status(
                    session, db_job.id, new_status,
                    exit_code=tracked.exit_code,
                    started_at=tracked.start_time,
                    finished_at=tracked.finish_time,
                )
                logger.info(f"Job {db_job.id} status updated: {db_job.status} -> {new_status}")


def _map_status(status: JobStatus) -> str:
    """Map py-cluster-api JobStatus to our string status."""
    mapping = {
        JobStatus.PENDING: "PENDING",
        JobStatus.RUNNING: "RUNNING",
        JobStatus.DONE: "DONE",
        JobStatus.FAILED: "FAILED",
        JobStatus.KILLED: "KILLED",
        JobStatus.UNKNOWN: "FAILED",
    }
    return mapping.get(status, "FAILED")


def _on_job_exit(record):
    """Callback fired by JobMonitor when a job reaches terminal state.

    This runs inside the monitor's poll loop, before completed jobs are
    purged, so we are guaranteed to capture the final status.
    """
    settings = get_settings()
    new_status = _map_status(record.status)

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job_by_cluster_id(session, record.job_id)
        if db_job is None:
            logger.warning(f"No DB job found for cluster job {record.job_id}")
            return
        if db_job.status == new_status:
            return
        db.update_job_status(
            session, db_job.id, new_status,
            exit_code=record.exit_code,
            started_at=record.start_time,
            finished_at=record.finish_time,
        )
        logger.info(f"Job {db_job.id} completed: {db_job.status} -> {new_status}")


# --- Job Submission ---

def _sanitize_for_path(s: str) -> str:
    """Sanitize a string for use in a directory name."""
    return re.sub(r'[^a-zA-Z0-9._-]', '_', s)


def _build_work_dir(job_id: int, app_name: str, entry_point_id: str) -> Path:
    """Build a working directory path under ~/.fileglancer/jobs/."""
    safe_app = _sanitize_for_path(app_name)
    safe_ep = _sanitize_for_path(entry_point_id)
    return Path(os.path.expanduser(f"~/.fileglancer/jobs/{job_id}-{safe_app}-{safe_ep}"))


async def submit_job(
    username: str,
    app_url: str,
    entry_point_id: str,
    parameters: dict,
    resources: Optional[dict] = None,
    pull_latest: bool = False,
    manifest_path: str = "",
    env: Optional[dict] = None,
    pre_run: Optional[str] = None,
    post_run: Optional[str] = None,
) -> db.JobDB:
    """Submit a new job to the cluster.

    Fetches the manifest, validates parameters, builds the command,
    submits to the executor, and creates a DB record.
    Each job runs in its own directory under ~/.fileglancer/jobs/.
    """
    settings = get_settings()

    # Fetch and validate manifest
    manifest = await fetch_app_manifest(app_url, manifest_path)

    # Find entry point
    entry_point = None
    for ep in manifest.runnables:
        if ep.id == entry_point_id:
            entry_point = ep
            break
    if entry_point is None:
        raise ValueError(f"Entry point '{entry_point_id}' not found in manifest")

    # Verify requirements before proceeding
    verify_requirements(manifest.requirements)

    # Build command
    command = build_command(entry_point, parameters)

    # Build resource spec
    resource_spec = _build_resource_spec(entry_point, resources, settings)

    # Merge env/pre_run/post_run: manifest defaults overridden by user values
    merged_env = dict(entry_point.env or {})
    if env:
        merged_env.update(env)
    effective_pre_run = pre_run if pre_run is not None else (entry_point.pre_run or None)
    effective_post_run = post_run if post_run is not None else (entry_point.post_run or None)

    # Create DB record first to get job ID for the work directory
    resources_dict = None
    if resource_spec:
        resources_dict = {
            "cpus": resource_spec.cpus,
            "memory": resource_spec.memory,
            "walltime": resource_spec.walltime,
            "queue": resource_spec.queue,
        }

    with db.get_db_session(settings.db_url) as session:
        db_job = db.create_job(
            session=session,
            username=username,
            app_url=app_url,
            app_name=manifest.name,
            entry_point_id=entry_point.id,
            entry_point_name=entry_point.name,
            parameters=parameters,
            resources=resources_dict,
            manifest_path=manifest_path,
            env=merged_env or None,
            pre_run=effective_pre_run,
            post_run=effective_post_run,
            pull_latest=pull_latest,
        )
        job_id = db_job.id

    # Create work directory
    work_dir = _build_work_dir(job_id, manifest.name, entry_point.id)
    work_dir.mkdir(parents=True, exist_ok=True)

    # Determine which repo to symlink and where to cd
    if manifest.repo_url:
        # Tool code lives in a separate repo — clone it and cd to its root
        tool_repo_dir = await _ensure_repo_cache(manifest.repo_url, pull=pull_latest)
        repo_link = work_dir / "repo"
        repo_link.symlink_to(tool_repo_dir)
        cd_target = repo_link
    else:
        # Tool code is in the discovery repo — cd into manifest's subdirectory
        repo_dir = await _ensure_repo_cache(app_url, pull=pull_latest)
        repo_link = work_dir / "repo"
        repo_link.symlink_to(repo_dir)
        if manifest_path:
            cd_target = repo_link / manifest_path
        else:
            cd_target = repo_link

    # Build environment variable export lines
    env_lines = ""
    if merged_env:
        parts = []
        for var_name, var_value in merged_env.items():
            if not _ENV_VAR_NAME_PATTERN.match(var_name):
                raise ValueError(f"Invalid environment variable name: '{var_name}'")
            parts.append(f"export {var_name}={shlex.quote(var_value)}")
        env_lines = "\n".join(parts) + "\n"

    # Wrap command with cd into the repo symlink
    # Unset PIXI_PROJECT_MANIFEST so pixi uses the repo's own manifest
    # instead of inheriting fileglancer's from the dev server environment
    script_parts = [f"unset PIXI_PROJECT_MANIFEST\ncd {cd_target}"]
    if env_lines:
        script_parts.append(env_lines.rstrip())
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

    # Submit to executor
    executor = await get_executor()
    job_name = f"fg-{manifest.name}-{entry_point.id}"
    cluster_job = await executor.submit(
        command=full_command,
        name=job_name,
        resources=resource_spec,
    )

    # Register callback to update DB when job reaches terminal state
    cluster_job.on_exit(_on_job_exit)

    # Update DB with cluster job ID and return fresh object
    with db.get_db_session(settings.db_url) as session:
        db.update_job_status(
            session, job_id, "PENDING",
            cluster_job_id=cluster_job.job_id,
        )
        db_job = db.get_job(session, job_id, username)
        session.expunge(db_job)

    logger.info(f"Job {db_job.id} submitted for user {username} in {work_dir}: {command}")
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

    # Apply user overrides
    if overrides:
        if overrides.get("cpus") is not None:
            cpus = overrides["cpus"]
        if overrides.get("memory") is not None:
            memory = overrides["memory"]
        if overrides.get("walltime") is not None:
            walltime = overrides["walltime"]

    return ResourceSpec(
        cpus=cpus,
        memory=memory,
        walltime=walltime,
        queue=queue,
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

        # Cancel on cluster
        if db_job.cluster_job_id:
            executor = await get_executor()
            await executor.cancel(db_job.cluster_job_id)

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
    return _build_work_dir(db_job.id, db_job.app_name, db_job.entry_point_id)


def _resolve_browse_path(abs_path: str) -> tuple[str | None, str | None]:
    """Resolve an absolute path to an FSP name and subpath for browse links."""
    settings = get_settings()
    with db.get_db_session(settings.db_url) as session:
        result = db.find_fsp_from_absolute_path(session, abs_path)
    if result:
        return result[0].name, result[1]
    return None, None


def _make_file_info(file_path: str, exists: bool) -> dict:
    """Create a file info dict with browse link resolution."""
    fsp_name, subpath = _resolve_browse_path(file_path) if exists else (None, None)
    return {
        "path": file_path,
        "exists": exists,
        "fsp_name": fsp_name,
        "subpath": subpath,
    }


def get_job_file_paths(db_job: db.JobDB) -> dict[str, dict]:
    """Return file path info for a job's files (script, stdout, stderr).

    Returns a dict keyed by file type with path and existence info.
    """
    work_dir = _resolve_work_dir(db_job)

    # Find script file
    scripts = sorted(work_dir.glob("*.sh")) if work_dir.exists() else []
    script_path = str(scripts[0]) if scripts else str(work_dir / "script.sh")

    stdout_path = work_dir / "stdout.log"
    stderr_path = work_dir / "stderr.log"

    return {
        "script": _make_file_info(script_path, len(scripts) > 0),
        "stdout": _make_file_info(str(stdout_path), stdout_path.is_file()),
        "stderr": _make_file_info(str(stderr_path), stderr_path.is_file()),
    }


async def get_job_file_content(job_id: int, username: str, file_type: str) -> Optional[str]:
    """Read the content of a job file (script, stdout, or stderr).

    All job files live in the job's work directory:
      - *.sh        — the generated script (written by cluster-api)
      - stdout.log  — captured standard output
      - stderr.log  — captured standard error

    Returns the file content as a string, or None if the file doesn't exist.
    """
    settings = get_settings()

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, username)
        if db_job is None:
            raise ValueError(f"Job {job_id} not found")
        session.expunge(db_job)

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
