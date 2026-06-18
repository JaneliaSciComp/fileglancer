"""Job working-directory path construction and job file access."""

import os
import re
from pathlib import Path
from typing import Optional

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

def _resolve_work_dir(db_job: db.JobDB) -> Path:
    """Resolve a job's work directory to an absolute path."""
    if db_job.work_dir:
        return Path(db_job.work_dir)
    return _build_work_dir(db_job.id, db_job.app_name, db_job.entry_point_id)


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
        filename = os.path.basename(file_path)
        subpath = f"{work_subpath}/{filename}" if work_subpath else filename
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


def get_job_file_paths(db_job: db.JobDB) -> dict[str, dict]:
    """Return file path info for a job's files (script, stdout, stderr, service_url).

    Returns a dict keyed by file type with path and browse-link info. Derived
    entirely from the DB record (work_dir, stored script_path, and the work
    dir's stored browse-link base) and job state — no filesystem access — so it
    is fast and safe to call from the parent process. Existence is inferred
    rather than stat'd: the script exists once submitted (script_path is set),
    and the log files exist once the job has started.
    """
    work_dir = _resolve_work_dir(db_job)
    work_fsp_name = getattr(db_job, 'work_dir_fsp_name', None)
    work_subpath = getattr(db_job, 'work_dir_subpath', None)

    # cluster-api recorded the generated script name at submit time.
    script_path = getattr(db_job, 'script_path', None)
    script_exists = bool(script_path)
    if not script_path:
        script_path = str(work_dir / "script.sh")

    # Log files are written by the job once it begins running.
    logs_exist = db_job.started_at is not None
    stdout_path = work_dir / "stdout.log"
    stderr_path = work_dir / "stderr.log"

    files = {
        "script": _make_file_info(script_path, script_exists, work_fsp_name, work_subpath),
        "stdout": _make_file_info(str(stdout_path), logs_exist, work_fsp_name, work_subpath),
        "stderr": _make_file_info(str(stderr_path), logs_exist, work_fsp_name, work_subpath),
    }

    # Include service_url file info for running service-type jobs.
    if getattr(db_job, 'entry_point_type', 'job') == 'service':
        service_url_path = work_dir / "service_url"
        files["service_url"] = _make_file_info(
            str(service_url_path), db_job.status == 'RUNNING', work_fsp_name, work_subpath)

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
        # Use the script path recorded at submit time; fall back to globbing the
        # work dir for legacy jobs created before script_path was stored.
        script_path = getattr(db_job, 'script_path', None)
        if script_path:
            path = Path(script_path)
            return path.read_text() if path.is_file() else None
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
