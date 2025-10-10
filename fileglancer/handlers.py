import os
import json
import requests
import re
import grp
import pwd
from datetime import datetime, timezone
from abc import ABC
from mimetypes import guess_type

from jupyter_server.base.handlers import APIHandler, JupyterHandler
from requests.exceptions import HTTPError
from tornado import web

from fileglancer.filestore import Filestore
from fileglancer.tickets import get_tickets_manager
from fileglancer.paths import get_fsp_manager
from fileglancer.preferences import get_preference_manager
from fileglancer.proxiedpath import get_proxiedpath_manager
from fileglancer.externalbucket import get_externalbucket_manager


def _format_timestamp(timestamp):
    """ Format the given timestamp to ISO date format compatible with HTTP.
    """
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return dt.isoformat()

def _guess_content_type(filename):
    """
    A wrapper for guess_type which deals with unknown MIME types
    Copied from https://github.com/JaneliaSciComp/x2s3/blob/85a743cc55b3797200e87cd9b74882a5ed39f1f0/x2s3/utils.py#L221
    """
    content_type, _ = guess_type(filename)
    if content_type:
        return content_type
    else:
        if filename.endswith('.yaml'):
            # Should be application/yaml but that doesn't display in current browsers
            # See https://httptoolkit.com/blog/yaml-media-type-rfc/
            return 'text/plain+yaml'
        else:
            return 'application/octet-stream'


def _get_mounted_filestore(fsp):
    """
    Constructs a filestore for the given file share path, checking to make sure it is mounted.
    If it is not mounted, returns None, otherwise returns the filestore.
    """
    filestore = Filestore(fsp)
    try:
        filestore.get_file_info(None)
    except FileNotFoundError:
        return None
    return filestore
    

class BaseHandler(APIHandler):
    _home_file_share_path_cache = {}
    _groups_cache = {}

    def get_current_user(self):
        """
        Get the current user's username. Uses the USER environment variable
        if available, otherwise uses the current Jupyter user's name.

        Returns:
            str: The username of the current user.
        """
        return os.getenv("USER", self.current_user.username)

    def get_home_directory_path(self):
        """
        Get the home directory path of the current user.

        Returns:
            str: The home directory path.
        """
        return os.path.expanduser(f"~{self.get_current_user()}")

    def get_home_file_share_path_name(self):
        """
        Get the file share path for the current user's home directory.

        Returns:
            str: The file share path name for the user's home directory, formatted as file_share_path_name
        """
        key = os.path.split(self.get_home_directory_path())[0]

        if key in self._home_file_share_path_cache:
            return self._home_file_share_path_cache[key]

        file_share_paths = get_fsp_manager(self.settings).get_file_share_paths()
        for fsp in file_share_paths:
            if fsp.mount_path == key:
                self._home_file_share_path_cache[key] = fsp.name
                return fsp.name

        self._home_file_share_path_cache[key] = None
        return None


    def get_user_groups(self):
        """
        Get the groups for the current user.
        
        Returns:
            list: List of group names the user belongs to.
        """
        username = self.get_current_user()

        if username in self._groups_cache:
            return self._groups_cache[username]

        try:
            user_info = pwd.getpwnam(username)
            user_groups = []
            all_groups = grp.getgrall()  # Get all groups on the system
            for group in all_groups:
                if username in group.gr_mem:  # Check if user is a member of this group
                    user_groups.append(group.gr_name)
            primary_group = grp.getgrgid(user_info.pw_gid).gr_name
            if primary_group not in user_groups: # Add primary group if not already included
                user_groups.append(primary_group)
            self._groups_cache[username] = user_groups
            return user_groups
        except Exception as e:
            self.log.error(f"Error getting groups for user {username}: {str(e)}")
            self._groups_cache[username] = []
            return []


