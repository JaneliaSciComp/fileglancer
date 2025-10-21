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

from .model import FileSharePath

# Default buffer size for streaming file contents
DEFAULT_BUFFER_SIZE = 8192

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

    @classmethod
    def from_stat(cls, path: str, absolute_path: str, stat_result: os.stat_result, current_user: str = None):
        """Create FileInfo from os.stat_result"""
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")
        is_dir = stat.S_ISDIR(stat_result.st_mode)
        size = 0 if is_dir else stat_result.st_size
        # Do not expose the name of the root directory
        name = '' if path=='.' else os.path.basename(absolute_path)
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
            hasWrite=hasWrite
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
        self.root_path = os.path.abspath(expanded_path)


    def _check_path_in_root(self, path: Optional[str]) -> str:
        """
        Check if a path is within the root directory and return the full path.

        Args:
            path (str): The relative path to check.

        Returns:
            str: The full path to the file or directory.

        Raises:
            ValueError: If path attempts to escape root directory
        """
        if path is None or path == "":
            full_path = self.root_path
        else:
            full_path = os.path.abspath(os.path.join(self.root_path, path))
            if os.path.commonpath([full_path, self.root_path]) != self.root_path:
                raise ValueError(f"Path ({full_path}) attempts to escape root directory ({self.root_path})")
        return full_path


    def _get_file_info_from_path(self, full_path: str, current_user: str = None) -> FileInfo:
        """
        Get the FileInfo for a file or directory at the given path.
        """
        stat_result = os.stat(full_path)
        # Regenerate the relative path to ensure it is not empty (None and empty string are converted to '.' here)
        rel_path = os.path.relpath(full_path, self.root_path)
        return FileInfo.from_stat(rel_path, full_path, stat_result, current_user)


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


    def get_file_info(self, path: Optional[str] = None, current_user: str = None) -> FileInfo:
        """
        Get the FileInfo for a file or directory at the given path.

        Args:
            path (str): The relative path to the file or directory to get the FileInfo for.
                May be None, in which case the root directory is used.
            current_user (str): The username of the current user for permission checking.
                May be None, in which case hasRead and hasWrite will be None.

        Raises:
            ValueError: If path attempts to escape root directory
        """
        full_path = self._check_path_in_root(path)
        return self._get_file_info_from_path(full_path, current_user)


    def yield_file_infos(self, path: Optional[str] = None, current_user: str = None) -> Generator[FileInfo, None, None]:
        """
        Yield a FileInfo object for each child of the given path.

        Args:
            path (str): The relative path to the directory to list.
                May be None, in which case the root directory is listed.
            current_user (str): The username of the current user for permission checking.
                May be None, in which case hasRead and hasWrite will be None.

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
                yield self._get_file_info_from_path(entry_path, current_user)
            except (FileNotFoundError, PermissionError, OSError) as e:
                logger.error(f"Error accessing entry: {entry_path}: {e}")
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
