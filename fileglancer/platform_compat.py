"""Small cross-platform helpers for optional OS-specific functionality.

This module keeps platform-only imports (``fcntl``, ``msvcrt``, ``pwd``,
``grp``) out of application modules so type checkers can analyze the project
for all supported platforms without pretending those modules always exist.
"""

from __future__ import annotations

import importlib
import os
from collections.abc import Callable
from pathlib import Path
from types import TracebackType
from typing import Any, cast


def optional_module(module_name: str) -> Any:
    """Return an imported module, or ``None`` when it is unavailable."""
    try:
        return importlib.import_module(module_name)
    except ImportError:
        return None


def _optional_os_int(fn_name: str) -> int | None:
    fn = getattr(os, fn_name, None)
    if not callable(fn):
        return None
    get_value = cast(Callable[[], int], fn)
    return get_value()


def current_uid() -> int | None:
    """Return the current real uid when the platform exposes one."""
    return _optional_os_int("getuid")


def effective_uid() -> int | None:
    """Return the current effective uid when the platform exposes one."""
    return _optional_os_int("geteuid")


def current_gid() -> int | None:
    """Return the current real gid when the platform exposes one."""
    return _optional_os_int("getgid")


def group_ids_for_user(username: str, primary_gid: int) -> list[int]:
    """Return group IDs for *username* using platform support if available."""
    getgrouplist = getattr(os, "getgrouplist", None)
    if not callable(getgrouplist):
        raise RuntimeError("os.getgrouplist is not available on this platform")
    get_groups = cast(Callable[[str, int], list[int]], getgrouplist)
    return get_groups(username, primary_gid)


class FileLockUnavailable(OSError):
    """Raised when a non-blocking file lock cannot be acquired."""


class FileLock:
    """A non-blocking exclusive file lock backed by portalocker."""

    def __init__(self, path: str | os.PathLike[str]) -> None:
        self.path = Path(path)
        self._lock: Any | None = None

    def __enter__(self) -> FileLock:
        self.acquire()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.release()

    def acquire(self) -> None:
        if self._lock is not None:
            return

        import portalocker
        from portalocker import exceptions as portalocker_exceptions

        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = portalocker.Lock(str(self.path), mode="a+", timeout=0)
        try:
            lock.acquire()
        except portalocker_exceptions.LockException as e:
            raise FileLockUnavailable(str(e)) from e

        self._lock = lock

    def release(self) -> None:
        lock = self._lock
        if lock is None:
            return
        self._lock = None
        lock.release()


def effective_user_home() -> str:
    """Return the effective user's home directory.

    On POSIX this uses ``geteuid`` plus the passwd database so it keeps working
    when a process changes effective UID but the ``HOME`` environment variable
    still points at the original user.  On platforms without ``pwd``, it falls
    back to normal ``~`` expansion.
    """

    if os.name == "posix":
        pwd = optional_module("pwd")
        uid = effective_uid()
        if pwd is not None and uid is not None:
            try:
                return str(pwd.getpwuid(uid).pw_dir)
            except KeyError:
                pass

    return os.path.expanduser("~")


def named_user_home(username: str) -> str:
    """Return a named user's home directory when the platform can resolve it."""

    if os.name == "posix":
        pwd = optional_module("pwd")
        if pwd is not None:
            try:
                return str(pwd.getpwnam(username).pw_dir)
            except KeyError as e:
                raise RuntimeError(f"Unknown user: {username}") from e

    expanded = os.path.expanduser(f"~{username}")
    if expanded.startswith("~"):
        raise RuntimeError(
            f"Cannot resolve home directory for user {username!r} on this platform"
        )
    return expanded


def user_home(username: str | None = None) -> str:
    """Return the current or named user's home directory."""
    return named_user_home(username) if username else effective_user_home()


def username_for_uid(uid: int) -> str:
    """Return a username for *uid*, or the uid string when unavailable."""
    if os.name == "posix":
        pwd = optional_module("pwd")
        if pwd is not None:
            try:
                return str(pwd.getpwuid(uid).pw_name)
            except KeyError:
                pass
    return str(uid)
