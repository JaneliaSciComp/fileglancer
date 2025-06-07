import os
import json
import requests
from abc import ABC

from jupyter_server.base.handlers import APIHandler, JupyterHandler
from requests.exceptions import HTTPError
from tornado import web

from fileglancer.filestore import Filestore
from fileglancer.paths import get_fsp_manager
from fileglancer.preferences import get_preference_manager
from fileglancer.proxiedpath import get_proxiedpath_manager


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
    def get_current_user(self):
        """
        Get the current user's username. Uses the USER environment variable 
        if available, otherwise uses the current Jupyter user's name.
        
        Returns:
            str: The username of the current user.
        """
        return os.getenv("USER", self.current_user.username)


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

    @web.authenticated
    def get(self, path=""):
        """
        Handle GET requests to get file content
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
        
        # Stream file contents
        file_name = subpath.split('/')[-1]
        self.set_status(200)
        self.set_header('Content-Type', 'application/octet-stream')
        self.set_header('Content-Disposition', f'attachment; filename="{file_name}"')

        try:
            for chunk in filestore.stream_file_contents(subpath):
                self.write(chunk)
            self.finish()
        except FileNotFoundError:
            self.log.error(f"File or directory not found: {subpath}")
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
            self.log.debug(f"File info: {file_info}")

            # Write JSON response, streaming the files one by one
            self.set_status(200)
            self.set_header('Content-Type', 'application/json')
            self.write("{\n")
            self.write("\"info\":")
            self.write(json.dumps(file_info.model_dump(), indent=4))
            if file_info.is_dir:
                self.write(",\n")
                self.write("\"files\": [\n")
                for i, file in enumerate(filestore.yield_file_infos(subpath)):
                    if i > 0:
                        self.write(",\n")
                    self.write(json.dumps(file.model_dump(), indent=4))
                self.write("]\n")
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

        file_type = file_info.get("type")
        if file_type == "directory":
            self.log.info(f"Creating {subpath} as a directory")
            filestore.create_dir(subpath)
        elif file_type == "file":
            self.log.info(f"Creating {subpath} as a file")
            filestore.create_empty_file(subpath)
        else:
            raise web.HTTPError(400, "Invalid file type")

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

        except OSError as e:
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))

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

        filestore.remove_file_or_dir(subpath)
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
                self.log.error(f"Error getting proxied paths: {str(e)}")    
                self.set_status(500)
                self.finish(json.dumps({"error": str(e)}))
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
        try:
            if fsp_name is None or path is None:
                self.log.warning("fsp and path are required to create a proxied path")
                self.set_status(400)
                self.finish(json.dumps({"error": "fsp_name and path are required to create a proxied path"}))
                return
            proxied_path_manager = get_proxiedpath_manager(self.settings)
            response = proxied_path_manager.create_proxied_path(username, fsp_name, path)
            response.raise_for_status()
            rjson = response.json()
            self.set_status(201)
            self.finish(rjson)
        except HTTPError as e:
            if e.response.status_code == 404:
                self.log.warning(f"Proxied path not found: {str(e)}")
                self.set_status(404)
                self.finish(json.dumps({"error": "Proxied path not found"}))
            else:   
                self.log.error(f"Error creating proxied path: {str(e)}")
                self.set_status(500)
                self.finish(json.dumps({"error": str(e)}))
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
                self.log.error(f"Error updating proxied path: {str(e)}")
                self.set_status(500)
                self.finish(json.dumps({"error": str(e)}))
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
                self.log.error(f"Error deleting proxied path: {str(e)}")
                self.set_status(500)
                self.finish(json.dumps({"error": str(e)}))
        except Exception as e:
            self.log.error(f"Error deleting proxied path: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


class TicketHandler(APIHandler):
    """
    API handler for ticket operations
    """

    @web.authenticated
    def get(self):
        """Get ticket details"""
        ticket_key = self.get_argument("ticket_key")
        try:
            response = requests.get(
                f"{self.settings['fileglancer'].central_url}/ticket/{ticket_key}"
            )
            if response.status_code == 404:
                self.set_status(404)
                self.finish(json.dumps({"error": "Ticket not found"}))
                return
            response.raise_for_status()
            self.set_status(200)
            self.finish(response.text)

        except Exception as e:
            self.log.error(f"Error getting ticket: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def post(self):
        """Create a new ticket"""
        try:
            data = self.get_json_body()
            response = requests.post(
                f"{self.settings['fileglancer'].central_url}/ticket",
                params={
                    "project_key": data["project_key"],
                    "issue_type": data["issue_type"],
                    "summary": data["summary"],
                    "description": data["description"]
                }
            )
            response.raise_for_status()
            self.set_status(200)
            self.finish(response.text)

        except Exception as e:
            self.log.error(f"Error creating ticket: {str(e)}")
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))


    @web.authenticated
    def delete(self):
        """Delete a ticket"""
        ticket_key = self.get_argument("ticket_key")
        try:
            response = requests.delete(
                f"{self.settings['fileglancer'].central_url}/ticket/{ticket_key}"
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

class ProfileHandler(BaseHandler):
    """
    API handler for user profile operations
    """
    @web.authenticated
    def get(self):
        """Get the current user's profile"""
        username = self.get_current_user()
        self.log.info(f"GET /api/fileglancer/profile username={username}")
        response = {
            "username": username,
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
