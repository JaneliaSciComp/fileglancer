import os
import json
import requests
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from tornado import web
from fileglancer.filestore import Filestore
from fileglancer.paths import get_fsp_manager

class StreamingProxy(APIHandler):
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
                "error": f"Error streaming response"
            }))


class FileSharePathsHandler(StreamingProxy): 
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
        file_share_paths_json = [fsp.model_dump() for fsp in file_share_paths]
        self.write(json.dumps(file_share_paths_json))
        self.finish()


class FileShareHandler(APIHandler):
    """
    API handler for file access using the Filestore class
    """

    def _get_filestore(self, path):
        actual_path = f"/{path}"
        fsp = get_fsp_manager(self.settings).get_file_share_path(actual_path)
        if fsp is None:
            self.set_status(404)
            self.finish(json.dumps({"error": f"File share path '{actual_path}' not found"}))
            self.log.error(f"File share path '{actual_path}' not found")
            return None
        return Filestore(fsp.linux_path)

    """
    API handler for file access using the Filestore class
    """
    @web.authenticated
    def get(self, path=""):
        """
        Handle GET requests to list directory contents or stream file contents
        """
        subpath = self.get_argument("subpath", '')
        self.log.info(f"GET /api/fileglancer/files/{path} subpath={subpath}")

        filestore = self._get_filestore(path)
        if filestore is None:
            return
        
        try:
            # Check if subpath is a directory by getting file info
            file_info = filestore.get_file_info(subpath)
            
            if file_info.is_dir:
                # Write JSON response, streaming the files one by one
                self.write("{\n")
                self.write("\"files\": [\n")
                for i, file in enumerate(filestore.yield_file_infos(subpath)):
                    if i > 0:
                        self.write(",\n")
                    self.write(json.dumps(file.model_dump(), indent=4))
                self.write("]\n")
                self.write("}\n")
            else:
                # Stream file contents
                self.set_header('Content-Type', 'application/octet-stream')
                self.set_header('Content-Disposition', f'attachment; filename="{file_info.name}"')
                
                for chunk in filestore.stream_file_contents(subpath):
                    self.write(chunk)
                self.finish()
                
        except FileNotFoundError:
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
            self.log.info(f"Creating {path} as a directory")
            filestore.create_dir(path)
        elif file_type == "file":
            self.log.info(f"Creating {path} as a file")
            filestore.create_empty_file(path)
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


def setup_handlers(web_app):
    """ 
    Setup the URL handlers for the Fileglancer extension
    """
    base_url = web_app.settings["base_url"]
    handlers = [
        (url_path_join(base_url, "api", "fileglancer", "file-share-paths"), FileSharePathsHandler),
        (url_path_join(base_url, "api", "fileglancer", "files", "(.*)"), FileShareHandler),
        (url_path_join(base_url, "api", "fileglancer", "files"), FileShareHandler),
    ]
    web_app.add_handlers(".*$", handlers)
