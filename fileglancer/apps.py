"""Apps module for fetching manifests, building commands, and managing cluster jobs."""

import asyncio
import os
import re
import shlex
import time
from pathlib import Path
from datetime import datetime, UTC
from typing import Optional

import httpx
import yaml
from loguru import logger

from cluster_api import create_executor, ResourceSpec, JobMonitor
from cluster_api._types import JobStatus

from fileglancer import database as db
from fileglancer.model import AppManifest, AppEntryPoint, AppParameter
from fileglancer.settings import get_settings

# --- Manifest Cache ---

_manifest_cache: dict[str, tuple[AppManifest, float]] = {}
_MANIFEST_CACHE_TTL = 3600  # 1 hour


_MANIFEST_FILENAMES = ["fileglancer-app.json", "fileglancer-app.yaml", "fileglancer-app.yml"]


def _github_to_raw_urls(url: str) -> list[str]:
    """Convert a GitHub repo URL to raw URLs for the manifest file.

    Returns a list of candidate URLs to try (JSON first, then YAML).

    Handles patterns like:
    - https://github.com/owner/repo
    - https://github.com/owner/repo/
    - https://github.com/owner/repo/tree/branch
    """
    pattern = r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/([^/]+))?/?$"
    match = re.match(pattern, url)
    if match:
        owner, repo, branch = match.groups()
        branch = branch or "main"
        return [
            f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{filename}"
            for filename in _MANIFEST_FILENAMES
        ]
    return [url]


def _parse_manifest_response(response: httpx.Response) -> dict:
    """Parse a manifest response as JSON or YAML based on content."""
    url = str(response.url)
    if url.endswith(".yaml") or url.endswith(".yml"):
        return yaml.safe_load(response.text)
    return response.json()


async def fetch_app_manifest(url: str) -> AppManifest:
    """Fetch and validate an app manifest from a URL.

    If the URL points to a GitHub repo, it will automatically look for
    fileglancer-app.json, then fileglancer-app.yaml, then fileglancer-app.yml.
    """
    now = time.time()

    # Check cache
    if url in _manifest_cache:
        manifest, cached_at = _manifest_cache[url]
        if now - cached_at < _MANIFEST_CACHE_TTL:
            return manifest

    # Resolve GitHub URLs to candidate raw URLs
    candidate_urls = _github_to_raw_urls(url)

    data = None
    async with httpx.AsyncClient(timeout=30.0) as client:
        for fetch_url in candidate_urls:
            try:
                response = await client.get(fetch_url)
                response.raise_for_status()
                data = _parse_manifest_response(response)
                break
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404 and len(candidate_urls) > 1:
                    continue
                raise

    if data is None:
        filenames = ", ".join(_MANIFEST_FILENAMES)
        raise ValueError(
            f"No manifest file found ({filenames}). "
            f"Make sure the file exists in the repository."
        )

    manifest = AppManifest(**data)

    # Cache the result
    _manifest_cache[url] = (manifest, now)
    return manifest


def clear_manifest_cache():
    """Clear the manifest cache."""
    _manifest_cache.clear()


# --- Command Building ---

# Characters that are dangerous in shell commands
_SHELL_METACHAR_PATTERN = re.compile(r'[;&|`$(){}!<>\n\r]')


def _validate_parameter_value(param: AppParameter, value) -> str:
    """Validate a single parameter value against its schema and return the string representation.

    Raises ValueError if validation fails.
    """
    if param.type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(f"Parameter '{param.id}' must be a boolean")
        return str(value)

    if param.type == "integer":
        try:
            int_val = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{param.id}' must be an integer")
        if param.min is not None and int_val < param.min:
            raise ValueError(f"Parameter '{param.id}' must be >= {param.min}")
        if param.max is not None and int_val > param.max:
            raise ValueError(f"Parameter '{param.id}' must be <= {param.max}")
        return str(int_val)

    if param.type == "number":
        try:
            num_val = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{param.id}' must be a number")
        if param.min is not None and num_val < param.min:
            raise ValueError(f"Parameter '{param.id}' must be >= {param.min}")
        if param.max is not None and num_val > param.max:
            raise ValueError(f"Parameter '{param.id}' must be <= {param.max}")
        return str(num_val)

    if param.type == "enum":
        str_val = str(value)
        if param.options and str_val not in param.options:
            raise ValueError(f"Parameter '{param.id}' must be one of {param.options}")
        return str_val

    # string, file, directory
    str_val = str(value)

    if param.type in ("file", "directory"):
        # Validate path characters
        if _SHELL_METACHAR_PATTERN.search(str_val):
            raise ValueError(f"Parameter '{param.id}' contains invalid characters")

    if param.type == "string" and param.pattern:
        if not re.fullmatch(param.pattern, str_val):
            raise ValueError(f"Parameter '{param.id}' does not match required pattern")

    return str_val


