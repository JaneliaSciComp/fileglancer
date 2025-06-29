import requests
import logging

from typing import Optional
from functools import cache

log = logging.getLogger(__name__)

class ProxiedPathManager:
    """Manage the list of user shared data paths from the central server."""

    def __init__(self, central_url: str):
        self.central_url = central_url
        self._cached_proxied_paths = {}

    def get_proxied_path_by_key(self, username: str, sharing_key: str) -> requests.Response:
        """Retrieve a proxied path by sharing key."""
        log.info(f"Retrieve proxied path {sharing_key} for user {username} from {self.central_url}")
        return requests.get(f"{self.central_url}/proxied-path/{username}/{sharing_key}")

    def get_proxied_paths(self, username: str, fsp_name: Optional[str] = None, path: Optional[str] = None) -> requests.Response:
        """Retrieve user proxied paths, optionally filtered by fsp_name and path."""
        log.info(f"Retrieve all proxied paths for user {username} from {self.central_url}")
        return requests.get(
            f"{self.central_url}/proxied-path/{username}", 
            params = {
                "fsp_name": fsp_name,
                "path": path
            }
        )

    def create_proxied_path(self, username: str, fsp_name: str, path: str) -> requests.Response:
        """Create a proxied path for the given fsp_name and path."""
        return requests.post(
            f"{self.central_url}/proxied-path/{username}",
            params = {
                "fsp_name": fsp_name,
                "path": path
            }
        )

    def update_proxied_path(self, username: str, sharing_key: str, fsp_name: Optional[str] = None, path: Optional[str] = None, new_name: Optional[str] = None) -> requests.Response:
        """Update a proxied path with the given fsp_name, path and sharing name."""
        pp_updates = {}
        if fsp_name:
            pp_updates["fsp_name"] = fsp_name
        if path:
            pp_updates["path"] = path
        if new_name:
            pp_updates["sharing_name"] = new_name
        return requests.put(
            f"{self.central_url}/proxied-path/{username}/{sharing_key}",
            params = pp_updates
        )

    def delete_proxied_path(self, username: str, sharing_key: str) -> requests.Response:
        """Delete a proxied path by sharing key."""
        return requests.delete(
            f"{self.central_url}/proxied-path/{username}/{sharing_key}"
        )


def get_proxiedpath_manager(settings) -> ProxiedPathManager:
    """
    Get a proxied path manager instance based on the application settings.
    
    Args:
        settings: The application settings dictionary
        
    Returns:
        A proxied path manager instance
    """
    central_url = settings["fileglancer"].central_url
    return _get_proxiedpath_manager(central_url)


@cache
def _get_proxiedpath_manager(central_url: str):
    return ProxiedPathManager(central_url)