class StreamingProxy(BaseHandler):
    """
    API handler for proxying responses from the central server
    """
    def stream_response(self, url):
        """Stream response from central server back to client"""
        try:
            # Make request to central server
            response = requests.get(url, stream=True)
            response.raise_for_status()

            # Stream the response back
            self.set_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    self.write(chunk)
            self.finish()

        except requests.exceptions.RequestException as e:
            self.log.error(f"Error fetching {url}: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({
                "error": "Error streaming response"
            }))



class FileShareHandler(BaseHandler, ABC):
    """
    Abstract base handler for endpoints that use the Filestore class.
    This class cannot be instantiated directly.
    """

    def _get_filestore(self, path_name):
        """
        Get a filestore for the given path.
        """
        fsp = get_fsp_manager(self.settings).get_file_share_path(path_name)
        if fsp is None:
            self.set_status(404)
            self.finish(json.dumps({"error": f"File share path '{path_name}' not found"}))
            self.log.error(f"File share path '{path_name}' not found")
            return None

        # Create a filestore for the file share path
        filestore = _get_mounted_filestore(fsp)
        if filestore is None:
            self.set_status(500)
            self.finish(json.dumps({"error": f"File share path '{path_name}' is not mounted"}))
            self.log.error(f"File share path '{path_name}' is not mounted")
            return None

        return filestore


