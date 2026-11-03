"""Wire framing shared by the supervisor, the web-app client and workers.

Messages are length-prefixed JSON frames: 4-byte big-endian length + JSON
body. File descriptors travel as SCM_RIGHTS ancillary data attached to the
first sendmsg of a frame, so every receive uses recvmsg from the first byte.

Standard library only (see package docstring).
"""

from __future__ import annotations

import array
import json
import os
import socket
import struct
from typing import Optional

HEADER_FMT = "!I"
HEADER_SIZE = struct.calcsize(HEADER_FMT)
MAX_MESSAGE_SIZE = 64 * 1024 * 1024  # 64 MB safety limit


class ProtocolError(Exception):
    """A frame that violates the protocol (e.g. oversized length)."""


def send_msg(sock: socket.socket, msg: dict, fd: Optional[int] = None) -> None:
    """Send one length-prefixed JSON frame, optionally with one fd."""
    payload = json.dumps(msg, default=str).encode()
    frame = struct.pack(HEADER_FMT, len(payload)) + payload
    if fd is None:
        sock.sendall(frame)
        return
    fds = array.array("i", [fd])
    sent = sock.sendmsg([frame], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, fds)])
    # The ancillary data went with the first sendmsg; push any remainder plainly.
    if sent < len(frame):
        sock.sendall(frame[sent:])


def recv_msg(sock: socket.socket) -> tuple[Optional[dict], list[int]]:
    """Receive one frame, capturing any SCM_RIGHTS file descriptors.

    Returns (message, fds). message is None on a clean EOF before any bytes
    (fds is then empty). Raises ConnectionError on EOF mid-frame and
    ProtocolError on an oversized frame; received fds are closed before either
    is raised, so callers never leak descriptors on the error path.
    """
    fds: array.array = array.array("i")

    def _collect(ancdata):
        for cmsg_level, cmsg_type, cmsg_data in ancdata:
            if cmsg_level == socket.SOL_SOCKET and cmsg_type == socket.SCM_RIGHTS:
                fds.frombytes(cmsg_data[: len(cmsg_data) - (len(cmsg_data) % fds.itemsize)])

    # Read exactly one frame and no more: messages can be pipelined on one
    # socket (e.g. the worker control channel), so over-reading would swallow
    # the next frame.
    raw = b""
    try:
        while len(raw) < HEADER_SIZE:
            chunk, ancdata, _flags, _addr = sock.recvmsg(
                HEADER_SIZE - len(raw),
                socket.CMSG_LEN(struct.calcsize("i")),
            )
            _collect(ancdata)
            if not chunk:
                if raw:
                    raise ConnectionError("Peer closed connection mid-frame")
                return None, list(fds)
            raw += chunk

        (length,) = struct.unpack(HEADER_FMT, raw[:HEADER_SIZE])
        if length > MAX_MESSAGE_SIZE:
            raise ProtocolError(f"Frame too large: {length} bytes")

        total = HEADER_SIZE + length
        while len(raw) < total:
            chunk, ancdata, _flags, _addr = sock.recvmsg(
                total - len(raw),
                socket.CMSG_LEN(struct.calcsize("i")),
            )
            _collect(ancdata)
            if not chunk:
                raise ConnectionError("Peer closed connection mid-frame")
            raw += chunk

        return json.loads(raw[HEADER_SIZE:total]), list(fds)
    except Exception:
        for fd in fds:
            try:
                os.close(fd)
            except OSError:
                pass
        raise
