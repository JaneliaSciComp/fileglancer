"""
A module that provides a simple interface for interacting with a file system,
rooted at a specific directory.
"""

import os
import stat
import pwd
import grp
import shutil

from pydantic import BaseModel
from typing import Optional, Generator
from loguru import logger

from .database import find_fsp_from_absolute_path
from .model import FileSharePath
from .utils import is_likely_binary

# Default buffer size for streaming file contents
DEFAULT_BUFFER_SIZE = 8192


class RootCheckError(ValueError):
    """
    Raised when a path attempts to escape the root directory of a Filestore.
    This exception signals that the path may be an absolute path that belongs
    to a different file share and should trigger fsp resolution logic.
    """
    def __init__(self, message: str, full_path: str):
        super().__init__(message)
        self.full_path = full_path

class FileInfo(BaseModel):
    """
    A class that represents a file or directory in a Filestore.
    """
    name: str
    path: Optional[str] = None
    absolute_path: Optional[str] = None
    size: int
    is_dir: bool
    permissions: str
    owner: Optional[str] = None
    group: Optional[str] = None
    last_modified: Optional[float] = None
    hasRead: Optional[bool] = None
    hasWrite: Optional[bool] = None
    is_symlink: bool = False
    symlink_target_fsp: Optional[dict] = None  # {"fsp_name": str, "subpath": str}

    @staticmethod
    def _safe_readlink(path: str, root_path: Optional[str] = None) -> Optional[str]:
        """
        Safely read a symlink target.

        This wrapper centralizes symlink reading with defense-in-depth validation.
        When root_path is provided, verifies the symlink's parent directory is
        within the allowed root before calling os.readlink(). This check uses
        the parent directory (not realpath of the symlink itself) because
        realpath would resolve the symlink to its target, which may legitimately
        be outside root for cross-share symlinks.
        """
        try:
            if root_path is not None:
                root_real = os.path.realpath(root_path)
                # Check the symlink's parent directory is within root
                # (don't resolve the symlink itself - that would check the target)
                parent_real = os.path.realpath(os.path.dirname(path))
                if not (parent_real == root_real or parent_real.startswith(root_real + os.sep)):
                    logger.warning(f"Refusing to read symlink outside root: {path}")
                    return None
            return os.readlink(path)
        except OSError as e:
            logger.warning(f"Failed to read symlink target for {path}: {e}")
            return None

    @classmethod
    def _get_symlink_target_fsp(cls, absolute_path: str, is_symlink: bool, session,
                                root_path: Optional[str]) -> Optional[dict]:
        """
        Resolve a symlink target to a file share path.

        Returns a dict with fsp_name and subpath if the target is in a known file share,
        or None if not a symlink, target not found, or target not in any file share.
        """
        if not is_symlink or session is None:
            return None

        # Read the symlink target safely
        target = cls._safe_readlink(absolute_path, root_path=root_path)
        if target is None:
            return None

        # Resolve to absolute path (relative symlinks need dirname context)
        if not os.path.isabs(target):
            target = os.path.join(os.path.dirname(absolute_path), target)
        target = os.path.abspath(target)

        # Try to find which file share contains this target
        try:
            match = find_fsp_from_absolute_path(session, target)
            if match:
                fsp, subpath = match

                # Reconstruct the canonical target path from the file share root
                # and the returned subpath so we only operate within managed roots.
                if subpath:
                    validated_target = os.path.realpath(os.path.join(fsp.path, subpath))
                else:
                    validated_target = os.path.realpath(fsp.path)

                # Check if the symlink target actually exists within the resolved location.
                # If it doesn't exist, return None (broken symlink)
                if not os.path.exists(validated_target):
                    return None

                return {"fsp_name": fsp.name, "subpath": subpath}
        except (FileNotFoundError, PermissionError, OSError):
            # Target doesn't exist or isn't accessible
            pass

        return None

    @classmethod
    def from_stat(cls, path: str, absolute_path: str,
                  lstat_result: os.stat_result, stat_result: os.stat_result,
                  current_user: str = None, session = None,
                  root_path: Optional[str] = None):
        """
        Create FileInfo from pre-computed stat results.

        Args:
            path: Relative path within the filestore.
            absolute_path: Absolute filesystem path (used for basename and symlink resolution).
            lstat_result: Result of os.lstat() on the path (detects symlinks).
            stat_result: Result of os.stat() or lstat for broken symlinks.
            current_user: Username for permission checking (optional).
            session: Database session for symlink resolution (optional).
            root_path: Filestore root for defense-in-depth validation in symlink reading (optional).
        """
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")

        is_symlink = stat.S_ISLNK(lstat_result.st_mode)
        is_dir = stat.S_ISDIR(stat_result.st_mode)
        size = 0 if is_dir else stat_result.st_size
        # Do not expose the name of the root directory
        name = '' if path == '.' else os.path.basename(absolute_path)
        permissions = stat.filemode(stat_result.st_mode)
        last_modified = stat_result.st_mtime

        try:
            owner = pwd.getpwuid(stat_result.st_uid).pw_name
        except KeyError:
            # If the user ID is not found, use the user ID as the owner
            owner = str(stat_result.st_uid)

        try:
            group = grp.getgrgid(stat_result.st_gid).gr_name
        except KeyError:
            # If the group ID is not found, use the group ID as the group
            group = str(stat_result.st_gid)

        # Calculate read/write permissions for current user
        hasRead = None
        hasWrite = None
        if current_user is not None:
            hasRead = cls._has_read_permission(stat_result, current_user, owner, group)
            hasWrite = cls._has_write_permission(stat_result, current_user, owner, group)

        # Resolve symlink target to file share path if applicable
        symlink_target_fsp = cls._get_symlink_target_fsp(absolute_path, is_symlink, session, root_path)

        return cls(
            name=name,
            path=path,
            absolute_path=absolute_path,
            size=size,
            is_dir=is_dir,
            permissions=permissions,
            owner=owner,
            group=group,
            last_modified=last_modified,
            hasRead=hasRead,
            hasWrite=hasWrite,
            is_symlink=is_symlink,
            symlink_target_fsp=symlink_target_fsp
        )

    @staticmethod
    def _has_read_permission(stat_result: os.stat_result, current_user: str, owner: str, group: str) -> bool:
        """Check if current user has read permission"""
        mode = stat_result.st_mode

        # Check owner permissions
        if current_user == owner:
            return bool(mode & stat.S_IRUSR)

        # Check group permissions
        try:
            user_groups = [g.gr_name for g in grp.getgrall() if current_user in g.gr_mem]
            # Also add user's primary group
            try:
                primary_gid = pwd.getpwnam(current_user).pw_gid
                primary_group = grp.getgrgid(primary_gid).gr_name
                user_groups.append(primary_group)
            except (KeyError, OSError):
                pass

            if group in user_groups:
                return bool(mode & stat.S_IRGRP)
        except (KeyError, OSError):
            pass

        # Check other permissions
        return bool(mode & stat.S_IROTH)

    @staticmethod
    def _has_write_permission(stat_result: os.stat_result, current_user: str, owner: str, group: str) -> bool:
        """Check if current user has write permission"""
        mode = stat_result.st_mode

        # Check owner permissions
        if current_user == owner:
            return bool(mode & stat.S_IWUSR)

        # Check group permissions
        try:
            user_groups = [g.gr_name for g in grp.getgrall() if current_user in g.gr_mem]
            # Also add user's primary group
            try:
                primary_gid = pwd.getpwnam(current_user).pw_gid
                primary_group = grp.getgrgid(primary_gid).gr_name
                user_groups.append(primary_group)
            except (KeyError, OSError):
                pass

            if group in user_groups:
                return bool(mode & stat.S_IWGRP)
        except (KeyError, OSError):
            pass

        # Check other permissions
        return bool(mode & stat.S_IWOTH)