class FileContentHandler(FileShareHandler):
    """
    API handler for file content
    """

    # This function is copied from x2s3, we should export it there and use it here directly
    def _parse_range_header(self, range_header: str, file_size: int):
        """Parse HTTP Range header and return start and end byte positions.

        Args:
            range_header: HTTP Range header value (e.g., "bytes=0-499")
            file_size: Total size of the file

        Returns:
            Tuple of (start, end) byte positions, or None if invalid
        """
        if not range_header or not range_header.startswith('bytes='):
            return None

        try:
            range_spec = range_header[6:]  # Remove 'bytes=' prefix

            if ',' in range_spec:
                # Multiple ranges not supported, use first range
                range_spec = range_spec.split(',')[0].strip()

            if '-' not in range_spec:
                return None

            start_str, end_str = range_spec.split('-', 1)

            if start_str and end_str:
                # Both start and end specified: "bytes=0-499"
                start = int(start_str)
                end = int(end_str)
            elif start_str and not end_str:
                # Start specified, no end: "bytes=500-"
                start = int(start_str)
                end = file_size - 1
            elif not start_str and end_str:
                # End specified, no start (suffix range): "bytes=-500"
                suffix_length = int(end_str)
                start = max(0, file_size - suffix_length)
                end = file_size - 1
            else:
                return None

            # Validate range
            if start < 0 or end < 0 or start >= file_size or start > end:
                return None

            # Clamp end to file size
            end = min(end, file_size - 1)

            return (start, end)

        except (ValueError, IndexError):
            return None

    @web.authenticated
    def head(self, path=""):
        """
        Handle HEAD requests to get file metadata without content
        """
        subpath = self.get_argument("subpath", '')
        if subpath:
            self.log.info(f"HEAD /api/fileglancer/content/{path} subpath={subpath}")
            filestore_name = path
        else:
            self.log.info(f"HEAD /api/fileglancer/content/{path}")
            filestore_name, _, subpath = path.partition('/')

        filestore = self._get_filestore(filestore_name)
        if filestore is None:
            return

        # Get file metadata
        file_name = subpath.split('/')[-1]
        content_type = _guess_content_type(file_name)

        try:
            # Check if file exists and get its size
            file_info = filestore.get_file_info(subpath)

            self.set_status(200)
            self.set_header('Accept-Ranges', 'bytes')

            # Only add download header for binary/unknown files
            if content_type == 'application/octet-stream':
                self.set_header('Content-Disposition', f'attachment; filename="{file_name}"')

            # Set Content-Length if available
            if hasattr(file_info, 'size') and file_info.size is not None:
                self.set_header('Content-Length', str(file_info.size))

            # Set Last-Modified if available
            if hasattr(file_info, 'last_modified') and file_info.last_modified is not None:
                self.set_header('Last-Modified', _format_timestamp(file_info.last_modified))

            self.finish(set_content_type=content_type)

        except FileNotFoundError:
            self.log.error(f"File not found in {filestore_name}: {subpath}")
            self.set_status(404)
            self.finish()
        except PermissionError:
            self.set_status(403)
            self.finish()

    @web.authenticated
    def get(self, path=""):
        """
        Handle GET requests to get file content, with HTTP Range header support
        """
        subpath = self.get_argument("subpath", '')
        if subpath:
            self.log.info(f"GET /api/fileglancer/content/{path} subpath={subpath}")
            filestore_name = path
        else:
            self.log.info(f"GET /api/fileglancer/content/{path}")
            filestore_name, _, subpath = path.partition('/')

        filestore = self._get_filestore(filestore_name)
        if filestore is None:
            return

        # Get file metadata first
        file_name = subpath.split('/')[-1]
        content_type = _guess_content_type(file_name)

        try:
            file_info = filestore.get_file_info(subpath)
            if file_info.is_dir:
                self.set_status(400)
                self.finish(json.dumps({"error": "Cannot download directory content"}))
                return

            file_size = file_info.size

            # Check for Range header
            range_header = self.request.headers.get('Range')
            if range_header:
                # Parse range request
                range_result = self._parse_range_header(range_header, file_size)
                if range_result is None:
                    # Invalid range - return 416 Range Not Satisfiable
                    self.set_status(416)
                    self.set_header('Content-Range', f'bytes */{file_size}')
                    self.finish()
                    return

                start, end = range_result
                content_length = end - start + 1

                # Set partial content response headers
                self.set_status(206)  # Partial Content
                self.set_header('Accept-Ranges', 'bytes')
                self.set_header('Content-Length', str(content_length))
                self.set_header('Content-Range', f'bytes {start}-{end}/{file_size}')

                # Only add download header for binary/unknown files
                if content_type == 'application/octet-stream':
                    self.set_header('Content-Disposition', f'attachment; filename="{file_name}"')

                # Stream the requested range
                for chunk in filestore.stream_file_range(subpath, start, end):
                    self.write(chunk)
                self.finish()
            else:
                # No range request - stream entire file
                self.set_status(200)
                self.set_header('Accept-Ranges', 'bytes')
                self.set_header('Content-Length', str(file_size))

                # Only add download header for binary/unknown files
                if content_type == 'application/octet-stream':
                    self.set_header('Content-Disposition', f'attachment; filename="{file_name}"')

                for chunk in filestore.stream_file_contents(subpath):
                    self.write(chunk)
                self.finish(set_content_type=content_type)

        except FileNotFoundError:
            self.log.error(f"File not found in {filestore_name}: {subpath}")
            self.set_status(404)
            self.finish(json.dumps({"error": "File or directory not found"}))
        except PermissionError:
            self.set_status(403)
            self.finish(json.dumps({"error": "Permission denied"}))


