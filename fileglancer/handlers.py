import os
import json
import requests
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

    def check_central_server_configured(self):
        """
        Check if central server is configured. If not, returns a structured error response
        and finishes the request.

        Returns:
            str|None: The central_url if configured, None if request was finished with error response
        """
        central_url = self.settings['fileglancer'].central_url
        if not central_url:
            self.log.info("Central server URL not configured")
            self.set_status(500)
            self.finish(json.dumps({
                "code": "CENTRAL_SERVER_NOT_CONFIGURED",
                "message": "Central server not configured",
                "details": {"central_url": None}
            }))
            return None
        return central_url


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


class FileSharePathsHandler(BaseHandler):
    """
    API handler for file share paths
    """
    @web.authenticated
    def get(self):
        self.log.info("GET /api/fileglancer/file-share-paths")
        file_share_paths = get_fsp_manager(self.settings).get_file_share_paths()
        self.set_header('Content-Type', 'application/json')
        self.set_status(200)
        # Convert Pydantic objects to dicts before JSON serialization
        file_share_paths_json = {"paths": [fsp.model_dump() for fsp in file_share_paths]}
        self.write(json.dumps(file_share_paths_json))
        self.finish()



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


    # TODO: This currently can't be authenticated becuase it's used by ome-zarr.js which doesn't have cookie access.
    #@web.authenticated
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

    # TODO: This currently can't be authenticated becuase it's used by ome-zarr.js which doesn't have cookie access.
    #@web.authenticated
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
            file_info = filestore.get_file_info(subpath)
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
                    files = list(filestore.yield_file_infos(subpath))
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

        old_file_info = filestore.get_file_info(subpath)
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


