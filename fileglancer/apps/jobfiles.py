"""Job working-directory path construction and job file access."""

import os
import posixpath
import re
import shutil
from pathlib import Path
from typing import Optional

from loguru import logger

from fileglancer import database as db
from fileglancer.settings import get_settings


def _sanitize_for_path(s: str) -> str:
    """Sanitize a string for use in a directory name."""
    return re.sub(r'[^a-zA-Z0-9._-]', '_', s)


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


# --- Job File Access ---

_STATE_DIRNAME = ".fileglancer"


def ensure_private_dir(path: Path) -> None:
    """Create a directory under ``~/.fileglancer`` that only its owner can enter.

    Fileglancer's state directory holds things no other user should see: a
    service job's access token (in ``service_url``, and routinely echoed into
    ``stdout.log`` by the service itself) and clones of app repositories, which
    may be private. The directory mode is what keeps them secret — the default
    0755 on a shared filesystem publishes them, and with the token the ability
    to act as that user, to everyone on the site.

    Every level from ``path`` up to and including ``~/.fileglancer`` is locked
    down, so the state root stays private however it was first created and
    subtrees made before this was enforced are covered too. Nothing above the
    state root is touched. An ancestor that cannot be chmod'ed (owned by another
    uid) is warned about rather than raised, since the leaf is private either
    way; failing to lock the leaf itself does raise.

    Must run as the owner of the tree (in the user worker, or as the user in CLI
    mode). Chmod rather than ``mkdir(mode=...)``: that mode is masked by the
    umask, and ignored entirely when the directory already exists.
    """
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError as e:
        raise PermissionError(
            f"Cannot make {path} private, so it is not safe to write sensitive "
            f"Fileglancer state there: {e}"
        ) from e
    for parent in path.parents:
        if _STATE_DIRNAME not in parent.parts:
            break  # above ~/.fileglancer (or outside it): not ours to touch
        try:
            os.chmod(parent, 0o700)
        except OSError as e:
            # A state root owned by someone else is not ours to repair, and the
            # directory we just locked is the one that holds the secrets. Say so
            # and stop, rather than failing the caller over an ancestor.
            logger.warning(
                f"Could not make {parent} private ({e}); anything directly "
                f"inside it stays readable by other users"
            )
            break


def _resolve_work_dir(db_job: db.JobDB) -> Path:
    """Resolve a job's work directory to an absolute path."""
    if db_job.work_dir:
        return Path(db_job.work_dir)
    return _build_work_dir(db_job.id, db_job.app_name, db_job.entry_point_id)


def _safe_work_dir_delete_target(db_job: db.JobDB) -> Path:
    """Return the normalized work-dir path if it is safe to delete.

    Job work directories are created under ``.fileglancer/jobs`` and include
    the job id in their leaf name. Keep deletion constrained to that shape so a
    stale or corrupted DB row cannot turn "delete this job" into arbitrary
    filesystem removal.
    """
    raw_target = Path(os.path.expanduser(os.fspath(db_job.work_dir)))
    if not raw_target.is_absolute():
        raise PermissionError(
            f"Refusing to delete relative job work directory: {raw_target}"
        )
    target = Path(os.path.abspath(os.fspath(raw_target)))
    parts = target.parts
    under_jobs_root = any(
        part == ".fileglancer"
        and idx + 2 < len(parts)
        and parts[idx + 1] == "jobs"
        for idx, part in enumerate(parts)
    )
    if not under_jobs_root:
        raise PermissionError(
            f"Refusing to delete unexpected job work directory: {target}"
        )

    job_id = re.escape(str(db_job.id))
    if not re.search(rf"(^|-){job_id}-", target.name):
        raise PermissionError(
            f"Refusing to delete job work directory without job id {db_job.id}: {target}"
        )

    return target


def delete_job_work_dir(db_job: db.JobDB) -> bool:
    """Delete a job's work directory, returning True when something was removed.

    Missing stored paths or already-removed work directories are treated as
    already deleted so the DB record can still be cleaned up. Directory symlinks
    are unlinked rather than followed.
    """
    if not getattr(db_job, "work_dir", None):
        return False

    target = _safe_work_dir_delete_target(db_job)
    try:
        if target.is_symlink():
            target.unlink()
            return True
        if not target.exists():
            return False
        if not target.is_dir():
            raise NotADirectoryError(
                f"Job work directory is not a directory: {target}"
            )
        shutil.rmtree(target)
        return True
    except FileNotFoundError:
        return False


def _make_file_info(file_path: str, exists: bool,
                    work_fsp_name: Optional[str],
                    work_subpath: Optional[str]) -> dict:
    """Create a file info dict, deriving the browse link from the work dir's
    stored browse-link base. All job files live directly in the work dir, so a
    file's browse subpath is the work dir's subpath plus the file name — no
    filesystem resolution needed.
    """
    fsp_name = None
    subpath = None
    if exists and work_fsp_name:
        fsp_name = work_fsp_name
        filename = posixpath.basename(file_path)
        subpath = f"{work_subpath}/{filename}" if work_subpath else filename
    return {
        "path": file_path,
        "exists": exists,
        "fsp_name": fsp_name,
        "subpath": subpath,
    }


def read_service_url_file(work_dir: Path) -> Optional[str]:
    """Read and validate the 'service_url' file in a job work directory."""
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

    return read_service_url_file(_resolve_work_dir(db_job))


# Startup phases a service job writes to its 'phase' file so the UI can explain
# a wait before the URL appears (chiefly a container image still downloading).
_SERVICE_PHASES = ("pulling_image", "starting")


def read_service_phase_file(work_dir: Path) -> Optional[str]:
    """Read and validate the 'phase' file in a job work directory."""
    phase_file = work_dir / "phase"
    if not phase_file.is_file():
        return None

    try:
        phase = phase_file.read_text().strip()
    except OSError:
        return None

    return phase if phase in _SERVICE_PHASES else None