class FileMetadataHandler(FileShareHandler):
    """
    API handler for file metadata
    """

    @web.authenticated
    def get(self, path=""):
        """
        Handle GET requests to list directory contents, stream file contents, or return info for the file/folder itself
        """
        subpath = self.get_argument("subpath", '')

        if subpath:
            self.log.info(f"GET /api/fileglancer/files/{path} subpath={subpath}")
            filestore_name = path
        else:
            self.log.info(f"GET /api/fileglancer/files/{path}")
            filestore_name, _, subpath = path.partition('/')

        filestore = self._get_filestore(filestore_name)

        if filestore is None:
            return

        try:
            current_user = self.get_current_user()
            file_info = filestore.get_file_info(subpath, current_user)
            self.log.info(f"File info: {file_info}")

            # Write JSON response, streaming the files one by one
            self.set_status(200)
            self.set_header('Content-Type', 'application/json')
            self.write("{\n")
            self.write("\"info\":")
            self.write(json.dumps(file_info.model_dump(), indent=4))
            if file_info.is_dir:
                self.write(",\n")
                try:
                    files = list(filestore.yield_file_infos(subpath, current_user))
                    self.write("\"files\": [\n")
                    for i, file in enumerate(files):
                        if i > 0:
                            self.write(",\n")
                        self.write(json.dumps(file.model_dump(), indent=4))
                    self.write("]\n")
                except PermissionError:
                    self.set_status(403)
                    self.log.error(f"Permission denied when listing files in directory: {subpath}")
                    self.write("\"files\": [],\n")
                    self.write("\"error\": \"Permission denied when listing directory contents\"\n")
                except FileNotFoundError:
                    self.set_status(404)
                    self.log.error(f"Directory not found during listing: {subpath}")
                    self.write("\"files\": [],\n")
                    self.write("\"error\": \"Directory contents not found\"\n")
            self.write("}\n")

        except FileNotFoundError:
            self.log.error(f"File or directory not found: {subpath}")
            self.set_status(404)
            self.finish(json.dumps({"error": "File or directory not found"}))
        except PermissionError:
            self.set_status(403)
            self.finish(json.dumps({"error": "Permission denied"}))


    @web.authenticated
    def post(self, path=""):
        """
        Handle POST requests to create a new file or directory
        """
        subpath = self.get_argument("subpath", '')
        self.log.info(f"POST /api/fileglancer/files/{path} subpath={subpath}")
        filestore = self._get_filestore(path)
        if filestore is None:
            return

        file_info = self.get_json_body()
        if file_info is None:
            raise web.HTTPError(400, "JSON body missing")

        try:
            file_type = file_info.get("type")
            if file_type == "directory":
                self.log.info(f"Creating {subpath} as a directory")
                filestore.create_dir(subpath)
            elif file_type == "file":
                self.log.info(f"Creating {subpath} as a file")
                filestore.create_empty_file(subpath)
            else:
                raise web.HTTPError(400, "Invalid file type")

        except FileExistsError as e:
            self.set_status(409)  # Conflict status code
            self.finish(json.dumps({"error": "A file or directory with this name already exists"}))
            return
        except PermissionError as e:
            self.set_status(403)
            self.finish(json.dumps({"error": str(e)}))
            return

        self.set_status(201)
        self.finish()


    @web.authenticated
    def patch(self, path=""):
        """
        Handle PATCH requests to rename or update file permissions.
        """
        subpath = self.get_argument("subpath", '')
        self.log.info(f"PATCH /api/fileglancer/files/{path} subpath={subpath}")
        filestore = self._get_filestore(path)
        if filestore is None:
            return

        file_info = self.get_json_body()
        if file_info is None:
            raise web.HTTPError(400, "JSON body missing")

        current_user = self.get_current_user()
        old_file_info = filestore.get_file_info(subpath, current_user)
        new_path = file_info.get("path")
        new_permissions = file_info.get("permissions")

        try:
            if new_permissions is not None and new_permissions != old_file_info.permissions:
                self.log.info(f"Changing permissions of {old_file_info.path} to {new_permissions}")
                filestore.change_file_permissions(subpath, new_permissions)

            if new_path is not None and new_path != old_file_info.path:
                self.log.info(f"Renaming {old_file_info.path} to {new_path}")
                filestore.rename_file_or_dir(old_file_info.path, new_path)

        except PermissionError as e:
            self.set_status(403)
            self.finish(json.dumps({"error": str(e)}))
            return
        except OSError as e:
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))
            return

        self.set_status(204)
        self.finish()


    @web.authenticated
    def delete(self, path=""):
        """
        Handle DELETE requests to remove a file or (empty) directory.
        """
        subpath = self.get_argument("subpath", '')
        self.log.info(f"DELETE /api/fileglancer/files/{path} subpath={subpath}")
        filestore = self._get_filestore(path)
        if filestore is None:
            return

        try:
            filestore.remove_file_or_dir(subpath)

        except PermissionError as e:
            self.set_status(403)
            self.finish(json.dumps({"error": str(e)}))
            return

        self.set_status(204)
        self.finish()