class PreferencesHandler(BaseHandler):
    """
    Handler for user preferences API endpoints.
    """

    @web.authenticated
    def get(self):
        """
        Get all preferences or a specific preference for the current user.
        """
        key = self.get_argument("key", None)
        username = self.get_current_user()
        self.log.info(f"GET /api/fileglancer/preference username={username} key={key}")

        try:
            preference_manager = get_preference_manager(self.settings)
            result = preference_manager.get_preference(username, key)
            self.set_status(200)
            self.finish(json.dumps(result))
        except KeyError as e:
            self.log.warning(f"Preference not found: {str(e)}")
            self.set_status(404)
            self.finish(json.dumps({"error": str(e)}))
        except Exception as e:
            self.log.error(f"Error getting preference: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def put(self):
        """
        Set a preference for the current user.
        """
        key = self.get_argument("key")
        username = self.get_current_user()
        value = self.get_json_body()
        self.log.info(f"PUT /api/fileglancer/preference username={username} key={key}")

        try:
            preference_manager = get_preference_manager(self.settings)
            preference_manager.set_preference(username, key, value)
            self.set_status(204)
            self.finish()
        except Exception as e:
            self.log.error(f"Error setting preference: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def delete(self):
        """
        Delete a preference for the current user.
        """
        key = self.get_argument("key")
        username = self.get_current_user()
        self.log.info(f"DELETE /api/fileglancer/preference username={username} key={key}")

        try:
            preference_manager = get_preference_manager(self.settings)
            preference_manager.delete_preference(username, key)
            self.set_status(204)
            self.finish()
        except KeyError as e:
            self.log.warning(f"Preference not found: {str(e)}")
            self.set_status(404)
            self.finish(json.dumps({"error": str(e)}))
        except Exception as e:
            self.log.error(f"Error deleting preference: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class ProxiedPathHandler(BaseHandler):
    """
    API handler for ProxiedPath (user shared data paths)
    """

    @web.authenticated
    def get(self):
        """
        Get all proxied paths or a specific proxied path for the current user.
        """
        username = self.get_current_user()
        key = self.get_argument("sharing_key", None)
        fsp_name = self.get_argument("fsp_name", None)
        path = self.get_argument("path", None)

        central_url = self.check_central_server_configured()
        if central_url is None:
            return 
        try:
            proxied_path_manager = get_proxiedpath_manager(self.settings)
            if key:
                self.log.info(f"GET /api/fileglancer/proxied-path username={username} key={key}")
                response = proxied_path_manager.get_proxied_path_by_key(username, key)
            elif fsp_name and path:
                self.log.info(f"GET /api/fileglancer/proxied-path username={username} fsp_name={fsp_name} path={path}")
                response = proxied_path_manager.get_proxied_paths(username, fsp_name, path)
            else:
                self.log.info(f"GET /api/fileglancer/proxied-path username={username}")
                response = proxied_path_manager.get_proxied_paths(username)
            response.raise_for_status()
            self.set_status(200)
            self.finish(response.json())
        except HTTPError as e:
            if e.response.status_code == 404:
                self.log.warning(f"Proxied path not found: {str(e)}")
                self.set_status(404)
                self.finish(json.dumps({"error": "Proxied path not found"}))
            else:
                remote_error = e.response.json().get("error", "")
                error_message = f"Remote error {e.response.status_code} getting proxied paths: {remote_error}"
                self.log.error(error_message)
                self.set_status(500)
                self.finish(json.dumps({"error": error_message}))
        except Exception as e:
            self.log.error(f"Error getting proxied paths: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def post(self):
        """
        Create a shared path for the current user.
        """
        username = self.get_current_user()
        data = self.get_json_body()
        if data is None:
            self.set_status(400)
            self.finish(json.dumps({"error": "JSON body with fsp_name and path is required to create a proxied path"}))
            return
        fsp_name = data.get("fsp_name", None)
        path = data.get("path", None)
        self.log.info(f"POST /api/fileglancer/proxied-path username={username} fsp_name={fsp_name} path={path}")

        central_url = self.check_central_server_configured()
        if central_url is None:
            return

        try:
            if fsp_name is None or path is None:
                self.log.warning("fsp and path are required to create a proxied path")
                self.set_status(400)
                self.finish(json.dumps({"error": "fsp_name and path are required to create a proxied path"}))
                return
            proxied_path_manager = get_proxiedpath_manager(self.settings)
            response = proxied_path_manager.create_proxied_path(username, fsp_name, path)
            response.raise_for_status()
            self.set_status(201)
            self.finish(response.json())
        except HTTPError as e:
            if e.response.status_code == 404:
                self.log.warning(f"Proxied path not found: {str(e)}")
                self.set_status(404)
                self.finish(json.dumps({"error": "Proxied path not found"}))
            else:
                remote_error = e.response.json().get("error", "")
                error_message = f"Remote error {e.response.status_code} creating proxied path: {remote_error}"
                self.log.error(error_message)
                self.set_status(500)
                self.finish(json.dumps({"error": error_message}))
        except Exception as e:
            self.log.error(f"Error creating proxied path: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def patch(self):
        """
        Update a shared path for the current user.
        """
        username = self.get_current_user()
        data = self.get_json_body()
        if data is None:
            self.set_status(400)
            self.finish(json.dumps({"error": "JSON body is required to update a proxied path"}))
            return
        key = data.get("sharing_key", None)
        fsp_name = data.get("fsp_name", None)
        path = data.get("path", None)
        sharing_name = data.get("sharing_name", None)
        self.log.info((
            "PATCH /api/fileglancer/proxied-path"
            f"username={username} fsp_name={fsp_name} path={path} sharing_name={sharing_name}"
        ))

        central_url = self.check_central_server_configured()
        if central_url is None:
            return

        try:
            if key is None:
                self.log.warning("sharing_key is required to update a proxied path")
                self.set_status(400)
                self.finish(json.dumps({"error": "sharing_key is required to update a proxied path"}))
                return
            proxied_path_manager = get_proxiedpath_manager(self.settings)
            response = proxied_path_manager.update_proxied_path(username, key, fsp_name, path, sharing_name)
            response.raise_for_status()
            self.set_status(200)
            self.finish(response.json())
        except HTTPError as e:
            if e.response.status_code == 404:
                self.log.warning(f"Proxied path not found: {str(e)}")
                self.set_status(404)
                self.finish(json.dumps({"error": "Proxied path not found"}))
            else:
                remote_error = e.response.json().get("error", "")
                error_message = f"Remote error {e.response.status_code} updating proxied path: {remote_error}"
                self.log.error(error_message)
                self.set_status(500)
                self.finish(json.dumps({"error": error_message}))
        except Exception as e:
            self.log.error(f"Error updating proxied path: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def delete(self):
        """
        Delete the specified proxied path for the current user.
        """
        username = self.get_current_user()
        sharing_key = self.get_argument("sharing_key", None)
        self.log.info(f"DELETE /api/fileglancer/proxied-path username={username} sharing_key={sharing_key}")

        central_url = self.check_central_server_configured()
        if central_url is None:
            return

        if sharing_key is None:
            self.log.warning("Sharing key is required to delete a proxied path")
            self.set_status(400)
            self.finish(json.dumps({"error": "Sharing key is required to delete a proxied path"}))
            return
        try:
            proxied_path_manager = get_proxiedpath_manager(self.settings)
            response = proxied_path_manager.delete_proxied_path(username, sharing_key)
            response.raise_for_status()
            self.set_status(204)
            self.finish()
        except HTTPError as e:
            if e.response.status_code == 404:
                self.log.warning(f"Proxied path not found: {str(e)}")
                self.set_status(404)
                self.finish(json.dumps({"error": "Proxied path not found"}))
            else:
                remote_error = e.response.json().get("error", "")
                error_message = f"Remote error {e.response.status_code} deleting proxied path: {remote_error}"
                self.log.error(error_message)
                self.set_status(500)
                self.finish(json.dumps({"error": error_message}))
        except Exception as e:
            self.log.error(f"Error deleting proxied path: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class TicketHandler(BaseHandler):
    """
    API handler for ticket operations
    """

    @web.authenticated
    def get(self):
        """Get all ticket details or a specific ticket by fsp_name and path for the current user"""
        username = self.get_current_user()
        fsp_name = self.get_argument("fsp_name", None)
        path = self.get_argument("path", None)

        central_url = self.check_central_server_configured()
        if central_url is None:
            return 
        
        try:
            tickets_manager = get_tickets_manager(self.settings)
            if fsp_name and path:
                self.log.info(f"GET /api/fileglancer/ticket username={username} fsp_name={fsp_name} path={path}")
                response = tickets_manager.get_tickets(username, fsp_name, path)
            else:
                self.log.info(f"GET /api/fileglancer/ticket username={username}")
                response = tickets_manager.get_tickets(username)
            if response.status_code == 404:
                self.set_status(404)
                self.finish(json.dumps({"error": "Ticket not found"}))
                return
            response.raise_for_status()

            data = response.json()

            # Ensure the response is a dictionary, not a list
            # Required because data is a list of tickets, and Tornado
            # will not accept lists in self.finish() for security reasons.
            if isinstance(data, list):
                data = {"tickets": data}

            self.set_status(200)
            self.finish(data)

        except Exception as e:
            self.log.error(f"Error getting ticket: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def post(self):
        """Create a new ticket"""
        username = self.get_current_user()
        data = self.get_json_body()

        if data is None:
            self.set_status(400)
            self.finish(json.dumps({"error": "JSON body with fsp_name, path, project_key, issue_type, summary, and description is required to create a JIRA ticket"}))
            return

        fsp_name = data.get("fsp_name", None)
        path = data.get("path", None)
        project_key = data.get("project_key", None)
        issue_type = data.get("issue_type", None)
        summary = data.get("summary", None)
        description = data.get("description", None)

        if not all([fsp_name, path, project_key, issue_type, summary, description]):
                self.set_status(400)
                self.finish(json.dumps({"error": "fsp_name, path, project_key, issue_type, summary, and description are required to create a JIRA ticket"}))
                return

        central_url = self.check_central_server_configured()
        if central_url is None:
            return

        try:
            tickets_manager = get_tickets_manager(self.settings)
            response = tickets_manager.create_ticket(username, fsp_name, path, project_key, issue_type, summary, description)
            response.raise_for_status()
            self.set_status(200)
            self.finish(response.json())

        except Exception as e:
            self.log.error(f"Error creating ticket: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def delete(self):
        """Delete a ticket"""
        ticket_key = self.get_argument("ticket_key")
        try:
            central_url = self.check_central_server_configured()
            if central_url is None:
                return

            response = requests.delete(
                f"{central_url}/ticket/{ticket_key}"
            )
            if response.status_code == 404:
                self.set_status(404)
                self.finish(json.dumps({"error": "Ticket not found"}))
                return
            response.raise_for_status()
            self.set_status(204)
            self.finish()

        except Exception as e:
            self.log.error(f"Error deleting ticket: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


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

class CentralVersionHandler(BaseHandler):
    """
    API handler for returning the version of the fileglancer-central server
    """
    @web.authenticated
    def get(self):
        self.log.info("GET /api/fileglancer/central-version")
        try:
            central_url = self.settings['fileglancer'].central_url

            if not central_url:
                self.log.error("Central server URL not configured")
                self.set_status(500)
                self.finish(json.dumps({
                    "code": "CENTRAL_SERVER_NOT_CONFIGURED",
                    "message": "Central server not configured",
                    "details": {"central_url": None}
                }))
                return

            response = requests.get(f"{central_url}/version")
            response.raise_for_status()

            central_version_data = response.json()
            self.log.debug(f"Central server version: {central_version_data}")

            self.set_header('Content-Type', 'application/json')
            self.set_status(200)
            self.write(json.dumps(central_version_data))
            self.finish()

        except requests.exceptions.ConnectionError as e:
            self.log.error(f"Central server unreachable: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({
                "code": "CENTRAL_SERVER_UNREACHABLE",
                "message": "Central server is unreachable",
                "details": {"central_url": self.settings['fileglancer'].central_url, "error": str(e)}
            }))
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401 or e.response.status_code == 403:
                self.log.error(f"Central server authentication failed: {str(e)}")
                self.set_status(500)
                self.finish(json.dumps({
                    "code": "CENTRAL_SERVER_AUTH_FAILED",
                    "message": "Authentication failed with central server",
                    "details": {"status_code": e.response.status_code, "error": str(e)}
                }))
            else:
                self.log.error(f"Central server HTTP error: {str(e)}")
                self.set_status(500)
                self.finish(json.dumps({
                    "code": "CENTRAL_SERVER_INVALID_RESPONSE",
                    "message": f"Central server returned HTTP {e.response.status_code}",
                    "details": {"status_code": e.response.status_code, "error": str(e)}
                }))
        except Exception as e:
            self.log.error(f"Error getting central version: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({
                "code": "CENTRAL_SERVER_INVALID_RESPONSE",
                "message": f"Failed to fetch central version: {str(e)}",
                "details": {"error": str(e)}
            }))


class ExternalBucketHandler(BaseHandler):
    """
    API handler for external bucket operations
    """
    @web.authenticated
    def get(self):
        """
        Get all external buckets or the bucket for a given FSP.
        """
        fsp_name = self.get_argument("fsp_name", None)

        central_url = self.check_central_server_configured()
        if central_url is None:
            return

        try:
            external_bucket_manager = get_externalbucket_manager(self.settings)
            if fsp_name:
                self.log.info(f"GET /api/fileglancer/external-buckets fsp_name={fsp_name}")
                response = external_bucket_manager.get_buckets(fsp_name)
            else:
                self.log.info(f"GET /api/fileglancer/external-buckets")
                response = external_bucket_manager.get_buckets()
            response.raise_for_status()
            self.set_status(200)
            self.finish(response.json())
        except HTTPError as e:
            remote_error = e.response.json().get("error", "")
            error_message = f"Remote error {e.response.status_code} getting external buckets: {remote_error}"
            self.log.error(error_message)
            self.set_status(500)
            self.finish(json.dumps({"error": error_message}))
        except Exception as e:
            self.log.error(f"Error getting external buckets: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class NotificationsHandler(BaseHandler):
    """
    API handler for notifications
    """

    @web.authenticated
    def get(self):
        """Get all active notifications from the central server"""
        try:
            central_url = self.check_central_server_configured()
            if central_url is None:
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
        self.log.info(f"GET /api/fileglancer/profile username={username} home_fsp_name={home_fsp_name} home_directory_name={home_directory_name}")
        response = {
            "username": username,
            "homeFileSharePathName": home_fsp_name,
            "homeDirectoryName": home_directory_name,
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
