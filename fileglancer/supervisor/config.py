"""Supervisor configuration: CLI flags with FGS_* environment equivalents.

Standard library only (see package docstring).
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field


@dataclass
class SupervisorConfig:
    socket_path: str = "/run/fileglancer/supervisor.sock"
    socket_group: str | None = None
    unprivileged: bool = False
    workers_per_user: int = 1
    max_workers: int = 50
    idle_timeout: float = 300.0
    lease_max_seconds: float = 1200.0
    spawn_rate: int = 20  # spawns per minute per client connection
    min_uid: int = 1000
    user_regex: str = r"^[A-Za-z0-9._@-]+$"
    allowed_groups: list[str] = field(default_factory=list)
    denied_shells: list[str] = field(default_factory=lambda: ["/sbin/nologin", "/bin/false"])
    env_passthrough: list[str] = field(default_factory=list)
    worker_python: str = sys.executable
    log_level: str = "INFO"
    log_format: str = "text"


def _env(name: str, default):
    return os.environ.get(name, default)


def build_parser() -> argparse.ArgumentParser:
    d = SupervisorConfig()
    p = argparse.ArgumentParser(
        prog="fileglancer-supervisor",
        description="Privileged supervisor spawning per-user Fileglancer workers.",
    )
    p.add_argument("command", nargs="?", default="run", choices=["run", "status"],
                   help="run the supervisor (default), or query a running one")
    p.add_argument("--socket", default=_env("FGS_SOCKET", d.socket_path),
                   help="unix socket path to listen on")
    p.add_argument("--socket-group", default=_env("FGS_SOCKET_GROUP", None),
                   help="chown the socket to this group, mode 0660 "
                        "(required in privileged mode)")
    p.add_argument("--unprivileged", action="store_true",
                   default=os.geteuid() != 0,
                   help="skip setuid; workers run as the supervisor's own uid "
                        "(default when not root)")
    p.add_argument("--workers-per-user", type=int,
                   default=int(_env("FGS_WORKERS_PER_USER", d.workers_per_user)))
    p.add_argument("--max-workers", type=int,
                   default=int(_env("FGS_MAX_WORKERS", d.max_workers)))
    p.add_argument("--idle-timeout", type=float,
                   default=float(_env("FGS_IDLE_TIMEOUT", d.idle_timeout)))
    p.add_argument("--lease-max-seconds", type=float,
                   default=float(_env("FGS_LEASE_MAX_SECONDS", d.lease_max_seconds)))
    p.add_argument("--spawn-rate", default=_env("FGS_SPAWN_RATE", str(d.spawn_rate)),
                   help="max spawns per minute per client connection, e.g. '20' or '20/min'")
    p.add_argument("--min-uid", type=int, default=int(_env("FGS_MIN_UID", d.min_uid)))
    p.add_argument("--user-regex", default=_env("FGS_USER_REGEX", d.user_regex))
    p.add_argument("--allowed-group", action="append", default=None,
                   help="user must belong to at least one (repeatable)")
    p.add_argument("--denied-shell", action="append", default=None,
                   help="refuse users with this login shell (repeatable; "
                        "default /sbin/nologin and /bin/false)")
    p.add_argument("--env-passthrough", action="append", default=None,
                   help="extra env name (exact) or prefix (ending in _) to pass "
                        "to workers (repeatable); FGC_* is never passed")
    p.add_argument("--worker-python", default=_env("FGS_WORKER_PYTHON", d.worker_python))
    p.add_argument("--log-level", default=_env("FGS_LOG_LEVEL", d.log_level))
    p.add_argument("--log-format", choices=["text", "json"],
                   default=_env("FGS_LOG_FORMAT", d.log_format))
    p.add_argument("--json", action="store_true",
                   help="status only: print the raw JSON payload")
    return p


def config_from_args(args: argparse.Namespace) -> SupervisorConfig:
    d = SupervisorConfig()
    spawn_rate = str(args.spawn_rate).split("/", 1)[0]  # accept '20' or '20/min'
    return SupervisorConfig(
        socket_path=args.socket,
        socket_group=args.socket_group,
        unprivileged=args.unprivileged,
        workers_per_user=args.workers_per_user,
        max_workers=args.max_workers,
        idle_timeout=args.idle_timeout,
        lease_max_seconds=args.lease_max_seconds,
        spawn_rate=int(spawn_rate),
        min_uid=args.min_uid,
        user_regex=args.user_regex,
        allowed_groups=args.allowed_group or [],
        denied_shells=args.denied_shell or d.denied_shells,
        env_passthrough=args.env_passthrough or [],
        worker_python=args.worker_python,
        log_level=args.log_level,
        log_format=args.log_format,
    )