def build_command(entry_point: AppEntryPoint, parameters: dict) -> str:
    """Build a shell command from an entry point and parameter values.

    All parameter values are validated and shell-escaped.
    Raises ValueError for invalid parameters.
    """
    # Build a lookup of parameter definitions
    param_defs = {p.id: p for p in entry_point.parameters}

    # Validate required parameters
    for param in entry_point.parameters:
        if param.required and param.id not in parameters:
            if param.default is None:
                raise ValueError(f"Required parameter '{param.id}' is missing")

    # Start with the base command
    parts = [entry_point.command]

    # Append parameters as CLI flags
    for param_id, value in parameters.items():
        if param_id not in param_defs:
            raise ValueError(f"Unknown parameter '{param_id}'")

        param = param_defs[param_id]
        validated = _validate_parameter_value(param, value)

        if param.type == "boolean":
            if value is True:
                parts.append(f"--{param_id}")
            # If False, omit the flag
        else:
            parts.append(f"--{param_id} {shlex.quote(validated)}")

    # Apply defaults for missing optional parameters
    for param in entry_point.parameters:
        if param.id not in parameters and param.default is not None:
            validated = _validate_parameter_value(param, param.default)
            if param.type == "boolean":
                if param.default is True:
                    parts.append(f"--{param.id}")
            else:
                parts.append(f"--{param.id} {shlex.quote(validated)}")

    return " ".join(parts)


# --- Executor Management ---

_executor = None
_monitor = None
_monitor_task = None


async def get_executor():
    """Get or create the cluster executor singleton."""
    global _executor
    if _executor is None:
        settings = get_settings()
        _executor = create_executor(
            executor=settings.cluster_executor,
            queue=settings.cluster_queue,
            log_directory=settings.cluster_log_directory,
        )
    return _executor


async def start_job_monitor():
    """Start the background job monitoring loop."""
    global _monitor, _monitor_task

    settings = get_settings()
    executor = await get_executor()

    _monitor = JobMonitor(executor, poll_interval=settings.cluster_poll_interval)
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

        await asyncio.sleep(settings.cluster_poll_interval)


async def _reconcile_jobs(settings):
    """Reconcile DB job statuses with the executor's tracked jobs."""
    executor = await get_executor()

    with db.get_db_session(settings.db_url) as session:
        active_jobs = db.get_active_jobs(session)

        for db_job in active_jobs:
            if not db_job.cluster_job_id:
                continue

            # Check if executor is tracking this job
            tracked = executor.jobs.get(db_job.cluster_job_id)
            if tracked is None:
                # Job is no longer tracked by executor - might have been lost
                # Mark as FAILED if it was RUNNING, leave PENDING as is
                if db_job.status == "RUNNING":
                    now = datetime.now(UTC)
                    db.update_job_status(session, db_job.id, "FAILED", finished_at=now)
                    logger.warning(f"Job {db_job.id} (cluster: {db_job.cluster_job_id}) lost from executor, marked FAILED")
                continue

            # Map cluster status to our status strings
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


# --- Job Submission ---

def _sanitize_for_path(s: str) -> str:
    """Sanitize a string for use in a directory name."""
    return re.sub(r'[^a-zA-Z0-9._-]', '_', s)


