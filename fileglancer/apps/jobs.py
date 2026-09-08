"""Cluster job lifecycle: background status polling, submission, and cancellation."""

import asyncio
import fcntl
import os
import re
import shlex
import tempfile
from pathlib import Path, PurePosixPath
from datetime import datetime, UTC
from typing import Optional

from loguru import logger

from cluster_api import ResourceSpec

from fileglancer import database as db
from fileglancer.apps.manifest import (
    clone_url_for_stored_app,
    _dispatch,
    ensure_repo_snapshot,
    get_or_load_manifest,
    validate_manifest_path,
)
from fileglancer.apps.command import (
    build_command,
    build_requirements_check,
    collect_creatable_dirs,
    collect_path_parameters,
    expand_user_path,
    merge_requirements,
    _ENV_VAR_NAME_PATTERN,
    _URI_PREFIXES,
)
from fileglancer.apps.jobfiles import _build_work_dir
from fileglancer.giturls import canonical_github_url, same_github_repo
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
    """Return any username that has non-terminal jobs, or None."""
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
                is_terminal = db.is_terminal_job_status(new_status)
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
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                # Another worker holds the lock this cycle — skip and retry.
                lock_fd.close()
                lock_fd = None
                await asyncio.sleep(settings.cluster.poll_interval)
                continue

            # try/finally so the lock is always released, even if the task is
            # cancelled (e.g. on shutdown) while we hold it.
            try:
                try:
                    has_jobs = await _poll_jobs(settings)
                except Exception:
                    logger.exception("Error in job poll loop")
                    has_jobs = True  # keep polling on error

                if not has_jobs:
                    # No active jobs: stop the loop. Clear _poll_task and return
                    # with no await in between, so a concurrent submit_job()
                    # either sees this task still alive or starts a fresh loop —
                    # there is no gap where _poll_task is set while the loop is
                    # exiting. Re-check for active jobs immediately before
                    # returning (again, no await in between) so a job submitted
                    # during this cycle keeps the loop running rather than being
                    # left unpolled.
                    if _get_any_active_username(settings) is None:
                        logger.info("No active jobs — poll loop stopping")
                        _poll_task = None
                        return
                    # A job appeared mid-cycle; keep polling.
                    continue

                # Hold the lock through the sleep so a co-worker doesn't
                # double-poll within the same interval.
                await asyncio.sleep(settings.cluster.poll_interval)
            finally:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
                lock_fd.close()
                lock_fd = None
        except OSError:
            # Opening the lock file failed — retry next cycle.
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

        now_naive = datetime.now(UTC).replace(tzinfo=None)
        unknown_timeout_hours = settings.apps.unknown_timeout_hours

        # Handle zombie jobs (no cluster_job_id after timeout)
        jobs_to_poll = []
        for db_job in active_jobs:
            if not db_job.cluster_job_id:
                created = db_job.created_at.replace(tzinfo=None) if db_job.created_at.tzinfo else db_job.created_at
                age_minutes = (now_naive - created).total_seconds() / 60
                if age_minutes > settings.cluster.zombie_timeout_minutes:
                    db.update_job_status(session, db_job.id, "FAILED", finished_at=datetime.now(UTC))
                    logger.warning(
                        f"Job {db_job.id} has no cluster_job_id after "
                        f"{age_minutes:.0f} minutes, marked FAILED"
                    )
                continue
            # Give up on jobs stuck in UNKNOWN past the cutoff: the scheduler can
            # no longer report them (aged out of the queue/history), so continued
            # polling would never resolve them. Measure from status_updated_at
            # (when it entered UNKNOWN), falling back to created_at for rows
            # predating that column.
            if unknown_timeout_hours and db_job.status == "UNKNOWN":
                ref = db_job.status_updated_at or db_job.created_at
                if ref is not None:
                    ref_naive = ref.replace(tzinfo=None) if ref.tzinfo else ref
                    age_hours = (now_naive - ref_naive).total_seconds() / 3600
                    if age_hours > unknown_timeout_hours:
                        db.update_job_status(session, db_job.id, "FAILED",
                                             finished_at=datetime.now(UTC))
                        logger.warning(
                            f"Job {db_job.id} stuck in UNKNOWN for {age_hours:.0f}h "
                            f"(cutoff {unknown_timeout_hours}h), marked FAILED"
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

        # End the read transaction opened at the top of this cycle so the reads
        # below observe status changes that a concurrent writer committed while
        # bjobs was in flight (rows are expired by the commit and reloaded on
        # access). A user cancel takes seconds to round-trip through the worker,
        # which is exactly the window this poll spent awaiting bjobs.
        session.commit()

        # Update DB with polled statuses
        for db_job in jobs_to_poll:
            info = polled_jobs.get(db_job.cluster_job_id)
            if info is None:
                continue
            # Never overwrite a job that has already reached a terminal status.
            # A cancel may have finalized it as KILLED/DONE mid-cycle, and
            # bjobs can briefly report a torn-down job with an unmapped status
            # that maps to UNKNOWN — clobbering the cancel with a spurious
            # UNKNOWN.
            if db.is_terminal_job_status(db_job.status):
                continue
            new_status = info["status"].upper()
            old_status = db_job.status
            if new_status == old_status:
                continue
            is_terminal = db.is_terminal_job_status(new_status)
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

    ponytail: single-user only. This runs in the server process and reads the
    work directory directly, but work directories are 0700 and owned by the job's
    user (see ensure_private_dir), so the server can only poll jobs it owns
    itself -- a job belonging to anyone else would never leave PENDING. That is
    why the config template restricts ``executor: local`` to single-user
    deployments. To lift it, move these two reads into a worker action, the way
    read_job_file already does, and poll through the owning user's worker.
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


def _quote_container_cache_dir(cache_dir: Optional[str],
                               username: Optional[str] = None) -> str:
    """Return a shell-safe APPTAINER_CACHE_DIR assignment value.

    Preferences may use the familiar ``~/...`` spelling shown in the UI.
    ``shlex.quote("~/...")`` would make that a literal directory named ``~``,
    so expand current-user tildes to the target user's home before quoting.
    If the home cannot be resolved (e.g. in a test/dev environment), fall back
    to a shell ``$HOME`` prefix so expansion still happens in the user worker.
    """
    raw = (cache_dir or "").strip()
    if not raw:
        return _DEFAULT_CONTAINER_CACHE_DIR

    if raw == "~" or raw.startswith("~/"):
        suffix = raw[2:] if raw.startswith("~/") else ""
        home = (
            os.path.expanduser(f"~{username}")
            if username else os.path.expanduser("~")
        )
        if home.startswith("~"):
            return "$HOME" if not suffix else f"$HOME/{shlex.quote(suffix)}"
        # Join with '/' rather than pathlib: the value lands in a bash script,
        # so Windows-style separators must never be introduced here.
        expanded = f"{home}/{suffix}" if suffix else home
        return shlex.quote(expanded)

    return shlex.quote(os.path.expanduser(raw))


# Runtime helper emitted for service jobs. It allocates a free TCP port on the
# compute node (a port chosen on the submit host would be meaningless there) and
# exports it as FG_SERVICE_PORT along with FG_HOSTNAME, so a service command can
# bind to a known address without reimplementing port discovery. Prefers python
# (authoritative bind-to-0), then falls back to a bash probe of ephemeral ports.
# It also mints FG_SERVICE_TOKEN, a URL-safe random secret the service can use
# for auth (e.g. --token-password="$FG_SERVICE_TOKEN") and that auto_url can
# splice into the published URL via the ${FG_SERVICE_TOKEN} placeholder.
_SERVICE_PORT_HELPER = r"""# Fileglancer service setup: pick a free port, expose the hostname, mint a token
__fg_free_port() {
  local p py i
  for py in python3 python; do
    if command -v "$py" >/dev/null 2>&1; then
      p="$("$py" -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()' 2>/dev/null)" || true
      [ -n "$p" ] && { printf '%s' "$p"; return 0; }
    fi
  done
  for i in $(seq 1 50); do
    p=$(( (RANDOM % 16384) + 49152 ))
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
      printf '%s' "$p"; return 0
    fi
  done
  printf '%s' 8080
}
export FG_HOSTNAME="$(hostname)"
export FG_SERVICE_PORT="$(__fg_free_port)"
export FG_SERVICE_TOKEN="$(openssl rand -hex 24 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(24))' 2>/dev/null || date +%s%N | sha256sum | cut -c1-48)"
"""


def _build_service_url_publisher(suffix: str = "") -> str:
    """Bash that publishes the service URL once $FG_SERVICE_PORT is live.

    Runs in the background so it tolerates a slow start (the container image may
    still be pulling); it writes SERVICE_URL_PATH only when the port accepts a
    connection, and gives up after a bounded wait, logging to stderr. `suffix` is
    appended to http://$FG_HOSTNAME:$FG_SERVICE_PORT and may reference the
    ${FG_SERVICE_TOKEN}/${FG_SERVICE_PORT}/${FG_HOSTNAME} shell variables; it is
    validated for shell-safety at manifest load (AppEntryPoint), so it is safe to
    embed inside the double-quoted printf argument here.
    """
    return "\n".join([
        "# Publish the service URL once the port is accepting connections.",
        "(",
        "  for _ in $(seq 1 3600); do",
        '    if (exec 3<>"/dev/tcp/127.0.0.1/$FG_SERVICE_PORT") 2>/dev/null; then',
        # The URL usually carries the service's access token, so the file is
        # 0600 whatever the user's umask: the umask covers creating it, and the
        # chmod covers a redirect into a file that somehow already exists, since
        # that keeps the mode it was created with. The work directory's own 0700
        # is the real barrier (see ensure_private_dir); this keeps the secret
        # covered if the file outlives that directory.
        f'      (umask 077; printf \'http://%s:%s%s\' "$FG_HOSTNAME" "$FG_SERVICE_PORT" "{suffix}" > "$SERVICE_URL_PATH" && chmod 600 "$SERVICE_URL_PATH")',
        "      exit 0",
        "    fi",
        "    sleep 1",
        "  done",
        '  echo "Fileglancer: port $FG_SERVICE_PORT never opened; service URL not published." >&2',
        ") &",
    ])


def _build_container_script(
    container_url: str,
    command: str,
    work_dir: str,
    bind_paths: list[str],
    container_args: Optional[str] = None,
    cache_dir: Optional[str] = None,
    username: Optional[str] = None,
) -> str:
    """Build shell script for running a command inside an Apptainer container."""
    sif_name = _container_sif_name(container_url)
    docker_url = (
        container_url
        if container_url.startswith("docker://") else f"docker://{container_url}"
    )

    # Deduplicate and sort bind paths
    all_binds = sorted(set([work_dir] + bind_paths))
    bind_flags = " ".join(f"--bind {shlex.quote(p)}" for p in all_binds)

    extra = ""
    if container_args:
        # Split container_args using shlex.split and shell-escape each argument
        split_args = shlex.split(container_args)
        extra = " " + " ".join(shlex.quote(arg) for arg in split_args)

    resolved_dir = _quote_container_cache_dir(cache_dir, username=username)

    lines = [
        "# Apptainer container setup",
        f'APPTAINER_CACHE_DIR={resolved_dir}',
        'mkdir -p "$APPTAINER_CACHE_DIR"',
        f'SIF_PATH="$APPTAINER_CACHE_DIR/{sif_name}"',
        'if [ ! -f "$SIF_PATH" ]; then',
        # Report the (often multi-minute) image download so the UI can say so.
        # FG_PHASE_PATH is set in the preamble; guard in case it is not.
        '  [ -n "$FG_PHASE_PATH" ] && printf pulling_image > "$FG_PHASE_PATH" 2>/dev/null || true',
        # --disable-cache: the built SIF here is the only copy we keep. We pull
        # only when it's missing, so Apptainer's own layer/SIF cache would just
        # duplicate gigabytes to speed up a re-pull that rarely happens. Skipping
        # it means a re-pull (if this SIF is deleted) re-downloads from the
        # registry, which is the right trade for not double-storing every image.
        f'  apptainer pull --disable-cache "$SIF_PATH" {shlex.quote(docker_url)}',
        'fi',
        '[ -n "$FG_PHASE_PATH" ] && printf starting > "$FG_PHASE_PATH" 2>/dev/null || true',
        f'apptainer exec {bind_flags}{extra} "$SIF_PATH" \\',
        f'  {command}',
    ]
    return "\n".join(lines)


def _container_bind_paths(entry_point, parameters: dict,
                          env_parameters: Optional[dict], username: Optional[str],
                          cached_repo_dir) -> list[str]:
    """Compute the host paths to bind-mount into a container runnable.

    Binds are drawn from three sources, in order:

    1. Each effective file/directory parameter's value (a file binds its parent
       dir). "Effective" means the same set the command is built from — user
       values merged with manifest defaults, across BOTH the pipeline
       (`parameters`) and env-tab (`env_parameters`) namespaces — so a file
       default or an env-tab file parameter is mounted rather than left
       dangling. Cloud-storage URIs and non-absolute values are skipped — they
       are not bind-mountable and would otherwise produce garbage binds.
    2. The runnable's explicit `bind_paths`.
    3. The cached repo clone, but only when the command runs from the clone
       (`manifest` or `repo`). The `repo` symlink lives inside the
       (already-bound) work dir yet points at the clone outside it, so without
       this bind the symlink dangles in the container and the `cd` into it
       fails. Container runnables default to `work`, so this is only added when
       the author opts into `manifest` or `repo`.

    The work dir itself is always bound by `_build_container_script`, so it is
    not included here.
    """
    bind_paths: list[str] = []
    for param, raw_value in collect_path_parameters(
            entry_point, parameters, env_parameters):
        expanded = expand_user_path(str(raw_value), username)
        if expanded.startswith(_URI_PREFIXES) or not expanded.startswith("/"):
            continue
        if param.type == "directory":
            bind_paths.append(expanded)
        else:
            bind_paths.append(str(PurePosixPath(expanded).parent))
    if entry_point.bind_paths:
        bind_paths.extend(entry_point.bind_paths)
    if entry_point.effective_working_dir != "work":
        bind_paths.append(str(cached_repo_dir))
    return bind_paths


async def submit_job(
    username: str,
    app_url: str,
    entry_point_id: str,
    parameters: dict,
    env_parameters: Optional[dict] = None,
    resources: Optional[dict] = None,
    extra_args: Optional[str] = None,
    manifest_path: str = "",
    name: Optional[str] = None,
    env: Optional[dict] = None,
    clean_env: bool = False,
    pre_run: Optional[str] = None,
    post_run: Optional[str] = None,
    container: Optional[str] = None,
    container_args: Optional[str] = None,
) -> db.JobDB:
    """Submit a new job to the cluster.

    Fetches the manifest, validates parameters, builds the command,
    submits to the executor, and creates a DB record.
    Each job runs in its own directory under ~/.fileglancer/jobs/.

    The job's environment is always constructed, never inherited from the
    server or worker process. By default the job runs under the user's login
    shell, so their own profile builds PATH/modules/conda as if they had
    SSH'd to the node. With clean_env=True the job instead starts from a
    minimal environment (see the preamble guards below) for reproducibility.
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

    # Build command (with DB session for path validation against file shares).
    # check_access=False because this runs on the root server, which can't
    # reliably stat the user's files (root-squash NFS makes group-readable paths
    # appear absent). Only euid-independent checks — syntax and file-share
    # containment — run here; exists/readable is validated as the user below.
    with db.get_db_session(settings.db_url) as session:
        command = build_command(entry_point, parameters, env_parameters,
                                session=session, username=username, check_access=False)

    # Authoritative per-user path validation: check that file/directory params
    # exist and are readable, run in the setuid worker as the target user. The
    # server runs as a service account that isn't in the user's groups, so a
    # server-side check would wrongly reject (or, on local FS, wrongly accept)
    # paths the user can actually access.
    # Create any directory params with exists=false first, as the user, so a
    # home default like '~/.fileglancer/logs' exists by the time the job runs.
    # Containment (within a file share) is enforced in the worker before
    # makedirs, so this never writes outside a share.
    creatable_dirs = collect_creatable_dirs(entry_point, parameters, env_parameters)
    if creatable_dirs:
        paths_to_create = {str(i): value for i, (_, value) in enumerate(creatable_dirs)}
        creation = await _dispatch(username, "create_dirs", paths=paths_to_create)
        errors = (creation or {}).get("errors") or {}
        if errors:
            idx = min(int(i) for i in errors)
            param_name, _ = creatable_dirs[idx]
            raise ValueError(f"Parameter '{param_name}': {errors[str(idx)]}")

    path_params = collect_path_parameters(entry_point, parameters, env_parameters)
    if path_params:
        paths_to_check = {str(i): value for i, (_, value) in enumerate(path_params)}
        # exists=false params are outputs the job may create: containment check
        # only. Directory params among them were just created above, but file
        # params (e.g. a Nextflow output file) never exist pre-launch.
        may_be_missing = [str(i) for i, (param, _) in enumerate(path_params)
                          if not param.exists]
        # Expected type per key, so a folder pasted into a file param (or vice
        # versa) is rejected here rather than failing at job runtime.
        types = {str(i): param.type for i, (param, _) in enumerate(path_params)}
        validation = await _dispatch(username, "validate_paths", paths=paths_to_check,
                                     may_be_missing=may_be_missing, types=types)
        errors = (validation or {}).get("errors") or {}
        if errors:
            # Report the first failure, keyed back to its parameter name, to
            # match the single-message format build_command would have raised.
            idx = min(int(i) for i in errors)
            param_name = path_params[idx][0].name
            raise ValueError(f"Parameter '{param_name}': {errors[str(idx)]}")

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
                "extra_args": shlex.join(resource_spec.extra_args) if resource_spec.extra_args else None,
            }.items()
            if v is not None
        }

    stored_app_url = app_url
    # Not in the user's library: clone the URL as given (a bare URL resolves the
    # current default). Overridden below with the pinned URL when installed.
    app_clone_url = app_url
    app_installed = False
    pinned_sha = None
    pinned_code_sha = None

    with db.get_db_session(settings.db_url) as session:
        # Read user's container cache dir preference
        cache_dir_pref = db.get_user_preference(session, username, "apptainerCacheDir")
        container_cache_dir = cache_dir_pref.get("value") if cache_dir_pref else None

        # Prefer the name the user saved for this app (which may be a custom name
        # chosen when adding it from the catalog) over the raw manifest name, so
        # jobs are labeled consistently with the user's library.
        user_app = db.get_user_app(session, username, app_url, manifest_path)
        app_name = user_app.name if user_app is not None else manifest.name
        if user_app is not None:
            app_installed = True
            stored_app_url = user_app.url
            app_clone_url = clone_url_for_stored_app(stored_app_url, user_app.branch)
            pinned_sha = user_app.commit_sha
            pinned_code_sha = user_app.code_commit_sha

    # Resolve the immutable snapshot the job will run from. A pinned app finds
    # its snapshot already on disk (no git work, no network); a legacy unpinned
    # row resolves the branch clone's current HEAD and is pinned to it below,
    # so it never drifts again. Pulling is never done here; updates are an
    # explicit user action via the "Update" app endpoint.
    executed_repo_url = None
    if manifest.repo_url and not same_github_repo(manifest.repo_url, stored_app_url):
        # Manifest and tool code live in separate repos: the code repo is what
        # gets cloned as `repo`.
        cached_repo_dir, executed_sha = await ensure_repo_snapshot(
            manifest.repo_url, sha=pinned_code_sha, username=username)
        executed_repo_url = canonical_github_url(manifest.repo_url)
        if app_installed and (pinned_sha is None or pinned_code_sha is None):
            app_sha = pinned_sha
            if app_sha is None:
                # Pin the manifest repo as well — left unpinned, this app's
                # manifest would keep drifting with the shared branch clone
                # and update checks would skip it forever.
                _, app_sha = await ensure_repo_snapshot(
                    app_clone_url, username=username)
            with db.get_db_session(settings.db_url) as session:
                db.set_user_app_pins(session, username, stored_app_url,
                                     manifest_path,
                                     commit_sha=app_sha,
                                     code_commit_sha=executed_sha)
    else:
        # Manifest and tool code share one repo: it gets cloned as `repo`.
        cached_repo_dir, executed_sha = await ensure_repo_snapshot(
            app_clone_url, sha=pinned_sha, username=username)
        if app_installed and pinned_sha is None:
            with db.get_db_session(settings.db_url) as session:
                db.set_user_app_pins(session, username, stored_app_url,
                                     manifest_path, commit_sha=executed_sha)

    # 'manifest' working_dir runs from the manifest's subdirectory within the
    # clone; 'repo' runs from the clone root. The subdir is the same relative
    # path regardless of whether the manifest and code share a repo.
    manifest_suffix = f"repo/{manifest_path}" if manifest_path else "repo"

    with db.get_db_session(settings.db_url) as session:
        db_job = db.create_job(
            session=session,
            username=username,
            app_url=app_url,
            app_name=app_name,
            name=name,
            entry_point_id=entry_point.id,
            entry_point_name=entry_point.name,
            entry_point_type=entry_point.type,
            parameters=parameters,
            env_parameters=env_parameters or None,
            resources=resources_dict,
            manifest_path=manifest_path,
            env=merged_env or None,
            clean_env=clean_env,
            pre_run=effective_pre_run,
            post_run=effective_post_run,
            container=effective_container,
            container_args=effective_container_args,
            command=entry_point.command,
            conda_env=entry_point.conda_env,
            requirements=effective_requirements,
            commit_sha=executed_sha,
            code_repo_url=executed_repo_url,
            service_proxy=entry_point.service_proxy,
        )
        job_id = db_job.id

        # Compute and persist work_dir now that we have the job ID
        work_dir = _build_work_dir(job_id, manifest.name, entry_point.id,
                                   job_name_prefix=settings.cluster.job_name_prefix,
                                   username=username)
        db_job.work_dir = str(work_dir)
        session.commit()

    # The job row exists but the cluster knows nothing about it yet: any
    # failure between here and a successful worker submit (env-var
    # validation, script assembly, the submit dispatch) must remove the
    # row, or it lingers as a phantom PENDING job that never runs.
    try:
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
        # - FG_MANIFEST_DIR: the manifest's directory inside the clone
        #   (repo[/manifest_path]), so commands can reference it explicitly
        #   instead of relying on the cwd. Always points at the repo-side
        #   directory, even when effective_working_dir is "work" (the repo stays
        #   reachable there)
        # - SERVICE_URL_PATH: for service-type jobs, where to write the service URL
        # - cd into the working directory chosen by effective_working_dir (see below);
        #   this sets where the task's command runs, not how tools locate the manifest
        #   (pixi is pointed at FG_MANIFEST_DIR explicitly via --manifest-path)
        preamble_lines = []
        if clean_env:
            # Clean mode starts from an empty scheduler-provided environment
            # (no login shell), so give the script a sane PATH and identity
            # before anything else runs. ${VAR:-...} keeps any values the
            # scheduler did set.
            preamble_lines += [
                'export PATH="${PATH:-/usr/local/bin:/usr/bin:/bin}"',
                'export USER="${USER:-$(id -un)}"',
                'export HOME="${HOME:-$(getent passwd "$(id -un)" | cut -d: -f6)}"',
            ]
        preamble_lines += [
            f"export FG_WORK_DIR={shlex.quote(str(work_dir))}",
            f'export FG_MANIFEST_DIR="$FG_WORK_DIR"/{shlex.quote(manifest_suffix)}',
            # Where the script reports its startup phase (e.g. pulling a container
            # image). The UI reads this to explain a wait before a service is ready.
            'export FG_PHASE_PATH="$FG_WORK_DIR/phase"',
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
            preamble_lines.append(_SERVICE_PORT_HELPER)
            # With auto_url, Fileglancer publishes the URL for the author: a
            # background probe waits for $FG_SERVICE_PORT to accept connections and
            # then writes http://$FG_HOSTNAME:$FG_SERVICE_PORT plus the optional
            # (validated) service_url_suffix. A service that manages its own URL
            # leaves auto_url unset and writes SERVICE_URL_PATH itself.
            if entry_point.auto_url:
                preamble_lines.append(
                    _build_service_url_publisher(entry_point.service_url_suffix or "")
                )
        # Choose the working directory. 'work' runs from the job's work dir (the
        # repo is still reachable via the `repo` symlink); 'repo' runs from the
        # cloned project's root; 'manifest' runs from the manifest's directory
        # inside the clone (the repo root plus the manifest's subdirectory).
        # manifest_suffix may include a Git-derived directory name, so
        # shell-escape it — FG_WORK_DIR stays in its own double-quoted segment so
        # it still expands.
        if entry_point.effective_working_dir == "work":
            preamble_lines.append('cd "$FG_WORK_DIR"')
        elif entry_point.effective_working_dir == "repo":
            preamble_lines.append('cd "$FG_WORK_DIR"/repo')
        else:
            preamble_lines.append(f'cd "$FG_WORK_DIR"/{shlex.quote(manifest_suffix)}')
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
            bind_paths = _container_bind_paths(
                entry_point, parameters, env_parameters, username, cached_repo_dir
            )

            command = _build_container_script(
                container_url=effective_container,
                command=command,
                work_dir=str(work_dir),
                bind_paths=bind_paths,
                container_args=effective_container_args,
                cache_dir=container_cache_dir,
                username=username,
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
        worker_result = await _dispatch(
            username, "submit",
            cluster_config=cluster_config,
            command=full_command,
            job_name=job_name,
            # Default: login shell, so the user's own profile builds the
            # job environment. Clean mode: no profile, minimal environment.
            login_shell=not clean_env,
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
            # The UI/preferences deliver extra_args as one string (e.g.
            # '-P proj -R "select[mem>8000]"'); split into individual argv
            # tokens so the scheduler receives distinct options rather than a
            # single malformed argument. Quotes group tokens that contain
            # spaces.
            extra_args = shlex.split(overrides["extra_args"])

    return ResourceSpec(
        cpus=cpus,
        memory=memory,
        walltime=walltime,
        queue=queue,
        extra_args=extra_args,
    )


async def cancel_job(job_id: int, username: str) -> db.JobDB:
    """Cancel a non-terminal job."""
    settings = get_settings()

    with db.get_db_session(settings.db_url) as session:
        db_job = db.get_job(session, job_id, username)
        if db_job is None:
            raise ValueError(f"Job {job_id} not found")
        if db.is_terminal_job_status(db_job.status):
            raise ValueError(f"Job {job_id} is not cancellable (status: {db_job.status})")

        is_service = getattr(db_job, "entry_point_type", "job") == "service"

        # Stop the running job as the target user via py-cluster-api. The
        # executor cancels by job id (LSF: bkill; local: kill the process
        # group by PID — the local job id IS the leader PID). For a service,
        # done=True asks the scheduler to record it as DONE rather than a
        # signalled kill (LSF: bkill -d), since stopping a service is a normal
        # user action, not a failure. A batch job is cancelled the same way it
        # always was (plain bkill). cancel() raises if it can't confirm
        # termination, so a failure propagates here and we never fall through
        # to the status update below.
        if db_job.cluster_job_id:
            cluster_config = settings.cluster.model_dump(exclude_none=True)
            await _dispatch(
                username, "cancel",
                cluster_config=cluster_config,
                job_id=db_job.cluster_job_id,
                done=is_service,
            )

        # A stopped service is marked DONE, same as any other completed
        # pipeline (it matches the DONE the scheduler itself recorded via
        # done=True above). Batch jobs keep the long-standing KILLED status.
        new_status = "DONE" if is_service else "KILLED"
        now = datetime.now(UTC)
        db.update_job_status(session, db_job.id, new_status, finished_at=now)
        db_job = db.get_job(session, db_job.id, username)
        session.expunge(db_job)

    logger.info(f"Job {job_id} {'stopped' if is_service else 'killed'} by user {username}")
    return db_job