class Filestore:
    """
    A class that provides a simple interface for interacting with a file system,
    rooted at a specific directory.
    """

    def __init__(self, file_share_path: FileSharePath):
        """
        Create a Filestore with the given root path.
        Expands ~ to the current user's home directory if present.
        """
        # Expand ~/ to the user's home directory (within user context)
        expanded_path = os.path.expanduser(file_share_path.mount_path)
        # Use realpath to resolve symlinks for consistent path operations (e.g., /var -> /private/var on macOS)
        self.root_path = os.path.realpath(expanded_path)


    def _check_path_in_root(self, path: Optional[str]) -> str:
        """
        Check if a path is within the root directory and return the full path.

        Args:
            path (str): The relative path to check.

        Returns:
            str: The full path to the file or directory.

        Raises:
            RootCheckError: If path attempts to escape root directory
        """
        if path is None or path == "":
            full_path = self.root_path
        else:
            # Resolve symlinks and normalize the path
            full_path = os.path.realpath(os.path.join(self.root_path, path))
            root_real = os.path.realpath(self.root_path)

            # Ensure the resolved path is within the resolved root
            if not full_path.startswith(root_real + os.sep) and full_path != root_real:
                raise RootCheckError(f"Path ({full_path}) attempts to escape root directory ({root_real})", full_path)
        return full_path


    def _get_file_info_from_path(self, full_path: str, current_user: str = None, session = None) -> FileInfo:
        """
        Get the FileInfo for a file or directory at the given path.

        full_path comes from either:
        1. _check_path_in_root() which validates user input against the root
        2. os.path.join(verified_directory, entry) where entry is from os.listdir()

        In both cases, the path has been validated or constructed from validated
        components. We pass full_path (not realpath) to from_stat so that lstat()
        can detect symlinks. Symlink targets may be outside the root (cross-fileshare
        symlinks), which is valid - we detect and report them without following.

        All filesystem I/O (lstat/stat) is performed here rather than in
        FileInfo.from_stat so that path validation and I/O are in the same
        method, which allows static analysis tools (CodeQL) to see that the
        path is sanitized before use.
        """
        root_real = os.path.realpath(self.root_path)

        # Defense-in-depth: normalize full_path with abspath (resolves ".."
        # without following symlinks) and verify it is within root before any
        # filesystem operations. We use abspath (not realpath) because symlinks
        # may legitimately point to targets outside root for cross-share links.
        full_path = os.path.abspath(full_path)

        def _is_within_root(p: str) -> bool:
            return p == root_real or p.startswith(root_real + os.sep)

        # Check the normalized path string is under root (catches .. traversal)
        if not _is_within_root(full_path):
            raise RootCheckError(
                f"Path ({full_path}) is outside root directory ({root_real})",
                full_path,
            )

        # Check the resolved parent is under root (catches symlink-based traversal
        # e.g. /root/data/symlink_to_etc/passwd where symlink_to_etc -> /etc)
        # Skip when full_path is the root itself, since root's parent is above root.
        if full_path != root_real:
            parent_real = os.path.realpath(os.path.dirname(full_path))
            if not _is_within_root(parent_real):
                raise RootCheckError(
                    f"Path ({full_path}) resolves outside root directory ({root_real})",
                    full_path,
                )

        full_real = os.path.realpath(full_path)
        if full_real == root_real:
            rel_path = '.'
        else:
            rel_path = os.path.relpath(full_real, root_real)

        # Perform all filesystem stat calls here, after validation.
        lstat_result = os.lstat(full_path)
        is_symlink = stat.S_ISLNK(lstat_result.st_mode)
        if is_symlink:
            try:
                stat_result = os.stat(full_path)
            except (FileNotFoundError, PermissionError, OSError) as e:
                logger.warning(f"Broken symlink detected: {full_path}: {e}")
                stat_result = lstat_result
        else:
            stat_result = os.stat(full_path)

        return FileInfo.from_stat(
            rel_path, full_path, lstat_result, stat_result,
            current_user=current_user, session=session,
            root_path=self.root_path,
        )


    def get_root_path(self) -> str:
        """
        Get the root path of the Filestore.
        """
        return self.root_path


    def get_absolute_path(self, relative_path: Optional[str] = None) -> str:
        """
        Get the absolute path of the Filestore.

        Args:
            relative_path (str): The relative path to the file or directory to get the absolute path for.
                May be None, in which case the root path is returned.

        Returns:
            str: The absolute path of the Filestore.
        """
        if relative_path is None or relative_path == "":
            return self.root_path
        return os.path.abspath(os.path.join(self.root_path, relative_path))


    def get_file_info(self, path: Optional[str] = None, current_user: str = None, session = None) -> FileInfo:
        """
        Get the FileInfo for a file or directory at the given path.

        Args:
            path (str): The relative path to the file or directory to get the FileInfo for.
                May be None, in which case the root directory is used.
            current_user (str): The username of the current user for permission checking.
                May be None, in which case hasRead and hasWrite will be None.
            session: Database session for symlink resolution.
                May be None, in which case symlink_target_fsp will be None.

        Raises:
            RootCheckError: If path attempts to escape root directory
        """
        if path is None or path == "":
            full_path = self.root_path
        else:
            full_path = os.path.join(self.root_path, path)
        return self._get_file_info_from_path(full_path, current_user, session)


    def check_is_binary(self, path: Optional[str] = None, sample_size: int = 4096) -> bool:
        """
        Check if a file is likely binary by reading a sample of its contents.

        Args:
            path (str): The relative path to the file to check.
                May be None, in which case the root is checked (always returns False for directories).
            sample_size (int): Number of bytes to read for binary detection. Defaults to 4096.

        Returns:
            bool: True if the file appears to be binary, False otherwise.
                Returns False for directories.

        Raises:
            ValueError: If path attempts to escape root directory
            FileNotFoundError: If the file does not exist
            PermissionError: If the file cannot be read
        """
        full_path = self._check_path_in_root(path)

        # Directories are not binary
        if os.path.isdir(full_path):
            return False

        try:
            with open(full_path, 'rb') as f:
                sample = f.read(sample_size)
                return is_likely_binary(sample)
        except Exception as e:
            # If we can't read the file, assume it's binary to be safe
            logger.warning(f"Could not read file sample for binary detection: {e}")
            return True


    def check_is_binary(self, path: Optional[str] = None, sample_size: int = 4096) -> bool:
        """
        Check if a file is likely binary by reading a sample of its contents.

        Args:
            path (str): The relative path to the file to check.
                May be None, in which case the root is checked (always returns False for directories).
            sample_size (int): Number of bytes to read for binary detection. Defaults to 4096.

        Returns:
            bool: True if the file appears to be binary, False otherwise.
                Returns False for directories.

        Raises:
            ValueError: If path attempts to escape root directory
            FileNotFoundError: If the file does not exist
            PermissionError: If the file cannot be read
        """
        from .utils import is_likely_binary

        full_path = self._check_path_in_root(path)

        # Directories are not binary
        if os.path.isdir(full_path):
            return False

        try:
            with open(full_path, 'rb') as f:
                sample = f.read(sample_size)
                return is_likely_binary(sample)
        except Exception as e:
            # If we can't read the file, assume it's binary to be safe
            logger.warning(f"Could not read file sample for binary detection: {e}")
            return True


    def yield_file_infos(self, path: Optional[str] = None, current_user: str = None, session = None) -> Generator[FileInfo, None, None]:
        """
        Yield a FileInfo object for each child of the given path.

        Args:
            path (str): The relative path to the directory to list.
                May be None, in which case the root directory is listed.
            current_user (str): The username of the current user for permission checking.
                May be None, in which case hasRead and hasWrite will be None.
            session: Database session for symlink resolution.
                May be None, in which case symlink_target_fsp will be None for symlinks.

        Raises:
            PermissionError: If the path is not accessible due to permissions.
            FileNotFoundError: If the path does not exist.
        """
        full_path = self._check_path_in_root(path)

        entries = os.listdir(full_path)
        # Sort entries in alphabetical order, with directories listed first
        entries.sort(key=lambda e: (not os.path.isdir(
                                        os.path.join(full_path, e)), e))
        for entry in entries:
            entry_path = os.path.join(full_path, entry)
            try:
                yield self._get_file_info_from_path(entry_path, current_user, session)
            except PermissionError as e:
                # Skip files we don't have permission to access
                logger.error(f"Permission denied accessing entry: {entry_path}: {e}")
                continue


    def stream_file_contents(self, path: str = None, buffer_size: int = DEFAULT_BUFFER_SIZE, file_handle = None) -> Generator[bytes, None, None]:
        """
        Stream the contents of a file at the given path or from an open file handle.

        Args:
            path (str): The path to the file to stream (optional if file_handle is provided).
            buffer_size (int): The size of the buffer to use when reading the file.
                Defaults to DEFAULT_BUFFER_SIZE, which is 8192 bytes.
            file_handle: An open file handle to stream from (optional, takes precedence over path).
                The handle will be closed when streaming completes.

        Raises:
            ValueError: If path attempts to escape root directory or neither path nor file_handle is provided
        """
        if file_handle is not None:
            # Stream from the provided file handle and ensure it gets closed
            try:
                while True:
                    chunk = file_handle.read(buffer_size)
                    if not chunk:
                        break
                    yield chunk
            finally:
                file_handle.close()
        else:
            # Legacy behavior: open file from path
            if path is None or path == "":
                raise ValueError("Path cannot be None or empty")
            full_path = self._check_path_in_root(path)
            with open(full_path, 'rb') as file:
                while True:
                    chunk = file.read(buffer_size)
                    if not chunk:
                        break
                    yield chunk

    def stream_file_range(self, path: str = None, start: int = 0, end: int = 0, buffer_size: int = DEFAULT_BUFFER_SIZE, file_handle = None) -> Generator[bytes, None, None]:
        """
        Stream a specific byte range of a file at the given path or from an open file handle.

        Args:
            path (str): The path to the file to stream (optional if file_handle is provided).
            start (int): The starting byte position (inclusive).
            end (int): The ending byte position (inclusive).
            buffer_size (int): The size of the buffer to use when reading the file.
            file_handle: An open file handle to stream from (optional, takes precedence over path).
                The handle will be closed when streaming completes.

        Raises:
            ValueError: If path attempts to escape root directory or if range is invalid
        """
        if start < 0:
            raise ValueError("Start position cannot be negative")
        if end < start:
            raise ValueError("End position cannot be less than start position")

        # Determine which file handle to use
        should_close_handle = file_handle is not None
        if file_handle is None:
            # Legacy behavior: open file from path
            if path is None or path == "":
                raise ValueError("Path cannot be None or empty")
            full_path = self._check_path_in_root(path)
            file_handle = open(full_path, 'rb')
            should_close_handle = True

        # Stream from the file handle
        try:
            file_handle.seek(start)
            remaining = end - start + 1

            while remaining > 0:
                chunk_size = min(buffer_size, remaining)
                chunk = file_handle.read(chunk_size)
                if not chunk:
                    break
                yield chunk
                remaining -= len(chunk)
        finally:
            if should_close_handle:
                file_handle.close()


    def rename_file_or_dir(self, old_path: str, new_path: str):
        """
        Rename a file at the given old path to the new path.

        Args:
            old_path (str): The relative path to the file to rename.
            new_path (str): The new relative path for the file.

        Raises:
            ValueError: If either path attempts to escape root directory
        """
        if old_path is None or old_path == "":
            raise ValueError("Old path cannot be None or empty")
        if new_path is None or new_path == "":
            raise ValueError("New path cannot be None or empty")
        full_old_path = self._check_path_in_root(old_path)
        full_new_path = self._check_path_in_root(new_path)
        os.rename(full_old_path, full_new_path)


    def remove_file_or_dir(self, path: str):
        """
        Delete a file or (empty) directory at the given path.

        Args:
            path (str): The relative path to the file to delete.

        Raises:
            ValueError: If path is None or empty, or attempts to escape root directory
        """
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")
        full_path = self._check_path_in_root(path)
        if os.path.isdir(full_path):
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)


    def create_dir(self, path: str):
        """
        Create a directory at the given path.

        Args:
            path (str): The relative path to the directory to create.

        Raises:
            ValueError: If path is None or empty, or attempts to escape root directory
        """
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")
        full_path = self._check_path_in_root(path)
        os.mkdir(full_path)


    def create_empty_file(self, path: str):
        """
        Create an empty file at the given path.

        Args:
            path (str): The relative path to the file to create.

        Raises:
            ValueError: If path is None or empty, or attempts to escape root directory
        """
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")
        full_path = self._check_path_in_root(path)
        open(full_path, 'w').close()


    def change_file_permissions(self, path: str, permissions: str):
        """
        Change the permissions of a file at the given path.

        Args:
            path (str): The relative path to the file to change the permissions of.
            permissions (str): The new permissions to set for the file.
                Must be a string of length 10, like '-rw-r--r--'.

        Raises:
            ValueError: If path is None or empty, or attempts to escape root directory,
                or permissions is not a string of length 10.
        """
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")
        if len(permissions) != 10:
            raise ValueError("Permissions must be a string of length 10")
        full_path = self._check_path_in_root(path)
        # Convert permission string (like '-rw-r--r--') to octal mode
        mode = 0
        # Owner permissions (positions 1-3)
        if permissions[1] == 'r': mode |= stat.S_IRUSR
        if permissions[2] == 'w': mode |= stat.S_IWUSR
        if permissions[3] == 'x': mode |= stat.S_IXUSR
        # Group permissions (positions 4-6)
        if permissions[4] == 'r': mode |= stat.S_IRGRP
        if permissions[5] == 'w': mode |= stat.S_IWGRP
        if permissions[6] == 'x': mode |= stat.S_IXGRP
        # Other permissions (positions 7-9)
        if permissions[7] == 'r': mode |= stat.S_IROTH
        if permissions[8] == 'w': mode |= stat.S_IWOTH
        if permissions[9] == 'x': mode |= stat.S_IXOTH
        os.chmod(full_path, mode)
