"""CLI entry point: run the supervisor, or query a running one.

Standard library only (see package docstring).
"""

from __future__ import annotations

import json
import socket
import sys

from fileglancer.supervisor.config import build_parser, config_from_args
from fileglancer.supervisor.protocol import recv_msg, send_msg


def _status(socket_path: str, as_json: bool) -> int:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(socket_path)
    except OSError as e:
        print(f"cannot connect to {socket_path}: {e}", file=sys.stderr)
        return 1
    try:
        send_msg(sock, {"op": "status"})
        status, _fds = recv_msg(sock)
    finally:
        sock.close()
    if status is None:
        print("supervisor closed the connection", file=sys.stderr)
        return 1
    if as_json:
        print(json.dumps(status, indent=2))
        return 0
    print(f"privileged: {status['privileged']}  "
          f"leases: {status['leases']}  spawns_total: {status['spawns_total']}")
    print(f"limits: {status['limits']}")
    for w in status["workers"]:
        print(f"  {w['user']:<16} pid={w['pid']:<8} {w['state']:<6} "
              f"lease={w['lease'] or '-':<10} idle_for={w['idle_for']}s age={w['age']}s")
    for d in status.get("dataservers", []):
        print(f"  {d['user']:<16} pid={d['pid']:<8} dataserver "
              f"idle_for={d['idle_for']}s age={d['age']}s {d['socket']}")
    for user, n in status["queued"].items():
        print(f"  queued: {user} x{n}")
    return 0


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "status":
        sys.exit(_status(args.socket, args.json))
    from fileglancer.supervisor.server import Supervisor
    Supervisor(config_from_args(args)).run()


if __name__ == "__main__":
    main()
