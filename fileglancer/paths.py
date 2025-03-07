import os
import requests
import logging
from typing import Optional
from datetime import datetime, timedelta
from functools import cache
from pydantic import BaseModel, Field

log = logging.getLogger("tornado.application")

# Copied from fileglancer-central/fileglancer_central/app.py
# TODO: consider extracting this to a shared library
class FileSharePath(BaseModel):
    """A file share path from the database"""
    zone: str = Field(
        description="The zone of the file share, for grouping paths in the UI."
    )
    canonical_path: str = Field(
        description="The canonical path to the file share, which uniquely identifies the file share."
    )
    group: Optional[str] = Field(
        description="The group that owns the file share",
        default=None
    )
    storage: Optional[str] = Field(
        description="The storage type of the file share (home, primary, scratch, etc.)",
        default=None
    )
    mac_path: Optional[str] = Field(
        description="The path used to mount the file share on Mac (e.g. smb://server/share)",
        default=None
    )
    windows_path: Optional[str] = Field(
        description="The path used to mount the file share on Windows (e.g. \\\\server\\share)",
        default=None
    )
    linux_path: Optional[str] = Field(
        description="The path used to mount the file share on Linux (e.g. /unix/style/path)",
        default=None
    )
        

class FileSharePathManager:

    def __init__(self, central_url: str, jupyter_root_dir: str):
        self.central_url = central_url
        if self.central_url:
            log.debug(f"Central URL: {self.central_url}")
            self._file_share_paths = None
            self._fsp_cache_time = None
            n = len(self.get_file_share_paths())
            log.info(f"Configured {n} file share paths")
        else:
            log.warning("Central URL is not set, using local file share config")
            root_dir_expanded = os.path.abspath(os.path.expanduser(jupyter_root_dir))
            log.debug(f"Jupyter absolute directory: {root_dir_expanded}")
            self._file_share_paths = [
                FileSharePath(
                    zone="Local",
                    canonical_path="/local",
                    group="local",
                    storage="home",
                    linux_path=root_dir_expanded
                )
            ]
            n = len(self._file_share_paths)
            log.info(f"Configured {n} file share paths")
    

    def get_file_share_paths(self) -> list[FileSharePath]:
        if self.central_url:
            # Check if we have a valid cache
            now = datetime.now()
            if not self._file_share_paths or not self._fsp_cache_time or now - self._fsp_cache_time > timedelta(hours=1):
                log.debug("Cache miss or expired, fetching fresh data")
                response = requests.get(f"{self.central_url}/file-share-paths")
                self._file_share_paths = [FileSharePath(**fsp) for fsp in response.json()]
                self._fsp_cache_time = now
            else:
                log.debug("Cache hit")
            
        return self._file_share_paths
    

    def get_file_share_path(self, canonical_path: str) -> FileSharePath:
        for fsp in self._file_share_paths:
            if canonical_path == fsp.canonical_path:
                return fsp
        return None


@cache
def _get_fsp_manager(central_url: str, jupyter_root_dir: str):
    return FileSharePathManager(central_url, jupyter_root_dir)

def get_fsp_manager(settings):
    # Extract the relevant settings from the settings dictionary, 
    # since it's not serializable and can't be passed to a @cache method
    return _get_fsp_manager(settings["fileglancer"].central_url, settings.get("server_root_dir", os.getcwd()))
