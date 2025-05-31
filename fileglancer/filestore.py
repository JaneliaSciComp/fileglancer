"""
A module that provides a simple interface for interacting with a file system, 
rooted at a specific directory.
"""

import os

from pydantic import BaseModel
from typing import Optional, Generator
import stat
import pwd
import grp
import logging
import shutil

from fileglancer.paths import FileSharePath

log = logging.getLogger("tornado.application")

DEFAULT_BUFFER_SIZE = 8192

class FileInfo(BaseModel):
    """
    A class that represents a file or directory in a Filestore.
    """
    name: str
    path: Optional[str] = None
    size: int
    is_dir: bool
    permissions: str
    owner: Optional[str] = None
    group: Optional[str] = None
    last_modified: Optional[float] = None

    @classmethod
    def from_stat(cls, path: str, full_path: str, stat_result: os.stat_result):
        """Create FileInfo from os.stat_result"""
        is_dir = stat.S_ISDIR(stat_result.st_mode)
        size = 0 if is_dir else stat_result.st_size
        name = os.path.basename(full_path)
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
        
        return cls(
            name=name,
            path=path,
            size=size,
            is_dir=is_dir,
            permissions=permissions,
            owner=owner,
            group=group,
            last_modified=last_modified
        )


class Filestore:
    """
    A class that provides a simple interface for interacting with a file system, 
    rooted at a specific directory.
    """

    def __init__(self, file_share_path: FileSharePath):
        """
        Create a Filestore with the given root path.
        """
        self.root_path = os.path.abspath(file_share_path.mount_path)


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
            if not full_path.startswith(self.root_path):
                raise ValueError(f"Path ({full_path}) attempts to escape root directory ({self.root_path})")
        return full_path


    def get_root_path(self) -> str:
        """
        Get the root path of the Filestore.
        """
        return self.root_path
    

    def get_file_info(self, path: Optional[str] = None) -> FileInfo:
        """
        Get the FileInfo for a file or directory at the given path.

        Args:
            path (str): The relative path to the file or directory to get the FileInfo for.
                May be None, in which case the root directory is used.
        
        Raises:
            ValueError: If path attempts to escape root directory
        """
        full_path = self._check_path_in_root(path)
        stat_result = os.stat(full_path)
        return FileInfo.from_stat(path, full_path,stat_result)
    

    def yield_file_infos(self, path: Optional[str] = None) -> Generator[FileInfo, None, None]:
        """
        Yield a FileInfo object for each child of the given path.

        Args:
            path (str): The relative path to the directory to list. 
                May be None, in which case the root directory is listed.
            
        Raises:
            ValueError: If path attempts to escape root directory
        """
        full_path = self._check_path_in_root(path)
        try:
            entries = os.listdir(full_path)
            entries.sort(key=lambda e: (not os.path.isdir(
                                            os.path.join(full_path, e)), e))
            for entry in entries:
                entry_path = os.path.join(full_path, entry)
                try:
                    stat_result = os.stat(entry_path)
                    rel_entry_path = os.path.relpath(entry_path, self.root_path)
                    file_info = FileInfo.from_stat(rel_entry_path, entry_path, stat_result)
                    yield file_info
                except (FileNotFoundError, PermissionError):
                    continue
        except (FileNotFoundError, PermissionError):
            return


    def stream_file_contents(self, path: str, buffer_size: int = DEFAULT_BUFFER_SIZE) -> Generator[bytes, None, None]:
        """
        Stream the contents of a file at the given path.

        Args:
            path (str): The path to the file to stream.
            buffer_size (int): The size of the buffer to use when reading the file. 
                Defaults to DEFAULT_BUFFER_SIZE, which is 8192 bytes.
                
        Raises:
            ValueError: If path attempts to escape root directory
        """
        if path is None or path == "":
            raise ValueError("Path cannot be None or empty")
        full_path = self._check_path_in_root(path)
        with open(full_path, 'rb') as file:
            while True:
                chunk = file.read(buffer_size)
                if not chunk:
                    break
                yield chunk


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