class VersionHandler(BaseHandler):
    """
    API handler for returning the version of the fileglancer extension
    """
    @web.authenticated
    def get(self):
        self.log.info("GET /api/fileglancer/version")
        # get the version from the _version.py file
        version_file = os.path.join(os.path.dirname(__file__), "_version.py")
        with open(version_file, "r") as f:
            version = f.read().strip().split('=')[2].strip().strip("'")
        self.log.debug(f"Fileglancer version: {version}")

        self.set_header('Content-Type', 'application/json')
        self.set_status(200)
        self.write(json.dumps({"version": version}))
        self.finish()


class NotificationsHandler(BaseHandler):
    """
    API handler for notifications
    """

    @web.authenticated
    def get(self):
        """Get all active notifications from the central server"""
        try:
            central_url = self.settings['fileglancer'].central_url

            if not central_url:
                self.log.error("Central server URL not configured")
                self.set_status(500)
                self.finish(json.dumps({"error": "Central server not configured"}))
                return

            response = requests.get(f"{central_url}/notifications")
            response.raise_for_status()

            self.set_status(200)
            self.finish(response.json())

        except Exception as e:
            self.log.error(f"Error getting notifications: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class ProfileHandler(BaseHandler):
    """
    API handler for user profile operations
    """
    @web.authenticated
    def get(self):
        """Get the current user's profile"""
        username = self.get_current_user()
        home_fsp_name = self.get_home_file_share_path_name()
        home_directory_name = os.path.basename(self.get_home_directory_path())
        groups = self.get_user_groups()
        self.log.info(f"GET /api/fileglancer/profile username={username} home_fsp_name={home_fsp_name} home_directory_name={home_directory_name} groups={groups}")
        response = {
            "username": username,
            "homeFileSharePathName": home_fsp_name,
            "homeDirectoryName": home_directory_name,
            "groups": groups,
        }
        try:
            self.set_status(200)
            self.finish(response)
        except Exception as e:
            self.log.error(f"Error getting profile: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class StaticHandler(JupyterHandler, web.StaticFileHandler):
    """
    Static file handler for serving files from the fileglancer extension.
    If the requested file does not exist, it serves index.html.
    """

    def initialize(self, *args, **kwargs):
        return web.StaticFileHandler.initialize(self, *args, **kwargs)

    def check_xsrf_cookie(self):
        # Disable XSRF for static assets
        return

    def parse_url_path(self, url_path):
        # Tornado calls this before deciding which file to serve
        file_path = os.path.join(self.root, url_path)

        if not os.path.exists(file_path) or os.path.isdir(file_path):
            # Fall back to index.html if the file doesn't exist
            return "index.html"

        return url_path

    def get_cache_time(self, path, modified, mime_type):
        # Prevent caching of index.html to ensure XSRF and updated SPA content
        if path == "index.html":
            return 0
        return super().get_cache_time(path, modified, mime_type)

    def compute_etag(self):
        # Optional: Disable etags for index.html to prevent caching
        if self.path == "index.html":
            return None
        return super().compute_etag()

    @web.authenticated
    def get(self, path):
        self.log.info(f"GET /fg/{path}")
        # authenticate the static handler
        # this provides us with login redirection and token caching
        if not path:
            # Request for /index.html
            # Accessing xsrf_token ensures xsrf cookie is set
            # to be available for next request to /userprofile
            self.xsrf_token
            # Ensure request goes through this method even when cached so
            # that the xsrf cookie is set on new browser sessions
            # (doesn't prevent browser storing the response):
            self.set_header('Cache-Control', 'no-cache')
        return web.StaticFileHandler.get(self, path)
