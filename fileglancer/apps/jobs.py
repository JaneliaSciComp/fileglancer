"""Cluster job lifecycle: background status polling, submission, and cancellation."""

import asyncio
try:
    import fcntl
except ImportError:
    fcntl = None  # type: ignore[assignment]
import os
import re
import shlex
import tempfile
from pathlib import Path
from datetime import datetime, UTC
from typing import Optional

from loguru import logger

from cluster_api import ResourceSpec

from fileglancer import database as db
from fileglancer.apps.manifest import (
    _dispatch,
    _ensure_repo_cache,
    get_or_load_manifest,
    validate_manifest_path,
)
from fileglancer.apps.command import (
    build_command,
    build_requirements_check,
    expand_user_path,
    merge_requirements,
    _ENV_VAR_NAME_PATTERN,
    _URI_PREFIXES,
)
from fileglancer.apps.jobfiles import _build_work_dir
from fileglancer.model import AppEntryPoint
from fileglancer.settings import get_settings


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


async def submit_job(
    username: str,
    app_url: str,
    entry_point_id: str,
    parameters: dict,
    env_parameters: Optional[dict] = None,
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

    # Reject traversal/unsafe manifest paths before they reach disk reads or
    # the generated job script. get_or_load_manifest may serve a cached row
    # without hitting fetch_app_manifest, so validate here too.
    validate_manifest_path(manifest_path)

    # A null parameter value means "not provided"; drop these so they are
    # neither used when building the command nor stored on the job record.
    parameters = {k: v for k, v in parameters.items() if v is not None}
    env_parameters = {k: v for k, v in (env_parameters or {}).items() if v is not None}

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
        command = build_command(entry_point, parameters, env_parameters, session=session, username=username)

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
        # Drop null values so they aren't stored on the job record; a missing
        # value means "use the cluster default".
        resources_dict = {
            k: v
            for k, v in {
                "cpus": resource_spec.cpus,
                "memory": resource_spec.memory,
                "walltime": resource_spec.walltime,
                "queue": resource_spec.queue,
                "extra_args": " ".join(resource_spec.extra_args) if resource_spec.extra_args else None,
            }.items()
            if v is not None
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
            env_parameters=env_parameters or None,
            resources=resources_dict,
            manifest_path=manifest_path,
            env=merged_env or None,
            pre_run=effective_pre_run,
            post_run=effective_post_run,
            container=effective_container,
            container_args=effective_container_args,
            command=entry_point.command,
            conda_env=entry_point.conda_env,
            requirements=effective_requirements,
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
    # Choose the working directory. 'work' runs from the job's work dir (the
    # repo is still reachable via the `repo` symlink); 'repo' runs from the
    # cloned project (optionally the manifest's subdirectory). cd_suffix may
    # include a Git-derived directory name, so shell-escape it — FG_WORK_DIR
    # stays in its own double-quoted segment so it still expands.
    if entry_point.effective_working_dir == "work":
        preamble_lines.append('cd "$FG_WORK_DIR"')
    else:
        preamble_lines.append(f'cd "$FG_WORK_DIR"/{shlex.quote(cd_suffix)}')
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
                # Expand ~ against the user's home (same normalization as the
                # command). Skip cloud-storage URIs and anything that isn't an
                # absolute local path — those are not bind-mountable and would
                # otherwise produce garbage binds (e.g. s3://bucket/k -> s3:/bucket).
                expanded = expand_user_path(path_val, username)
                if expanded.startswith(_URI_PREFIXES) or not expanded.startswith("/"):
                    continue
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
    # cluster-api tells us the exact script filename it generated, and the
    # worker resolved the work dir's browse-link base; persist both so file
    # path info can be served from the DB with no filesystem access.
    script_path = worker_result.get("script_path")
    work_dir_fsp_name = worker_result.get("work_dir_fsp_name")
    work_dir_subpath = worker_result.get("work_dir_subpath")

    # Update DB with cluster job ID — the poll loop will track status from here
    with db.get_db_session(settings.db_url) as session:
        db.update_job_status(
            session, job_id, "PENDING",
            cluster_job_id=cluster_job_id,
            script_path=script_path,
            work_dir_fsp_name=work_dir_fsp_name,
            work_dir_subpath=work_dir_subpath,
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
