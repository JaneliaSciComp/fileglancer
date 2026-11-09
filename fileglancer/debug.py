"""Real-time debug TUI for the Fileglancer job system.

Run with ``fileglancer debug`` (or ``pixi run debug-launch``). The TUI is
read-only: it never modifies the database, never signals processes, and only
runs scheduler commands itself when the bjobs cross-check is explicitly
enabled with the ``b`` key.

What it watches
---------------
The job system has four independently observable surfaces, each sampled by
its own background thread so a slow source (NFS stat, bjobs) never blocks
the display:

1. The **jobs table** (all users) via the Fileglancer database. Snapshots are
   diffed to produce a live event feed of submissions, status transitions,
   and deletions.

2. The **process tree** via /proc — host-local by nature. When the watched
   database belongs to a server running on another machine, the process
   panes, the POLLER line, and the poll heartbeat describe *this* machine,
   not that server; the header shows them as n/a when no fileglancer server
   process is found locally. (Work-dir/log reads still work cross-host via
   shared mounts, and the bjobs cross-check queries the cluster itself.)
   On the server's own host, this finds:
   - server processes (uvicorn / ``fileglancer start``) and their children,
   - per-user worker subprocesses (``python -m fileglancer.user_worker``)
     with owner, age, CPU, and RSS,
   - scheduler commands (bsub/bjobs/bkill/...) as they spawn under workers,
     which is how you watch the polling actually happen,
   - the poll-lock holder, by matching the lock file's device+inode against
     /proc/locks. Whichever server process holds the flock is the active
     poller. The lock file's mtime doubles as a poll-cycle heartbeat because
     every cycle re-opens it with mode "w" (see apps/jobs.py).

3. **Job work directories** (phase, service_url, job.pid, exit_code, log
   sizes) for active jobs, plus stdout/stderr tails for the selected job.
   Reads run as the invoking user, so other users' files may legitimately
   show "permission denied" on root-squashed NFS.

4. Optionally, **the scheduler itself**: with the cross-check enabled the
   tool runs ``bjobs`` for all active cluster job IDs and flags rows where
   LSF disagrees with the database — the classic symptom of a broken poll
   loop.

Keys
----
  q         quit
  j/k / ↑↓  select job          PgUp/PgDn scroll jobs
  Enter     job detail overlay (Esc/q/Enter closes)
  o / e / s log viewer for the selected job's stdout / stderr / script:
            a live-following tail (j/k scroll, ←/→ pan, f toggles follow,
            o/e/s switch file, Esc/q closes)
  a         toggle all jobs vs active-only
  b         toggle bjobs cross-check (LSF executor only)
  p         pause/resume display updates
"""

from __future__ import annotations

import json
import os
import pwd
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass, field
from datetime import datetime, UTC
from pathlib import Path
from typing import Any, Optional

from fileglancer import database as db


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLL_LOCK_FILENAME = "fileglancer_poll.lock"

# Scheduler commands worth surfacing when they appear in the process tree.
SCHED_CMD_NAMES = frozenset({
    "bsub", "bjobs", "bkill", "bhosts", "bqueues", "bpeek", "bacct",  # LSF
    "sbatch", "squeue", "scancel", "sacct", "sinfo",                  # Slurm
    "qsub", "qstat", "qdel",                                          # SGE/PBS
})
_SHELL_NAMES = frozenset({"sh", "bash", "dash", "zsh", "ksh"})

# Map LSF bjobs STAT values onto Fileglancer job statuses for the cross-check.
LSF_STAT_MAP = {
    "PEND": "PENDING", "RUN": "RUNNING", "DONE": "DONE", "EXIT": "FAILED",
    "PSUSP": "SUSPENDED", "USUSP": "SUSPENDED", "SSUSP": "SUSPENDED",
    "WAIT": "PENDING", "ZOMBI": "ZOMBIE", "UNKWN": "UNKNOWN",
}