def get_service_phase(db_job: db.JobDB) -> Optional[str]:
    """Read the current startup phase from a service job's work directory.

    The generated job script writes a short marker (see _SERVICE_PHASES) to a
    'phase' file — e.g. 'pulling_image' while Apptainer downloads the container
    image, then 'starting'. This lets the UI show why a service is taking a
    while before its URL is published. Returns None unless the job is a RUNNING
    service with a recognized phase written.
    """
    if getattr(db_job, 'entry_point_type', 'job') != 'service':
        return None
    if db_job.status != 'RUNNING':
        return None

    return read_service_phase_file(_resolve_work_dir(db_job))


def get_job_file_paths(db_job: db.JobDB) -> dict[str, dict]:
    """Return file path info for a job's files (script, stdout, stderr, service_url).

    Returns a dict keyed by file type with path and browse-link info. Derived
    entirely from the DB record (work_dir, stored script_path, and the work
    dir's stored browse-link base) and job state — no filesystem access — so it
    is fast and safe to call from the parent process. Existence is inferred
    rather than stat'd: the script exists once submitted (script_path is set),
    and the log files exist once the job has started.
    """
    work_dir = str(_resolve_work_dir(db_job))
    work_fsp_name = getattr(db_job, 'work_dir_fsp_name', None)
    work_subpath = getattr(db_job, 'work_dir_subpath', None)

    # cluster-api recorded the generated script name at submit time.
    script_path = getattr(db_job, 'script_path', None)
    script_exists = bool(script_path)
    if not script_path:
        script_path = posixpath.join(work_dir, "script.sh")

    # Log files are written by the job once it begins running.
    logs_exist = db_job.started_at is not None
    stdout_path = posixpath.join(work_dir, "stdout.log")
    stderr_path = posixpath.join(work_dir, "stderr.log")

    files = {
        # The work dir itself: its browse-link base is the stored fsp/subpath,
        # so build the entry directly rather than via _make_file_info (which
        # would append a file name to the subpath).
        "work_dir": {
            "path": work_dir,
            "exists": bool(work_fsp_name),
            "fsp_name": work_fsp_name,
            "subpath": work_subpath,
        },
        "script": _make_file_info(script_path, script_exists, work_fsp_name, work_subpath),
        "stdout": _make_file_info(stdout_path, logs_exist, work_fsp_name, work_subpath),
        "stderr": _make_file_info(stderr_path, logs_exist, work_fsp_name, work_subpath),
    }

    # Include service_url file info for running service-type jobs.
    if getattr(db_job, 'entry_point_type', 'job') == 'service':
        service_url_path = posixpath.join(work_dir, "service_url")
        files["service_url"] = _make_file_info(
            service_url_path, db_job.status == 'RUNNING', work_fsp_name, work_subpath)

    return files


# Cap for inline job-file reads. HPC stdout/stderr logs can grow to gigabytes;
# reading one whole would exhaust worker/server memory and blow the 64 MB IPC
# message limit. We return the tail of anything larger (the most useful part of
# a log), with a marker; the file's work-dir browse link gives full access.
_MAX_JOB_FILE_BYTES = 5 * 1024 * 1024


def _read_text_capped(path: Path) -> str:
    """Read a text file, capping oversized files to their trailing bytes.

    Files up to _MAX_JOB_FILE_BYTES are returned in full. Larger files return
    only their last _MAX_JOB_FILE_BYTES bytes, prefixed with a marker noting how
    much was omitted, so a runaway log can't OOM the process or exceed the IPC
    limit. Decoding uses errors='replace' so non-UTF-8 log bytes never raise.
    """
    size = path.stat().st_size
    if size <= _MAX_JOB_FILE_BYTES:
        return path.read_text(errors="replace")
    with path.open("rb") as f:
        f.seek(size - _MAX_JOB_FILE_BYTES)
        tail = f.read()
    text = tail.decode("utf-8", errors="replace")
    # Drop a leading partial line so the tail starts on a clean boundary.
    newline = text.find("\n")
    if newline != -1:
        text = text[newline + 1:]
    omitted = size - _MAX_JOB_FILE_BYTES
    shown_mb = _MAX_JOB_FILE_BYTES // (1024 * 1024)
    header = (
        f"[Fileglancer: this file is {size} bytes; showing only the last "
        f"{shown_mb} MB ({omitted} earlier bytes omitted). Open it from the "
        f"job's work directory to view the full contents.]\n\n"
    )
    return header + text


def read_job_file(db_job, file_type: str) -> Optional[str]:
    """Read the content of a job file given a loaded job record.

    All job files live in the job's work directory:
      - *.sh        — the generated script (written by cluster-api)
      - stdout.log  — captured standard output
      - stderr.log  — captured standard error

    Oversized files are truncated to their tail (see _read_text_capped).
    Returns the file content as a string, or None if the file doesn't exist.
    """
    work_dir = _resolve_work_dir(db_job)

    if file_type == "script":
        # Use the script path recorded at submit time; fall back to globbing the
        # work dir for legacy jobs created before script_path was stored.
        script_path = getattr(db_job, 'script_path', None)
        if script_path:
            path = Path(script_path)
            return _read_text_capped(path) if path.is_file() else None
        scripts = sorted(work_dir.glob("*.sh"))
        if scripts:
            return _read_text_capped(scripts[0])
        return None
    elif file_type == "stdout":
        path = work_dir / "stdout.log"
    elif file_type == "stderr":
        path = work_dir / "stderr.log"
    else:
        raise ValueError(f"Unknown file type: {file_type}")

    if path.is_file():
        return _read_text_capped(path)
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
