"""Worker process spawning: identity, environment allowlist, Popen.

Standard library only (see package docstring).
"""

from __future__ import annotations

import os
import pwd
import socket
import subprocess
import sys
from typing import Optional

# Worker env is an allowlist, not a denylist: workers run as the (untrusted)
# target user, so anything in their environment is readable by that user via
# /proc/<pid>/environ. Only pass variables the worker legitimately needs (git,
# ssh, locale, tmp, the scheduler, environment modules, conda/pixi, containers)
# so no server secret leaks — not Fileglancer's own FGC_* vars, and not generic
# deployment secrets like AWS_SECRET_ACCESS_KEY or GITHUB_TOKEN. Site-specific
# additions go through the supervisor's --env-passthrough, not code.
WORKER_ENV_ALLOW_NAMES = frozenset({
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "PWD",
    "LANG", "LANGUAGE", "TZ", "TERM",
    "TMPDIR", "TMP", "TEMP",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "no_proxy",
    "SSH_AUTH_SOCK",
    # Needed for the worker's own imports under path-based installs (not a
    # secret); harmless when unused (site-packages installs don't rely on it).
    "PYTHONPATH", "VIRTUAL_ENV",
})
WORKER_ENV_ALLOW_PREFIXES = (
    "LC_",                          # locale
    "LSF_", "LSB_", "EGO_",         # IBM Spectrum LSF
    "SLURM_",                       # Slurm
    "SGE_", "PBS_",                 # SGE / PBS / Torque
    "MODULE", "MODULES_", "LMOD_",  # environment modules
    "CONDA_", "MAMBA_", "PIXI_",    # conda / pixi
    "APPTAINER_", "SINGULARITY_",   # containers
    "GIT_",                         # git config via env (not secrets by convention)
)


def build_worker_env(base_env: dict, home_dir: str, log_level: str,
                     child_fd: int, passthrough: Optional[list] = None,
                     log_format: str = "text",
                     worker_mode: Optional[str] = None) -> dict:
    """Build the environment for a worker subprocess (allowlist).

    Keeps only allowlisted variables (see the module constants) plus any
    operator-configured ``passthrough`` names/prefixes, then always sets the
    operational vars the worker itself needs. FGC_* is dropped
    unconditionally — even if an operator lists it in passthrough — so
    Fileglancer secrets (session key, Okta/Atlassian secrets, DB URL) can never
    reach the user. The worker gets its config over the IPC socket instead (DB
    data is attached to the request by the parent).

    A passthrough entry ending in ``_`` is treated as a prefix; otherwise it is
    an exact variable name.
    """
    extra_names = {p for p in (passthrough or []) if not p.endswith("_")}
    extra_prefixes = tuple(p for p in (passthrough or []) if p.endswith("_"))
    allow_names = WORKER_ENV_ALLOW_NAMES | extra_names
    allow_prefixes = WORKER_ENV_ALLOW_PREFIXES + extra_prefixes

    def _allowed(key: str) -> bool:
        if key.upper().startswith("FGC_"):
            return False  # never leak Fileglancer secrets
        return key in allow_names or key.startswith(allow_prefixes)

    env = {k: v for k, v in base_env.items() if _allowed(k)}
    env["HOME"] = home_dir
    env["FGC_LOG_LEVEL"] = log_level
    env["FGC_LOG_FORMAT"] = log_format
    env["FGC_WORKER_FD"] = str(child_fd)
    if worker_mode:
        env["FGC_WORKER_MODE"] = worker_mode
    return env


def _identity(username: str, privileged: bool) -> tuple[dict, str, int]:
    """(Popen identity kwargs, home dir, uid) for a child running as ``username``."""
    if not privileged:
        return {}, os.path.expanduser("~"), os.getuid()
    pw = pwd.getpwnam(username)
    groups = os.getgrouplist(username, pw.pw_gid)
    return ({"user": pw.pw_uid, "group": pw.pw_gid, "extra_groups": groups,
             "cwd": pw.pw_dir}, pw.pw_dir, pw.pw_uid)


def spawn_worker(username: str, *, privileged: bool,
                 env_passthrough: Optional[list] = None,
                 log_level: str = "INFO", log_format: str = "text",
                 worker_python: str = sys.executable,
                 worker_mode: Optional[str] = None,
                 ) -> tuple[subprocess.Popen, socket.socket, int]:
    """Spawn one worker and return (process, control socket, uid).

    With ``privileged`` the worker runs with the target user's uid/gid/groups
    (set at fork time via Popen kwargs) and that user's home; otherwise it runs
    as the current process's user. The returned socket is the parent's end of
    the control socketpair; the child's end is already closed here.
    """
    identity_kwargs, home_dir, uid = _identity(username, privileged)

    parent_sock, child_sock = socket.socketpair()
    try:
        env = build_worker_env(
            os.environ, home_dir, log_level, child_sock.fileno(),
            passthrough=env_passthrough, log_format=log_format,
            worker_mode=worker_mode,
        )
        process = subprocess.Popen(
            [worker_python, "-m", "fileglancer.user_worker"],
            env=env,
            pass_fds=(child_sock.fileno(),),
            stderr=subprocess.PIPE,
            **identity_kwargs,
        )
    except Exception:
        parent_sock.close()
        raise
    finally:
        child_sock.close()

    parent_sock.setblocking(True)
    return process, parent_sock, uid


DATASERVER_HEADER = "X-Fg-Resolved-Path"


def spawn_dataserver(username: str, listen_fd: int, *, privileged: bool,
                     env_passthrough: Optional[list] = None,
                     log_level: str = "INFO", log_format: str = "text",
                     worker_python: str = sys.executable,
                     ) -> tuple[subprocess.Popen, int]:
    """Spawn one zarrbridge data server on an already-listening socket.

    Same identity and environment rules as ``spawn_worker``. The supervisor
    binds the socket (so it controls the path and permissions) and the child
    only serves on it. ``--allow-prefix /`` is deliberate: the process runs as
    the user, so the uid is the containment, and the trusted-path header is
    only ever set by the web app after it resolved the path inside a share.
    """
    identity_kwargs, home_dir, uid = _identity(username, privileged)
    env = build_worker_env(os.environ, home_dir, log_level, listen_fd,
                           passthrough=env_passthrough, log_format=log_format)
    process = subprocess.Popen(
        [worker_python, "-m", "zarrbridge", "--log-format", log_format,
         "serve", "--fd", str(listen_fd),
         "--trusted-path-header", DATASERVER_HEADER,
         "--allow-prefix", "/", "--no-browse", "--build-auto", "on"],
        env=env,
        pass_fds=(listen_fd,),
        stderr=subprocess.PIPE,
        **identity_kwargs,
    )
    return process, uid