def _build_work_dir(job_id: int, app_name: str, entry_point_id: str) -> str:
    """Build a working directory path under ~/.fileglancer/jobs/."""
    safe_app = _sanitize_for_path(app_name)
    safe_ep = _sanitize_for_path(entry_point_id)
    return f"$HOME/.fileglancer/jobs/{job_id}-{safe_app}-{safe_ep}"


async def submit_job(
    username: str,
    app_url: str,
    entry_point_id: str,
    parameters: dict,
    resources: Optional[dict] = None,
) -> db.JobDB:
    """Submit a new job to the cluster.

    Fetches the manifest, validates parameters, builds the command,
    submits to the executor, and creates a DB record.
    Each job runs in its own directory under ~/.fileglancer/jobs/.
    """
    settings = get_settings()

    # Fetch and validate manifest
    manifest = await fetch_app_manifest(app_url)

    # Find entry point
    entry_point = None
    for ep in manifest.entryPoints:
        if ep.id == entry_point_id:
            entry_point = ep
            break
    if entry_point is None:
        raise ValueError(f"Entry point '{entry_point_id}' not found in manifest")

    # Build command
    command = build_command(entry_point, parameters)

    # Build resource spec
    resource_spec = _build_resource_spec(entry_point, resources, settings)

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
        )
        job_id = db_job.id

    # Build work directory and wrap command
    work_dir = _build_work_dir(job_id, manifest.name, entry_point.id)
    command = f"mkdir -p {work_dir} && cd {work_dir} && {command}"

    # Set work_dir on resource spec for LSF -cwd support
    resource_spec.work_dir = work_dir

    # Submit to executor
    executor = await get_executor()
    job_name = f"fg-{manifest.name}-{entry_point.id}"
    cluster_job = await executor.submit(
        command=command,
        name=job_name,
        resources=resource_spec,
    )

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
    cpus = settings.cluster_default_cpus
    memory = settings.cluster_default_memory
    walltime = settings.cluster_default_walltime
    queue = settings.cluster_queue

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
        account=settings.cluster_account,
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
    work_dir = _build_work_dir(db_job.id, db_job.app_name, db_job.entry_point_id)
    # Replace $HOME with actual home directory
    return Path(work_dir.replace("$HOME", os.path.expanduser("~")))


def _get_job_log_paths(db_job: db.JobDB) -> dict[str, Path]:
    """Get the expected log file paths for a job."""
    settings = get_settings()
    log_dir = Path(settings.cluster_log_directory).expanduser()
    job_name = f"fg-{db_job.app_name}-{db_job.entry_point_id}"
    safe_name = re.sub(r"[^\w\-.]", "_", job_name)

    return {
        "stdout": log_dir / f"{job_name}.out",
        "stderr": log_dir / f"{job_name}.err",
        "script": log_dir / f"{safe_name}.sh",
    }


async def get_job_file_content(job_id: int, username: str, file_type: str) -> Optional[str]:
    """Read the content of a job file (script, stdout, or stderr).

    Returns the file content as a string, or None if the file doesn't exist.
    """
    settings = get_settings()

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, username)
        if db_job is None:
            raise ValueError(f"Job {job_id} not found")
        session.expunge(db_job)

    if file_type == "script":
        # Try executor's tracked script_path first
        if db_job.cluster_job_id:
            executor = await get_executor()
            tracked = executor.jobs.get(db_job.cluster_job_id)
            if tracked and tracked.script_path:
                path = Path(tracked.script_path)
                if path.is_file():
                    return path.read_text()

        # Fall back to expected path
        paths = _get_job_log_paths(db_job)
        # Try matching any .sh file with the safe_name prefix
        log_dir = paths["script"].parent
        safe_name = paths["script"].stem
        if log_dir.is_dir():
            for f in sorted(log_dir.iterdir()):
                if f.name.startswith(safe_name) and f.suffix == ".sh":
                    return f.read_text()
        return None

    if file_type in ("stdout", "stderr"):
        paths = _get_job_log_paths(db_job)
        path = paths[file_type]
        if path.is_file():
            return path.read_text()
        return None

    raise ValueError(f"Unknown file type: {file_type}")