_CLK_TCK = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100
_PAGE_SIZE = os.sysconf("SC_PAGE_SIZE") if hasattr(os, "sysconf") else 4096


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _as_naive(dt: Optional[datetime]) -> Optional[datetime]:
    """DB datetimes are UTC; sqlite returns them naive, postgres may not."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _fmt_dur(seconds: Optional[float]) -> str:
    """Compact duration: 42s, 5m12s, 3h04m, 2d05h."""
    if seconds is None:
        return "-"
    s = max(0, int(seconds))
    if s < 60:
        return f"{s}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m{s:02d}s"
    h, m = divmod(m, 60)
    if h < 24:
        return f"{h}h{m:02d}m"
    d, h = divmod(h, 24)
    return f"{d}d{h:02d}h"


def _fmt_size(n: Optional[int]) -> str:
    if n is None:
        return "-"
    for unit in ("B", "K", "M", "G", "T"):
        if n < 1024 or unit == "T":
            return f"{n:.0f}{unit}" if unit == "B" else f"{n:.1f}{unit}"
        n /= 1024
    return "?"


def _fit(s: str, width: int) -> str:
    """Truncate a string to a display width, marking the cut with an ellipsis."""
    if width <= 0:
        return ""
    if len(s) <= width:
        return s
    if width == 1:
        return "…"
    return s[: width - 1] + "…"


_DB_URL_CREDENTIALS = re.compile(r"^([\w+]+)://[^@/]+@")


def _redact_db_url(url: str) -> str:
    """Strip user:password credentials from a DB URL for display.

    postgresql://user:pass@host:5432/db -> postgresql://***@host:5432/db
    URLs without credentials (sqlite:///path) pass through unchanged. The
    host and database stay visible so it is clear where the tool connects.
    """
    return _DB_URL_CREDENTIALS.sub(r"\1://***@", url)


_user_cache: dict[int, str] = {}


def _username_for_uid(uid: int) -> str:
    name = _user_cache.get(uid)
    if name is None:
        try:
            name = pwd.getpwuid(uid).pw_name
        except KeyError:
            name = str(uid)
        _user_cache[uid] = name
    return name


# ---------------------------------------------------------------------------
# Snapshot dataclasses
# ---------------------------------------------------------------------------

@dataclass
class JobRow:
    """Detached copy of a JobDB row (safe to use outside the session)."""
    id: int
    username: str
    app_name: str
    app_url: str
    entry_point_id: str
    entry_point_name: str
    entry_point_type: str
    cluster_job_id: Optional[str]
    status: str
    exit_code: Optional[int]
    created_at: Optional[datetime]
    status_updated_at: Optional[datetime]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    work_dir: Optional[str]
    script_path: Optional[str]
    resources: Optional[dict]
    command: Optional[str]
    container: Optional[str]
    conda_env: Optional[str]

    @property
    def is_active(self) -> bool:
        return not db.is_terminal_job_status(self.status)

    @classmethod
    def from_db(cls, j) -> "JobRow":
        return cls(
            id=j.id,
            username=j.username,
            app_name=j.app_name,
            app_url=j.app_url,
            entry_point_id=j.entry_point_id,
            entry_point_name=j.entry_point_name,
            entry_point_type=getattr(j, "entry_point_type", "job"),
            cluster_job_id=j.cluster_job_id,
            status=j.status,
            exit_code=j.exit_code,
            created_at=_as_naive(j.created_at),
            status_updated_at=_as_naive(getattr(j, "status_updated_at", None)),
            started_at=_as_naive(j.started_at),
            finished_at=_as_naive(j.finished_at),
            work_dir=j.work_dir,
            script_path=getattr(j, "script_path", None),
            resources=j.resources,
            command=j.command,
            container=j.container,
            conda_env=j.conda_env,
        )


@dataclass
class ProcInfo:
    pid: int
    ppid: int
    comm: str
    state: str
    uid: int
    argv: list[str]
    starttime: int          # kernel ticks since boot (identity, not wall time)
    cpu_ticks: int
    rss_bytes: int
    age_seconds: float
    cpu_pct: float = 0.0

    @property
    def username(self) -> str:
        return _username_for_uid(self.uid)

    @property
    def cmdline(self) -> str:
        return " ".join(self.argv) if self.argv else f"[{self.comm}]"


@dataclass
class SchedCmd:
    """A scheduler command observed running in the process tree."""
    pid: int
    starttime: int
    cmdline: str
    username: str
    via: str                # 'worker:<user>', 'server', 'debug-tui', or '-'
    first_seen: float
    last_seen: float
    alive: bool = True


@dataclass
class WorkDirInfo:
    """Probed state of a job's work directory."""
    probed_at: float = 0.0
    error: Optional[str] = None
    files: dict[str, tuple[Optional[int], Optional[float]]] = field(default_factory=dict)
    phase: Optional[str] = None
    service_url: Optional[str] = None
    job_pid: Optional[int] = None
    pid_alive: Optional[bool] = None
    exit_code_file: Optional[str] = None
    stderr_tail: Optional[str] = None
    stdout_tail: Optional[str] = None


@dataclass
class SchedInfo:
    """Scheduler-reported state for a cluster job id (bjobs cross-check)."""
    stat_raw: str
    status: str             # mapped to Fileglancer status vocabulary
    exit_code: Optional[str]
    exec_host: Optional[str]
    checked_at: float


@dataclass
class Event:
    ts: float
    kind: str
    message: str

    def format(self) -> str:
        return f"{time.strftime('%H:%M:%S', time.localtime(self.ts))}  {self.kind:<7} {self.message}"


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

class SharedState:
    """State shared between collector threads and the UI thread."""

    def __init__(self, event_log_path: Optional[str] = None):
        self.lock = threading.Lock()
        self.stop = threading.Event()

        # DB
        self.jobs: list[JobRow] = []
        self.jobs_total: int = 0
        self.db_error: Optional[str] = None
        self.db_last_ok: float = 0.0

        # Processes
        self.server_procs: list[ProcInfo] = []
        self.worker_procs: list[ProcInfo] = []
        self.worker_children: dict[int, list[ProcInfo]] = {}
        self.sched_cmds: "OrderedDict[tuple[int, int], SchedCmd]" = OrderedDict()
        self.proc_error: Optional[str] = None

        # Poll lock
        self.lock_holder_pid: Optional[int] = None
        self.lock_mtime: Optional[float] = None
        self.lock_path_exists: bool = False

        # Work dirs, keyed by job id
        self.workdirs: dict[int, WorkDirInfo] = {}

        # bjobs cross-check
        self.crosscheck_enabled: bool = False
        self.sched_status: dict[str, SchedInfo] = {}
        self.crosscheck_last: float = 0.0
        self.crosscheck_error: Optional[str] = None

        # UI hints for collectors
        self.selected_job_id: Optional[int] = None

        # Log viewer: (job_id, 'stdout'|'stderr'|'script') requested by the
        # UI; content filled in by the log collector. log_wake makes the
        # collector refresh immediately on open/switch.
        self.log_request: Optional[tuple[int, str]] = None
        self.log_content: Optional["LogViewData"] = None
        self.log_wake = threading.Event()

        # Events
        self.events: deque[Event] = deque(maxlen=1000)
        self._event_log_path = event_log_path
        self._event_log_error = False

    def add_event(self, kind: str, message: str):
        ev = Event(time.time(), kind, message)
        with self.lock:
            self.events.append(ev)
        if self._event_log_path and not self._event_log_error:
            try:
                with open(self._event_log_path, "a") as f:
                    ts = datetime.fromtimestamp(ev.ts).strftime("%Y-%m-%d %H:%M:%S")
                    f.write(f"{ts} {kind:<7} {message}\n")
            except OSError:
                self._event_log_error = True


# ---------------------------------------------------------------------------
# Collector: database
# ---------------------------------------------------------------------------

def _collect_db_once(state: SharedState, db_url: str,
                     prev: Optional[dict[int, JobRow]]) -> Optional[dict[int, JobRow]]:
    """Take one DB snapshot; diff against prev to emit events."""
    try:
        session = db.get_db_session(db_url)
        try:
            total = session.query(db.JobDB).count()
            rows = (session.query(db.JobDB)
                    .order_by(db.JobDB.id.desc())
                    .limit(500).all())
            jobs = [JobRow.from_db(r) for r in rows]
        finally:
            session.close()
    except Exception as e:
        with state.lock:
            state.db_error = f"{type(e).__name__}: {e}"
        return prev

    with state.lock:
        state.jobs = jobs
        state.jobs_total = total
        state.db_error = None
        state.db_last_ok = time.time()

    current = {j.id: j for j in jobs}
    if prev is not None:
        for jid, j in current.items():
            old = prev.get(jid)
            label = f"job {jid} [{j.username}] {j.app_name}/{j.entry_point_id}"
            if old is None:
                # Only report as a submission if it looks new (avoid replaying
                # history when an old row scrolls into the 500-row window).
                age = (_utcnow_naive() - j.created_at).total_seconds() if j.created_at else 0
                if age < 300:
                    state.add_event("SUBMIT", f"{label} created (status {j.status})")
                continue
            if old.status != j.status:
                extra = f" exit={j.exit_code}" if j.exit_code is not None else ""
                state.add_event("STATUS", f"{label}: {old.status} → {j.status}{extra}")
            if old.cluster_job_id != j.cluster_job_id and j.cluster_job_id:
                state.add_event("STATUS", f"{label}: assigned cluster job id {j.cluster_job_id}")
        for jid, old in prev.items():
            if jid not in current and old.is_active:
                state.add_event("DELETE", f"job {jid} [{old.username}] removed from database")
    return current


def _db_collector(state: SharedState, db_url: str, interval: float):
    prev = None
    while not state.stop.is_set():
        prev = _collect_db_once(state, db_url, prev)
        state.stop.wait(interval)


# ---------------------------------------------------------------------------
# Collector: /proc scanner (servers, workers, scheduler commands, poll lock)
# ---------------------------------------------------------------------------

def _read_proc(pid: int, boot_time: float) -> Optional[ProcInfo]:
    """Read one process's stat/cmdline. Returns None if it vanished."""
    base = f"/proc/{pid}"
    try:
        with open(f"{base}/stat", "rb") as f:
            data = f.read()
        rp = data.rindex(b")")
        comm = data[data.index(b"(") + 1: rp].decode(errors="replace")
        fields = data[rp + 2:].split()
        state_ch = fields[0].decode()
        ppid = int(fields[1])
        utime, stime = int(fields[11]), int(fields[12])
        starttime = int(fields[19])
        rss_pages = int(fields[21])

        with open(f"{base}/cmdline", "rb") as f:
            argv = [a.decode(errors="replace") for a in f.read().split(b"\0") if a]

        uid = os.stat(base).st_uid
    except (OSError, ValueError, IndexError):
        return None

    start_wall = boot_time + starttime / _CLK_TCK
    return ProcInfo(
        pid=pid, ppid=ppid, comm=comm, state=state_ch, uid=uid, argv=argv,
        starttime=starttime, cpu_ticks=utime + stime,
        rss_bytes=rss_pages * _PAGE_SIZE,
        age_seconds=max(0.0, time.time() - start_wall),
    )


def _get_boot_time() -> float:
    try:
        with open("/proc/stat") as f:
            for line in f:
                if line.startswith("btime "):
                    return float(line.split()[1])
    except OSError:
        pass
    return time.time()


def _classify_sched_cmd(argv: list[str]) -> Optional[str]:
    """Return the scheduler command name if this argv is one, else None."""
    if not argv:
        return None
    base = os.path.basename(argv[0])
    if base in SCHED_CMD_NAMES:
        return base
    # Shell wrapper: sh -c 'bjobs ...'
    if base in _SHELL_NAMES and len(argv) >= 3 and argv[1] == "-c":
        for token in argv[2].split():
            if os.path.basename(token) in SCHED_CMD_NAMES:
                return os.path.basename(token)
    return None


def _is_server_proc(argv: list[str]) -> bool:
    cmd = " ".join(argv)
    if "fileglancer.server" in cmd:
        return True
    if "uvicorn" in cmd and "fileglancer" in cmd:
        return True
    # Console script: .../bin/fileglancer start [...]
    for i, a in enumerate(argv):
        if os.path.basename(a) == "fileglancer" and "start" in argv[i + 1: i + 3]:
            return True
    return False


def _find_lock_holder(lock_path: str) -> tuple[Optional[int], Optional[float], bool]:
    """Return (holder_pid, lock_file_mtime, file_exists) for the poll lock.

    The poll loop takes an flock; /proc/locks lists FLOCK entries as
    ``id: FLOCK ADVISORY WRITE <pid> <maj>:<min>:<inode> <start> <end>``
    with maj/min in hex. Matching the lock file's device+inode identifies
    the process currently holding the poll lock.
    """
    try:
        st = os.stat(lock_path)
    except OSError:
        return None, None, False

    holder = None
    try:
        with open("/proc/locks") as f:
            for line in f:
                parts = line.split()
                if len(parts) < 6 or parts[1] != "FLOCK":
                    continue
                try:
                    pid = int(parts[4])
                    maj_s, min_s, ino_s = parts[5].split(":")
                    if (int(ino_s) == st.st_ino
                            and int(maj_s, 16) == os.major(st.st_dev)
                            and int(min_s, 16) == os.minor(st.st_dev)):
                        holder = pid
                        break
                except ValueError:
                    continue
    except OSError:
        pass
    return holder, st.st_mtime, True


def _proc_collector(state: SharedState, lock_path: str, interval: float):
    boot_time = _get_boot_time()
    my_pid = os.getpid()
    prev_cpu: dict[tuple[int, int], tuple[int, float]] = {}
    prev_workers: dict[int, str] = {}
    prev_holder: Optional[int] = None
    first_scan = True

    while not state.stop.is_set():
        now = time.time()
        procs: dict[int, ProcInfo] = {}
        try:
            for entry in os.listdir("/proc"):
                if not entry.isdigit():
                    continue
                info = _read_proc(int(entry), boot_time)
                if info is not None:
                    procs[info.pid] = info
            proc_error = None
        except OSError as e:
            proc_error = str(e)

        # CPU% from tick deltas between scans
        new_cpu: dict[tuple[int, int], tuple[int, float]] = {}
        for p in procs.values():
            key = (p.pid, p.starttime)
            new_cpu[key] = (p.cpu_ticks, now)
            old = prev_cpu.get(key)
            if old:
                dticks, dt_s = p.cpu_ticks - old[0], now - old[1]
                if dt_s > 0:
                    p.cpu_pct = max(0.0, 100.0 * (dticks / _CLK_TCK) / dt_s)
        prev_cpu = new_cpu

        # Classify
        servers, workers, sched = [], [], []
        for p in procs.values():
            if p.pid == my_pid:
                continue
            cmd = " ".join(p.argv)
            if "fileglancer.user_worker" in cmd:
                workers.append(p)
            elif _is_server_proc(p.argv):
                servers.append(p)
            elif _classify_sched_cmd(p.argv):
                sched.append(p)

        server_pids = {p.pid for p in servers}
        # uvicorn --workers / --reload children spawn via multiprocessing and
        # have unrecognizable cmdlines; pull in children of known servers.
        for p in procs.values():
            if (p.ppid in server_pids and p.pid not in server_pids
                    and p.pid != my_pid
                    and "fileglancer.user_worker" not in " ".join(p.argv)
                    and not _classify_sched_cmd(p.argv)):
                servers.append(p)
                server_pids.add(p.pid)

        worker_pids = {p.pid: p for p in workers}

        # Children of workers (a busy worker has e.g. a bjobs child)
        children: dict[int, list[ProcInfo]] = {}
        for p in procs.values():
            if p.ppid in worker_pids:
                children.setdefault(p.ppid, []).append(p)

        def _via(p: ProcInfo) -> str:
            seen = set()
            cur = p
            while cur.ppid not in seen and cur.ppid > 1:
                seen.add(cur.ppid)
                if cur.ppid in worker_pids:
                    return f"worker:{worker_pids[cur.ppid].username}"
                if cur.ppid in server_pids:
                    return "server"
                if cur.ppid == my_pid:
                    return "debug-tui"
                parent = procs.get(cur.ppid)
                if parent is None:
                    break
                cur = parent
            return "-"

        # Scheduler command bookkeeping + events
        seen_keys = set()
        for p in sched:
            key = (p.pid, p.starttime)
            seen_keys.add(key)
            with state.lock:
                rec = state.sched_cmds.get(key)
            if rec is None:
                rec = SchedCmd(
                    pid=p.pid, starttime=p.starttime, cmdline=p.cmdline,
                    username=p.username, via=_via(p),
                    first_seen=now, last_seen=now,
                )
                with state.lock:
                    state.sched_cmds[key] = rec
                    while len(state.sched_cmds) > 200:
                        state.sched_cmds.popitem(last=False)
                if not first_scan:
                    state.add_event(
                        "EXEC",
                        f"{_fit(p.cmdline, 100)} (user {p.username}, via {rec.via}, pid {p.pid})",
                    )
            else:
                rec.last_seen = now
                rec.alive = True
        with state.lock:
            for key, rec in state.sched_cmds.items():
                if rec.alive and key not in seen_keys:
                    rec.alive = False

        # Worker spawn/exit events
        current_workers = {p.pid: p.username for p in workers}
        if not first_scan:
            for pid, user in current_workers.items():
                if pid not in prev_workers:
                    state.add_event("WORKER", f"worker spawned for {user} (pid {pid})")
            for pid, user in prev_workers.items():
                if pid not in current_workers:
                    state.add_event("WORKER", f"worker for {user} exited (pid {pid})")
        prev_workers = current_workers

        # Poll lock
        holder, mtime, exists = _find_lock_holder(lock_path)
        if not first_scan and holder != prev_holder:
            if holder is not None:
                where = "server" if holder in server_pids else "?"
                state.add_event("POLL", f"poll lock acquired by pid {holder} ({where})")
            elif prev_holder is not None:
                state.add_event("POLL", f"poll lock released by pid {prev_holder}")
        prev_holder = holder

        servers.sort(key=lambda p: p.pid)
        workers.sort(key=lambda p: (p.username, p.pid))
        with state.lock:
            state.server_procs = servers
            state.worker_procs = workers
            state.worker_children = children
            state.proc_error = proc_error
            state.lock_holder_pid = holder
            state.lock_mtime = mtime
            state.lock_path_exists = exists

        first_scan = False
        state.stop.wait(interval)


# ---------------------------------------------------------------------------
# Collector: work directory prober
# ---------------------------------------------------------------------------

_PROBE_FILES = ("stdout.log", "stderr.log", "service_url", "phase",
                "job.pid", "exit_code")


def _read_small(path: Path, limit: int = 4096) -> Optional[str]:
    try:
        with path.open("rb") as f:
            return f.read(limit).decode(errors="replace").strip()
    except OSError:
        return None


def _read_tail(path: Path, nbytes: int = 4096) -> Optional[str]:
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            if size > nbytes:
                f.seek(size - nbytes)
            data = f.read(nbytes)
        text = data.decode(errors="replace")
        if size > nbytes and "\n" in text:
            text = text[text.index("\n") + 1:]
        return text
    except OSError:
        return None


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _probe_workdir(job: JobRow, want_tails: bool) -> WorkDirInfo:
    info = WorkDirInfo(probed_at=time.time())
    if not job.work_dir:
        info.error = "no work_dir recorded"
        return info
    wd = Path(job.work_dir)
    try:
        if not wd.exists():
            info.error = "work_dir does not exist"
            return info
    except PermissionError:
        info.error = "permission denied"
        return info

    targets = dict.fromkeys(_PROBE_FILES)
    if job.script_path:
        targets["script"] = None
    for name in targets:
        path = Path(job.script_path) if name == "script" else wd / name
        try:
            st = path.stat()
            info.files[name] = (st.st_size, st.st_mtime)
        except FileNotFoundError:
            continue
        except OSError as e:
            info.files[name] = (None, None)
            info.error = info.error or f"{name}: {e.strerror or e}"

    if "phase" in info.files:
        info.phase = _read_small(wd / "phase")
    if "service_url" in info.files:
        info.service_url = _read_small(wd / "service_url")
    if "exit_code" in info.files:
        info.exit_code_file = _read_small(wd / "exit_code")
    if "job.pid" in info.files:
        raw = _read_small(wd / "job.pid")
        if raw:
            try:
                info.job_pid = int(raw)
                info.pid_alive = _pid_alive(info.job_pid)
            except ValueError:
                pass
    if want_tails:
        info.stdout_tail = _read_tail(wd / "stdout.log")
        info.stderr_tail = _read_tail(wd / "stderr.log")
    return info


def _workdir_collector(state: SharedState, interval: float):
    while not state.stop.is_set():
        with state.lock:
            jobs = list(state.jobs)
            selected = state.selected_job_id
        # Active jobs plus whichever job is selected in the UI.
        to_probe = [j for j in jobs if j.is_active][:30]
        if selected is not None and all(j.id != selected for j in to_probe):
            sel = next((j for j in jobs if j.id == selected), None)
            if sel is not None:
                to_probe.append(sel)

        results = {}
        for job in to_probe:
            if state.stop.is_set():
                return
            results[job.id] = _probe_workdir(job, want_tails=(job.id == selected))

        with state.lock:
            state.workdirs = results
        state.stop.wait(interval)


# ---------------------------------------------------------------------------
# Collector: log viewer tail
# ---------------------------------------------------------------------------

# The viewer tails the last chunk of the file rather than reading it all:
# HPC logs can reach gigabytes, and the newest output is what matters when
# watching a job. The file's browse link (work dir) gives full access.
_LOG_TAIL_BYTES = 256 * 1024


@dataclass
class LogViewData:
    """Content of the file currently open in the log viewer."""
    job_id: int
    file_type: str          # 'stdout' | 'stderr' | 'script'
    path: Optional[str]
    size: Optional[int] = None
    mtime: Optional[float] = None
    truncated: int = 0      # bytes omitted before the tail
    lines: list[str] = field(default_factory=list)
    error: Optional[str] = None
    fetched_at: float = 0.0


def _resolve_log_path(job: JobRow, file_type: str) -> Optional[Path]:
    """Locate a job file the same way the server does (see apps/jobfiles.py)."""
    if file_type == "script":
        if job.script_path:
            return Path(job.script_path)
        if job.work_dir:
            try:
                scripts = sorted(Path(job.work_dir).glob("*.sh"))
            except OSError:
                return None
            if scripts:
                return scripts[0]
        return None
    if not job.work_dir:
        return None
    return Path(job.work_dir) / f"{file_type}.log"


def _build_log_view(job: Optional[JobRow], job_id: int, file_type: str) -> LogViewData:
    view = LogViewData(job_id=job_id, file_type=file_type, path=None,
                       fetched_at=time.time())
    if job is None:
        view.error = "job no longer in the database"
        return view
    path = _resolve_log_path(job, file_type)
    if path is None:
        view.error = ("no script recorded for this job" if file_type == "script"
                      else "no work_dir recorded for this job")
        return view
    view.path = str(path)
    try:
        st = path.stat()
        with path.open("rb") as f:
            if st.st_size > _LOG_TAIL_BYTES:
                f.seek(st.st_size - _LOG_TAIL_BYTES)
            data = f.read(_LOG_TAIL_BYTES)
    except FileNotFoundError:
        view.error = "file does not exist (yet — it appears once the job starts)"
        return view
    except PermissionError:
        view.error = (f"permission denied reading as "
                      f"{_username_for_uid(os.getuid())} (other users' files "
                      f"may be unreadable on root-squashed NFS)")
        return view
    except OSError as e:
        view.error = str(e)
        return view

    text = data.decode(errors="replace")
    view.size = st.st_size
    view.mtime = st.st_mtime
    view.truncated = max(0, st.st_size - len(data))
    if view.truncated and "\n" in text:
        text = text[text.index("\n") + 1:]
    view.lines = text.splitlines()
    return view


def _log_collector(state: SharedState, interval: float):
    """Refresh the open log view so follow mode behaves like ``tail -f``.

    Idles cheaply when no view is open; state.log_wake short-circuits the
    wait so opening a file or switching stdout/stderr feels instant.
    """
    while not state.stop.is_set():
        with state.lock:
            req = state.log_request
            jobs = {j.id: j for j in state.jobs}
        if req is None:
            state.log_wake.wait(0.5)
            state.log_wake.clear()
            continue

        job_id, file_type = req
        view = _build_log_view(jobs.get(job_id), job_id, file_type)
        with state.lock:
            if state.log_request == req:    # still what the UI wants?
                state.log_content = view
        state.log_wake.wait(interval)
        state.log_wake.clear()


# ---------------------------------------------------------------------------
# Collector: bjobs cross-check (opt-in)
# ---------------------------------------------------------------------------

def _crosscheck_collector(state: SharedState, executor: str, interval: float):
    """When enabled, ask LSF directly and compare against DB statuses."""
    last_mismatch: dict[str, str] = {}
    while not state.stop.is_set():
        state.stop.wait(1.0)
        with state.lock:
            enabled = state.crosscheck_enabled
            due = time.time() - state.crosscheck_last >= interval
            jobs = list(state.jobs)
        if not (enabled and due):
            continue

        if executor == "local":
            with state.lock:
                state.crosscheck_error = "cross-check n/a for local executor"
                state.crosscheck_last = time.time()
            continue
        if shutil.which("bjobs") is None:
            with state.lock:
                state.crosscheck_error = "bjobs not found on this host"
                state.crosscheck_last = time.time()
            continue

        by_cid = {j.cluster_job_id: j for j in jobs
                  if j.is_active and j.cluster_job_id}
        with state.lock:
            state.crosscheck_last = time.time()
        if not by_cid:
            continue

        cmd = ["bjobs", "-noheader",
               "-o", "jobid stat exit_code exec_host"] + list(by_cid)
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        except (subprocess.TimeoutExpired, OSError) as e:
            with state.lock:
                state.crosscheck_error = f"bjobs failed: {e}"
            continue

        now = time.time()
        results: dict[str, SchedInfo] = {}
        for line in out.stdout.splitlines():
            parts = line.split()
            if len(parts) < 2:
                continue
            cid, stat = parts[0], parts[1]
            exit_code = parts[2] if len(parts) > 2 and parts[2] != "-" else None
            exec_host = parts[3] if len(parts) > 3 and parts[3] != "-" else None
            results[cid] = SchedInfo(
                stat_raw=stat, status=LSF_STAT_MAP.get(stat, stat),
                exit_code=exit_code, exec_host=exec_host, checked_at=now,
            )
        # bjobs reports missing jobs on stderr only
        for line in out.stderr.splitlines():
            if "is not found" in line:
                for cid in by_cid:
                    if f"<{cid}>" in line:
                        results[cid] = SchedInfo(
                            stat_raw="NOTFOUND", status="NOT_FOUND",
                            exit_code=None, exec_host=None, checked_at=now,
                        )

        with state.lock:
            state.sched_status.update(results)
            state.crosscheck_error = None

        for cid, sinfo in results.items():
            j = by_cid.get(cid)
            if j is None:
                continue
            if sinfo.status not in (j.status, j.status.upper()):
                key = f"{cid}:{j.status}:{sinfo.status}"
                if last_mismatch.get(cid) != key:
                    last_mismatch[cid] = key
                    state.add_event(
                        "CHECK",
                        f"job {j.id} [{j.username}] DB says {j.status} "
                        f"but bjobs says {sinfo.stat_raw} (cluster id {cid})",
                    )
            else:
                last_mismatch.pop(cid, None)


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

STATUS_ORDER = {"RUNNING": 0, "PENDING": 1, "UNKNOWN": 2}


class UIContext:
    """Mutable UI-side state (selection, scroll offsets, toggles)."""

    def __init__(self, show_all: bool):
        self.show_all = show_all
        self.paused = False
        self.selected_idx = 0
        self.scroll = 0
        self.detail_open = False
        # The job pinned in the detail overlay. Held as a JobRow (not an
        # index) so the overlay never switches jobs when the table re-sorts
        # under it; refreshed by id each frame so its own fields stay live.
        self.detail_job: Optional[JobRow] = None
        # Log viewer
        self.log_open = False
        self.log_job_id: Optional[int] = None
        self.log_follow = True
        self.log_scroll = 0
        self.log_hscroll = 0


def _visible_jobs(jobs: list[JobRow], show_all: bool) -> list[JobRow]:
    rows = jobs if show_all else [j for j in jobs if j.is_active]
    return sorted(rows, key=lambda j: (0 if j.is_active else 1,
                                       STATUS_ORDER.get(j.status, 3),
                                       -j.id))


def _run_ui(stdscr, state: SharedState, ui: UIContext, meta: dict):
    import curses

    curses.curs_set(0)
    stdscr.timeout(250)

    has_color = curses.has_colors()
    if has_color:
        curses.start_color()
        curses.use_default_colors()
        for i, fg in enumerate(
            [curses.COLOR_GREEN, curses.COLOR_YELLOW, curses.COLOR_RED,
             curses.COLOR_CYAN, curses.COLOR_MAGENTA, curses.COLOR_BLUE,
             curses.COLOR_WHITE], start=1,
        ):
            curses.init_pair(i, fg, -1)

    def color(n, attr=0):
        return (curses.color_pair(n) | attr) if has_color else attr

    C_GREEN, C_YELLOW, C_RED = color(1), color(2), color(3)
    C_CYAN, C_MAGENTA, C_BLUE = color(4), color(5), color(6)
    C_DIM = curses.A_DIM
    STATUS_ATTRS = {
        "RUNNING": C_GREEN | curses.A_BOLD,
        "PENDING": C_YELLOW,
        "DONE": C_CYAN,
        "FAILED": C_RED | curses.A_BOLD,
        "KILLED": C_MAGENTA,
        "UNKNOWN": C_RED,
    }
    KIND_ATTRS = {
        "STATUS": C_GREEN, "SUBMIT": C_CYAN, "DELETE": C_MAGENTA,
        "WORKER": C_BLUE, "POLL": C_YELLOW, "EXEC": C_YELLOW | curses.A_BOLD,
        "CHECK": C_RED | curses.A_BOLD, "ERROR": C_RED, "INFO": 0,
    }

    def put(y, x, text, attr=0, maxw=None):
        h, w = stdscr.getmaxyx()
        if y < 0 or y >= h or x >= w:
            return
        avail = w - x if maxw is None else min(maxw, w - x)
        try:
            stdscr.addstr(y, x, _fit(text, avail - 1 if y == h - 1 else avail), attr)
        except curses.error:
            pass

    def hline_title(y, title, attr=curses.A_BOLD):
        h, w = stdscr.getmaxyx()
        if y < 0 or y >= h:
            return
        try:
            stdscr.hline(y, 0, curses.ACS_HLINE, w)
        except curses.error:
            pass
        put(y, 1, f" {title} ", attr)

    view: dict[str, Any] = {}

    def snapshot():
        with state.lock:
            return {
                "jobs": list(state.jobs),
                "jobs_total": state.jobs_total,
                "db_error": state.db_error,
                "servers": list(state.server_procs),
                "workers": list(state.worker_procs),
                "children": {k: list(v) for k, v in state.worker_children.items()},
                "sched_cmds": list(state.sched_cmds.values()),
                "lock_holder": state.lock_holder_pid,
                "lock_mtime": state.lock_mtime,
                "lock_exists": state.lock_path_exists,
                "workdirs": dict(state.workdirs),
                "events": list(state.events),
                "crosscheck": state.crosscheck_enabled,
                "sched_status": dict(state.sched_status),
                "crosscheck_error": state.crosscheck_error,
                "log_request": state.log_request,
                "log_content": state.log_content,
            }

    def draw_header(v):
        _, w = stdscr.getmaxyx()
        now = time.strftime("%H:%M:%S")
        line1 = (f"Fileglancer Debug — db: {meta['db_display']}  "
                 f"executor: {meta['executor']}  poll_interval: {meta['poll_interval']:g}s")
        put(0, 0, line1, curses.A_BOLD)
        put(0, w - len(now) - 1, now, curses.A_BOLD)

        servers = v["servers"]
        active_jobs = [j for j in v["jobs"] if j.is_active]
        holder = v["lock_holder"]
        if not servers:
            # No fileglancer server on this host — the DB being watched must
            # belong to a server running elsewhere. The poll lock and its
            # mtime heartbeat are host-local, so they describe the wrong
            # machine; present them as n/a instead of raising false alarms.
            poller = "POLLER: n/a (no fileglancer server on this host)"
            poller_attr = C_DIM
            heartbeat, hb_attr = "heartbeat n/a", C_DIM
        elif holder is not None:
            server_pids = {p.pid for p in servers}
            tag = "server" if holder in server_pids else "pid"
            poller = f"POLLER: {tag} {holder}"
            poller_attr = C_GREEN | curses.A_BOLD
        elif not v["lock_exists"]:
            poller = "POLLER: lock file not found"
            poller_attr = C_DIM
        else:
            poller = "POLLER: lock free"
            poller_attr = 0

        if not servers:
            pass  # heartbeat already set to n/a above
        elif v["lock_mtime"]:
            cycle_ago = time.time() - v["lock_mtime"]
            heartbeat = f"last cycle {_fmt_dur(cycle_ago)} ago"
            stale = (active_jobs
                     and cycle_ago > 3 * max(meta["poll_interval"], 1.0))
            hb_attr = (C_RED | curses.A_BOLD) if stale else 0
            if stale:
                heartbeat += "  ⚠ NO POLL ACTIVITY"
        elif active_jobs:
            heartbeat, hb_attr = "no poll heartbeat", C_RED | curses.A_BOLD
        else:
            heartbeat, hb_attr = "poll loop idle (no active jobs)", C_DIM

        x = 0
        seg = f"Servers: {len(servers)}  Workers: {len(v['workers'])}  Active jobs: {len(active_jobs)}   "
        put(1, x, seg); x += len(seg)
        put(1, x, poller, poller_attr); x += len(poller) + 3
        put(1, x, heartbeat, hb_attr); x += len(heartbeat) + 3
        if v["db_error"]:
            put(1, x, f"DB ERROR: {v['db_error']}", C_RED | curses.A_BOLD)
        elif ui.paused:
            put(1, x, "[PAUSED]", C_YELLOW | curses.A_BOLD)

    JOB_HDR = (f"{'ID':>5} {'USER':<10} {'APP':<18} {'ENTRY':<14} {'TYP':<4} "
               f"{'CLUSTER':<10} {'STATUS':<9} {'EXIT':>4} {'AGE':>7} "
               f"{'IN-STATE':>8}  SCHED")

    def draw_jobs(v, y0, height, rows):
        shown_label = "all" if ui.show_all else "active only"
        hline_title(
            y0,
            f"Jobs ({len([j for j in v['jobs'] if j.is_active])} active / "
            f"{v['jobs_total']} total, showing {shown_label} — 'a' toggles)",
        )
        put(y0 + 1, 0, JOB_HDR, curses.A_UNDERLINE)
        body_h = height - 2
        ui.selected_idx = max(0, min(ui.selected_idx, len(rows) - 1)) if rows else 0
        if ui.selected_idx < ui.scroll:
            ui.scroll = ui.selected_idx
        if ui.selected_idx >= ui.scroll + body_h:
            ui.scroll = ui.selected_idx - body_h + 1
        ui.scroll = max(0, min(ui.scroll, max(0, len(rows) - body_h)))

        now = _utcnow_naive()
        for i in range(body_h):
            idx = ui.scroll + i
            if idx >= len(rows):
                break
            j = rows[idx]
            age = (now - j.created_at).total_seconds() if j.created_at else None
            ref = j.status_updated_at or j.created_at
            in_state = (now - ref).total_seconds() if ref else None
            sched = v["sched_status"].get(j.cluster_job_id or "")
            sched_s = sched.stat_raw if (sched and v["crosscheck"]) else ""
            line = (f"{j.id:>5} {_fit(j.username, 10):<10} {_fit(j.app_name, 18):<18} "
                    f"{_fit(j.entry_point_id, 14):<14} {_fit(j.entry_point_type[:4], 4):<4} "
                    f"{_fit(j.cluster_job_id or '-', 10):<10} {j.status:<9} "
                    f"{'' if j.exit_code is None else j.exit_code:>4} "
                    f"{_fmt_dur(age):>7} {_fmt_dur(in_state):>8}  {sched_s}")
            attr = STATUS_ATTRS.get(j.status, 0)
            mismatch = (sched and v["crosscheck"]
                        and sched.status not in (j.status, "NOT_FOUND")
                        and j.is_active)
            if mismatch:
                attr = C_RED | curses.A_BOLD
            if idx == ui.selected_idx:
                attr |= curses.A_REVERSE
            put(y0 + 2 + i, 0, line, attr)

    def draw_procs(v, y0, height, width):
        hline_title(y0, "Processes (this host)")
        rows = []
        holder = v["lock_holder"]
        for p in v["servers"]:
            mark = " ● POLLER" if p.pid == holder else ""
            rows.append((
                f"SERVER  {p.pid:>7}  {p.username:<10} age {_fmt_dur(p.age_seconds):>6} "
                f"cpu {p.cpu_pct:4.0f}% rss {_fmt_size(p.rss_bytes):>7}{mark}",
                (C_GREEN | curses.A_BOLD) if mark else 0,
            ))
        for p in v["workers"]:
            kids = v["children"].get(p.pid, [])
            doing = ""
            for k in kids:
                name = _classify_sched_cmd(k.argv)
                if name:
                    doing = f" → {name} (pid {k.pid})"
                    break
            if not doing and kids:
                doing = f" → {len(kids)} child procs"
            busy = doing or (" busy" if p.cpu_pct > 5 else " idle")
            rows.append((
                f"WORKER  {p.pid:>7}  {p.username:<10} age {_fmt_dur(p.age_seconds):>6} "
                f"cpu {p.cpu_pct:4.0f}% rss {_fmt_size(p.rss_bytes):>7}{busy}",
                (C_YELLOW | curses.A_BOLD) if doing else 0,
            ))
        if not rows:
            rows.append(("no fileglancer processes found on this host", C_DIM))
        for i, (text, attr) in enumerate(rows[: height - 1]):
            put(y0 + 1 + i, 0, text, attr, maxw=width)

    def draw_sched(v, y0, height, x0):
        _, w = stdscr.getmaxyx()
        put(y0, x0 - 1, "│")
        title = "Scheduler activity (this host)"
        if v["crosscheck"]:
            title += " [bjobs check ON]"
            if v["crosscheck_error"]:
                title += f" ({v['crosscheck_error']})"
        put(y0, x0 + 1, f" {title} ", curses.A_BOLD)
        cmds = sorted(v["sched_cmds"], key=lambda c: -c.first_seen)
        if not cmds:
            put(y0 + 1, x0 + 1, "none observed yet", C_DIM)
        for i, c in enumerate(cmds[: height - 1]):
            ts = time.strftime("%H:%M:%S", time.localtime(c.first_seen))
            dur = c.last_seen - c.first_seen
            status = "…" if c.alive else _fmt_dur(dur)
            line = f"{ts} {status:>5} {c.cmdline}  [{c.via}]"
            attr = (C_YELLOW | curses.A_BOLD) if c.alive else 0
            put(y0 + 1 + i, x0 + 1, line, attr, maxw=w - x0 - 1)
        for i in range(1, height):
            put(y0 + i, x0 - 1, "│")

    def draw_events(v, y0, height):
        hline_title(y0, f"Events ({len(v['events'])})")
        evs = v["events"][-(height - 1):]
        for i, ev in enumerate(evs):
            put(y0 + 1 + i, 0, ev.format(), KIND_ATTRS.get(ev.kind, 0))

    def draw_footer():
        h, w = stdscr.getmaxyx()
        text = (" q quit  j/k select  ↵ detail  o/e/s logs  a all-jobs  "
                "b bjobs-check  p pause ")
        put(h - 1, 0, text.ljust(w - 1), curses.A_REVERSE)

    def draw_detail(v, job: JobRow):
        h, w = stdscr.getmaxyx()
        bh, bw = max(12, int(h * 0.85)), max(60, int(w * 0.9))
        by, bx = (h - bh) // 2, (w - bw) // 2
        try:
            win = stdscr.derwin(bh, bw, by, bx)
        except curses.error:
            return
        win.erase()
        win.box()

        def wput(y, x, text, attr=0, on_border=False):
            in_body = 0 < y < bh - 1
            if in_body or (on_border and 0 <= y < bh):
                try:
                    win.addstr(y, x, _fit(text, bw - x - 1), attr)
                except curses.error:
                    pass

        wput(0, 2, f" Job {job.id} — {job.app_name}/{job.entry_point_id} "
                   f"[{job.username}] ", curses.A_BOLD, on_border=True)
        y = 1
        pairs = [
            ("status", f"{job.status}"
                       + (f" (exit {job.exit_code})" if job.exit_code is not None else "")),
            ("type", job.entry_point_type),
            ("cluster_job_id", job.cluster_job_id or "-"),
            ("created", str(job.created_at or "-")),
            ("status_updated", str(job.status_updated_at or "-")),
            ("started", str(job.started_at or "-")),
            ("finished", str(job.finished_at or "-")),
            ("app_url", job.app_url),
            ("work_dir", job.work_dir or "-"),
            ("script", job.script_path or "-"),
            ("container", job.container or "-"),
            ("conda_env", job.conda_env or "-"),
            ("resources", json.dumps(job.resources) if job.resources else "-"),
        ]
        for k, val in pairs:
            wput(y, 2, f"{k:>15}: {val}")
            y += 1
        if job.command:
            wput(y, 2, f"{'command':>15}: {job.command.splitlines()[0]}")
            y += 1

        wd = v["workdirs"].get(job.id)
        y += 1
        wput(y, 2, "Work directory probe (read as "
                   f"{_username_for_uid(os.getuid())}):", curses.A_BOLD)
        y += 1
        if wd is None:
            wput(y, 4, "not probed yet (active jobs are probed every few seconds)")
            y += 1
        else:
            if wd.error:
                wput(y, 4, f"note: {wd.error}", C_RED)
                y += 1
            for name, (size, mtime) in sorted(wd.files.items()):
                ago = _fmt_dur(time.time() - mtime) if mtime else "-"
                wput(y, 4, f"{name:<14} {_fmt_size(size):>8}  modified {ago} ago")
                y += 1
            extras = []
            if wd.phase:
                extras.append(("phase", wd.phase))
            if wd.service_url:
                extras.append(("service_url", wd.service_url))
            if wd.exit_code_file is not None:
                extras.append(("exit_code file", wd.exit_code_file))
            if wd.job_pid is not None:
                alive = "ALIVE" if wd.pid_alive else "DEAD"
                extras.append(("job.pid", f"{wd.job_pid} ({alive})"))
            for k, val in extras:
                wput(y, 4, f"{k:<14} {val}")
                y += 1
            tail = wd.stderr_tail or wd.stdout_tail
            if tail:
                label = "stderr" if wd.stderr_tail else "stdout"
                y += 1
                wput(y, 2, f"{label} tail:", curses.A_BOLD)
                y += 1
                for line in tail.splitlines()[-(bh - y - 2):]:
                    wput(y, 4, line, C_DIM)
                    y += 1
        wput(bh - 1, 2, " Esc/q/↵ close  o/e/s logs ", curses.A_BOLD, on_border=True)

    def draw_logview(v):
        """Full-screen live tail of the open job file."""
        h, w = stdscr.getmaxyx()
        req = v["log_request"]
        lv = v["log_content"]
        ftype = req[1] if req else "?"
        jid = ui.log_job_id
        job = next((j for j in v["jobs"] if j.id == jid), None)

        title = f" Log viewer — job {jid}"
        if job:
            title += f" [{job.username}] {job.app_name}/{job.entry_point_id}"
        title += f" — {ftype.upper()}"
        put(0, 0, title.ljust(w - 1), curses.A_BOLD | curses.A_REVERSE)
        if job:
            sattr = STATUS_ATTRS.get(job.status, 0) | curses.A_REVERSE
            put(0, min(w - 12, len(title) + 2), f" {job.status} ", sattr)
        if ui.log_follow:
            put(0, max(0, w - 10), " FOLLOW ", C_GREEN | curses.A_REVERSE | curses.A_BOLD)

        body_y, body_h = 2, h - 3
        if lv is None or lv.job_id != jid or lv.file_type != ftype:
            put(1, 0, "loading…", C_DIM)
        elif lv.error:
            put(1, 0, f"{lv.path or ''}", C_DIM)
            put(body_y, 0, lv.error, C_RED | curses.A_BOLD)
        else:
            age = _fmt_dur(time.time() - lv.mtime) if lv.mtime else "-"
            info = (f"{lv.path}   {_fmt_size(lv.size)}, modified {age} ago"
                    f"   refreshed {_fmt_dur(time.time() - lv.fetched_at)} ago")
            if lv.truncated:
                info += f"   [tail only: {_fmt_size(lv.truncated)} earlier omitted]"
            if ui.log_hscroll:
                info += f"   [panned to col {ui.log_hscroll}]"
            put(1, 0, info, C_DIM)

            lines = lv.lines
            max_scroll = max(0, len(lines) - body_h)
            if ui.log_follow:
                ui.log_scroll = max_scroll
            ui.log_scroll = max(0, min(ui.log_scroll, max_scroll))
            for i in range(body_h):
                idx = ui.log_scroll + i
                if idx >= len(lines):
                    break
                line = lines[idx].expandtabs()[ui.log_hscroll:]
                put(body_y + i, 0, line)
            pos = (f" lines {ui.log_scroll + 1}-"
                   f"{min(len(lines), ui.log_scroll + body_h)}/{len(lines)} ")
            put(0, max(0, w - 10 - len(pos) - 1), pos, curses.A_REVERSE)

        put(h - 1, 0,
            (" Esc/q back  j/k ↑↓ scroll  ␣/PgUp/PgDn page  ←/→ pan  "
             "f follow  g/G top/end  o/e/s stdout/stderr/script ").ljust(w - 1),
            curses.A_REVERSE)

    # -- main loop ----------------------------------------------------------
    while True:
        ch = stdscr.getch()
        if not ui.paused or not view:
            view = snapshot()
        rows = _visible_jobs(view["jobs"], ui.show_all)

        if ch != -1:
            import curses as _c

            _LOG_KEYS = {ord("o"): "stdout", ord("e"): "stderr", ord("s"): "script"}

            def _open_log(ftype, job_id=None):
                if job_id is None:
                    if not rows:
                        return
                    idx = max(0, min(ui.selected_idx, len(rows) - 1))
                    job_id = rows[idx].id
                ui.log_open = True
                ui.detail_open = False
                ui.detail_job = None
                ui.log_job_id = job_id
                ui.log_follow = True
                ui.log_scroll = 0
                ui.log_hscroll = 0
                with state.lock:
                    state.log_request = (job_id, ftype)
                    state.log_content = None
                state.log_wake.set()

            def _close_log():
                ui.log_open = False
                ui.log_job_id = None
                with state.lock:
                    state.log_request = None
                    state.log_content = None

            if ui.log_open:
                if ch in (27, ord("q")):
                    _close_log()
                elif ch in _LOG_KEYS:
                    _open_log(_LOG_KEYS[ch], job_id=ui.log_job_id)
                elif ch in (ord("j"), _c.KEY_DOWN):
                    ui.log_scroll += 1
                elif ch in (ord("k"), _c.KEY_UP):
                    ui.log_scroll -= 1
                    ui.log_follow = False
                elif ch in (_c.KEY_NPAGE, ord(" ")):
                    ui.log_scroll += 20
                elif ch == _c.KEY_PPAGE:
                    ui.log_scroll -= 20
                    ui.log_follow = False
                elif ch in (ord("g"), _c.KEY_HOME):
                    ui.log_scroll = 0
                    ui.log_follow = False
                elif ch in (ord("G"), _c.KEY_END):
                    ui.log_follow = True
                elif ch == ord("f"):
                    ui.log_follow = not ui.log_follow
                elif ch in (ord("h"), _c.KEY_LEFT):
                    ui.log_hscroll = max(0, ui.log_hscroll - 20)
                elif ch in (ord("l"), _c.KEY_RIGHT):
                    ui.log_hscroll += 20
                elif ch == ord("0"):
                    ui.log_hscroll = 0
            elif ui.detail_open:
                if ch in (27, ord("q"), ord("\n"), _c.KEY_ENTER, 10, 13):
                    # Re-anchor the table selection to the job we were viewing,
                    # so "close and choose another" starts from where you were.
                    if ui.detail_job is not None:
                        for i, r in enumerate(rows):
                            if r.id == ui.detail_job.id:
                                ui.selected_idx = i
                                break
                    ui.detail_open = False
                    ui.detail_job = None
                elif ch in _LOG_KEYS and ui.detail_job is not None:
                    _open_log(_LOG_KEYS[ch], job_id=ui.detail_job.id)
            elif ch in (ord("q"), 3):
                return
            elif ch in (ord("j"), _c.KEY_DOWN):
                ui.selected_idx += 1
            elif ch in (ord("k"), _c.KEY_UP):
                ui.selected_idx -= 1
            elif ch == _c.KEY_NPAGE:
                ui.selected_idx += 10
            elif ch == _c.KEY_PPAGE:
                ui.selected_idx -= 10
            elif ch in (ord("g"), _c.KEY_HOME):
                ui.selected_idx = 0
            elif ch in (ord("G"), _c.KEY_END):
                ui.selected_idx = len(rows) - 1
            elif ch == ord("a"):
                ui.show_all = not ui.show_all
            elif ch == ord("p"):
                ui.paused = not ui.paused
            elif ch == ord("b"):
                with state.lock:
                    state.crosscheck_enabled = not state.crosscheck_enabled
                    state.crosscheck_last = 0.0
                    enabled = state.crosscheck_enabled
                state.add_event("INFO", f"bjobs cross-check {'enabled' if enabled else 'disabled'}")
            elif ch in _LOG_KEYS:
                _open_log(_LOG_KEYS[ch])
            elif ch in (ord("\n"), _c.KEY_ENTER, 10, 13):
                if rows:
                    idx = max(0, min(ui.selected_idx, len(rows) - 1))
                    ui.detail_job = rows[idx]
                    ui.detail_open = True

        ui.selected_idx = max(0, min(ui.selected_idx, max(0, len(rows) - 1)))
        selected_job = rows[ui.selected_idx] if rows else None

        # Keep the pinned detail job's own data fresh without ever switching
        # to a different job (the table may re-sort underneath the overlay).
        if ui.detail_job is not None:
            fresh = next((j for j in view["jobs"] if j.id == ui.detail_job.id), None)
            if fresh is not None:
                ui.detail_job = fresh

        # Aim the work-dir prober at the job actually being viewed: the log
        # viewer's job, else the pinned detail job, else the table selection.
        if ui.log_open and ui.log_job_id is not None:
            viewed_id = ui.log_job_id
        elif ui.detail_open and ui.detail_job is not None:
            viewed_id = ui.detail_job.id
        else:
            viewed_id = selected_job.id if selected_job else None
        with state.lock:
            state.selected_job_id = viewed_id

        stdscr.erase()
        h, w = stdscr.getmaxyx()
        if h < 15 or w < 70:
            put(0, 0, "Terminal too small for fileglancer debug (need ≥ 70x15).")
            stdscr.refresh()
            continue

        if ui.log_open:
            draw_logview(view)
            stdscr.refresh()
            continue

        body = h - 3  # header 2 + footer 1
        jobs_h = max(5, min(len(rows) + 2, max(5, int(body * 0.40))))
        procs_rows = len(view["servers"]) + len(view["workers"])
        mid_h = max(4, min(max(procs_rows, 4) + 1, max(4, int(body * 0.30))))
        events_h = body - jobs_h - mid_h
        if events_h < 4:
            events_h = 4
            mid_h = max(4, body - jobs_h - events_h)

        draw_header(view)
        y = 2
        draw_jobs(view, y, jobs_h, rows)
        y += jobs_h
        split_x = max(50, int(w * 0.5))
        draw_procs(view, y, mid_h, split_x - 1)
        draw_sched(view, y, mid_h, split_x)
        y += mid_h
        draw_events(view, y, events_h)
        draw_footer()

        if ui.detail_open and ui.detail_job is not None:
            draw_detail(view, ui.detail_job)

        stdscr.refresh()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _resolve_db_url(cli_db_url: Optional[str], settings) -> str:
    """Pick the database like the rest of the CLI does.

    Priority: --db-url flag > configured value (env/config.yaml) > a
    fileglancer.db in the current directory > the standard CLI location
    (~/.local/share/fileglancer/fileglancer.db, used by ``fileglancer start``).
    """
    if cli_db_url:
        return cli_db_url
    default = "sqlite:///fileglancer.db"
    if settings.db_url != default:
        return settings.db_url
    if Path("fileglancer.db").exists():
        return default
    cli_db = Path.home() / ".local" / "share" / "fileglancer" / "fileglancer.db"
    if cli_db.exists():
        return f"sqlite:///{cli_db}"
    return default


def run_debug(db_url: Optional[str] = None,
              refresh: float = 1.0,
              poll_lock_path: Optional[str] = None,
              show_all: bool = False,
              log_file: Optional[str] = None):
    """Load settings, start the collector threads, and run the curses UI."""
    try:
        import curses  # noqa: F401  (fail early on unsupported platforms)
    except ImportError:
        print("fileglancer debug requires a POSIX terminal (curses).", file=sys.stderr)
        sys.exit(1)

    # Silence loguru (sqlalchemy/database modules log through it) so nothing
    # writes to the terminal underneath curses.
    try:
        from loguru import logger
        logger.remove()
    except Exception:
        pass

    from fileglancer.settings import get_settings
    settings = get_settings()

    resolved_db_url = _resolve_db_url(db_url, settings)
    lock_path = poll_lock_path or os.path.join(tempfile.gettempdir(), POLL_LOCK_FILENAME)

    # Credentials never reach the display or the --log file; only the
    # connection itself uses the raw URL.
    redacted_db_url = _redact_db_url(resolved_db_url)
    db_display = redacted_db_url
    if len(db_display) > 60:
        db_display = "…" + db_display[-59:]
    meta = {
        "db_display": db_display,
        "executor": settings.cluster.executor,
        "poll_interval": settings.cluster.poll_interval,
    }

    state = SharedState(event_log_path=log_file)
    state.add_event("INFO", f"watching db {redacted_db_url}")
    state.add_event("INFO", f"poll lock: {lock_path}")

    threads = [
        threading.Thread(target=_db_collector, args=(state, resolved_db_url, refresh),
                         name="db-collector", daemon=True),
        threading.Thread(target=_proc_collector, args=(state, lock_path, 0.5),
                         name="proc-collector", daemon=True),
        threading.Thread(target=_workdir_collector, args=(state, 3.0),
                         name="workdir-collector", daemon=True),
        threading.Thread(target=_log_collector, args=(state, 1.0),
                         name="log-collector", daemon=True),
        threading.Thread(target=_crosscheck_collector,
                         args=(state, settings.cluster.executor,
                               max(settings.cluster.poll_interval, 10.0)),
                         name="crosscheck-collector", daemon=True),
    ]
    for t in threads:
        t.start()

    ui = UIContext(show_all=show_all)
    import curses
    try:
        curses.wrapper(_run_ui, state, ui, meta)
    finally:
        state.stop.set()


def main(argv: Optional[list[str]] = None):
    """Entry point for ``python -m fileglancer.debug``."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="fileglancer debug",
        description="Real-time TUI for watching Fileglancer job polling, "
                    "user workers, and scheduler activity.",
    )
    parser.add_argument("--db-url", default=None,
                        help="Database URL (defaults to the configured/standard location)")
    parser.add_argument("--refresh", type=float, default=1.0,
                        help="Database refresh interval in seconds (default: 1)")
    parser.add_argument("--poll-lock", default=None,
                        help="Path to the poll lock file if the server uses a non-default TMPDIR")
    parser.add_argument("--all-jobs", action="store_true",
                        help="Start with terminal jobs shown as well as active ones")
    parser.add_argument("--log", default=None, metavar="FILE",
                        help="Also append the event feed to FILE for later analysis")
    args = parser.parse_args(argv)
    run_debug(db_url=args.db_url, refresh=args.refresh,
              poll_lock_path=args.poll_lock, show_all=args.all_jobs,
              log_file=args.log)


if __name__ == "__main__":
    main()
