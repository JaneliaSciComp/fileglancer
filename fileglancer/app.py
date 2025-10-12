import os
import sys
import pwd
import grp
import json
from datetime import datetime, timezone
from functools import cache
from pathlib import Path as PathLib
from typing import List, Optional, Dict, Tuple, Generator
from mimetypes import guess_type

try:
    import tomllib
except ImportError:
    import tomli as tomllib

import yaml
from loguru import logger
from pydantic import HttpUrl
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Query, Path, APIRouter, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response, JSONResponse, PlainTextResponse, StreamingResponse, FileResponse
from fastapi.exceptions import RequestValidationError, StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from urllib.parse import quote

from fileglancer import database as db
from fileglancer.model import FileSharePath, FileSharePathResponse, Ticket, ProxiedPath, ProxiedPathResponse, ExternalBucket, ExternalBucketResponse, Notification, NotificationResponse
from fileglancer.settings import get_settings
from fileglancer.issues import create_jira_ticket, get_jira_ticket_details, delete_jira_ticket
from fileglancer.utils import slugify_path
from fileglancer.proxy_context import ProxyContext, AccessFlagsProxyContext
from fileglancer.filestore import Filestore

from x2s3.utils import get_read_access_acl, get_nosuchbucket_response, get_error_response
from x2s3.client_file import FileProxyClient


# Read version once at module load time
def _read_version() -> str:
    """Read version from package metadata or package.json file"""
    try:
        # First try to get version from installed package metadata
        from importlib.metadata import version
        return version("fileglancer")
    except Exception:
        # Fallback to reading from package.json during development
        try:
            import json
            # Use os.path instead of Path to avoid any Path-related issues
            current_file = os.path.abspath(__file__)
            current_dir = os.path.dirname(current_file)
            project_root = os.path.dirname(current_dir)
            package_json_path = os.path.join(project_root, "package.json")

            with open(package_json_path, "r") as f:
                data = json.load(f)

            return data["version"]
        except Exception as e:
            logger.warning(f"Could not read version from package metadata or package.json: {e}")
            return "unknown"

APP_VERSION = _read_version()


def get_current_user():
    return os.getenv("USER", "unknown")


def _get_external_buckets(db_url, fsp_name: Optional[str] = None):
    with db.get_db_session(db_url) as session:
        return [ExternalBucket(
            id=bucket.id,
            full_path=bucket.full_path,
            external_url=bucket.external_url,
            fsp_name=bucket.fsp_name,
            relative_path=bucket.relative_path
        ) for bucket in db.get_all_external_buckets(session, fsp_name)]


def _convert_proxied_path(db_path: db.ProxiedPathDB, external_proxy_url: Optional[HttpUrl]) -> ProxiedPath:
    """Convert a database ProxiedPathDB model to a Pydantic ProxiedPath model"""
    if external_proxy_url:
        url = f"{external_proxy_url}/{db_path.sharing_key}/{quote(db_path.sharing_name)}"
    else:
        logger.warning(f"No external proxy URL was provided, proxy links will not be available.")
        url = None
    return ProxiedPath(
        username=db_path.username,
        sharing_key=db_path.sharing_key,
        sharing_name=db_path.sharing_name,
        fsp_name=db_path.fsp_name,
        path=db_path.path,
        created_at=db_path.created_at,
        updated_at=db_path.updated_at,
        url=url
    )

def _convert_ticket(db_ticket: db.TicketDB) -> Ticket:
    return Ticket(
        username=db_ticket.username,
        fsp_name=db_ticket.fsp_name,
        path=db_ticket.path,
        key=db_ticket.ticket_key,
        created=db_ticket.created_at,
        updated=db_ticket.updated_at
    )

def create_app(settings):

    @cache
    def _get_fsp_names_to_mount_paths() -> Dict[str, str]:
        if settings.file_share_mounts:
            return {fsp.name: fsp.mount_path for fsp in settings.file_share_mounts}
        else:
            with db.get_db_session(settings.db_url) as session:
                return {fsp.name: fsp.mount_path for fsp in db.get_all_paths(session)}


    def _get_file_proxy_client(sharing_key: str, sharing_name: str) -> Tuple[FileProxyClient, ProxyContext] | Tuple[Response, None]:
        with db.get_db_session(settings.db_url) as session:

            proxied_path = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if not proxied_path:
                return get_nosuchbucket_response(sharing_name), None
            if proxied_path.sharing_name != sharing_name:
                return get_error_response(400, "InvalidArgument", f"Sharing name mismatch for sharing key {sharing_key}", sharing_name), None

            # Create the appropriate proxy context based on the settings
            if settings.use_access_flags:
                proxy_context = AccessFlagsProxyContext(proxied_path.username)
            else:
                proxy_context = ProxyContext()

            fsp_names_to_mount_paths = _get_fsp_names_to_mount_paths()
            if proxied_path.fsp_name not in fsp_names_to_mount_paths:
                return get_error_response(400, "InvalidArgument", f"File share path {proxied_path.fsp_name} not found", sharing_name), None
            fsp_mount_path = fsp_names_to_mount_paths[proxied_path.fsp_name]
            mount_path = f"{fsp_mount_path}/{proxied_path.path}"
            return FileProxyClient(proxy_kwargs={'target_name': sharing_name}, path=mount_path), proxy_context


    @asynccontextmanager
    async def lifespan(app: FastAPI):

        # Configure logging based on the log level in the settings
        logger.remove()
        logger.add(sys.stderr, level=settings.log_level)

        def mask_password(url: str) -> str:
            """Mask password in database URL for logging"""
            import re
            return re.sub(r'(://[^:]+:)[^@]+(@)', r'\1****\2', url)

        logger.info(f"Settings:")
        logger.info(f"  log_level: {settings.log_level}")
        logger.info(f"  db_url: {mask_password(settings.db_url)}")
        if settings.db_admin_url:
            logger.info(f"  db_admin_url: {mask_password(settings.db_admin_url)}")
        logger.info(f"  use_access_flags: {settings.use_access_flags}")
        logger.info(f"  atlassian_url: {settings.atlassian_url}")

        # Initialize database (run migrations once at startup)
        logger.info("Initializing database...")
        db.initialize_database(settings.db_url)

        # Check for notifications file at startup
        notifications_file = os.path.join(os.getcwd(), "notifications.yaml")
        if os.path.exists(notifications_file):
            logger.info(f"Notifications file found: {notifications_file}")
        else:
            logger.info(f"No notifications file found at {notifications_file}")

        logger.info(f"Server ready")
        yield
        # Cleanup (if needed)
        pass

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET","HEAD"],
        allow_headers=["*"],
        expose_headers=["Range", "Content-Range"],
    )

    # Mount static assets (CSS, JS, images) at /assets
    ui_dir = PathLib(__file__).parent / "ui"
    assets_dir = ui_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        logger.info(f"Mounted static assets at /assets from {assets_dir}")
    else:
        logger.warning(f"Assets directory not found at {assets_dir}")

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request, exc):
        return JSONResponse({"error":str(exc.detail)}, status_code=exc.status_code)


    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request, exc):
        return JSONResponse({"error":str(exc)}, status_code=400)


    @app.get('/robots.txt', response_class=PlainTextResponse, include_in_schema=False)
    def robots():
        return """User-agent: *\nDisallow: /"""

    # Create API router for all API endpoints
    api = APIRouter(prefix="/api")

    @api.get("/version", response_model=dict,
             description="Get the current version of the server")
    async def version_endpoint():
        return {"version": APP_VERSION}


    @api.get("/file-share-paths", response_model=FileSharePathResponse,
             description="Get all file share paths from the database")
    async def get_file_share_paths() -> List[FileSharePath]:
        file_share_mounts = settings.file_share_mounts
        if file_share_mounts:
            paths = [FileSharePath(
                name=slugify_path(path),
                zone='Local',
                group='local',
                storage='local',
                mount_path=path,
                mac_path=path,
                windows_path=path,
                linux_path=path,
            ) for path in file_share_mounts]
        else:
            with db.get_db_session(settings.db_url) as session:
                paths = [FileSharePath(
                    name=path.name,
                    zone=path.zone,
                    group=path.group,
                    storage=path.storage,
                    mount_path=path.mount_path,
                    mac_path=path.mac_path,
                    windows_path=path.windows_path,
                    linux_path=path.linux_path,
                ) for path in db.get_all_paths(session)]

        return FileSharePathResponse(paths=paths)

    @api.get("/external-buckets", response_model=ExternalBucketResponse,
             description="Get all external buckets from the database")
    async def get_external_buckets() -> ExternalBucketResponse:
        buckets = _get_external_buckets(settings.db_url)
        return ExternalBucketResponse(buckets=buckets)


    @api.get("/external-buckets/{fsp_name}", response_model=ExternalBucketResponse,
             description="Get the external buckets for a given FSP name")
    async def get_external_buckets(fsp_name: str) -> ExternalBucket:
        buckets = _get_external_buckets(settings.db_url, fsp_name)
        return ExternalBucketResponse(buckets=buckets)


    @api.get("/notifications", response_model=NotificationResponse,
             description="Get all active notifications")
    async def get_notifications() -> NotificationResponse:
        try:
            # Read notifications from YAML file in current working directory
            notifications_file = os.path.join(os.getcwd(), "notifications.yaml")

            with open(notifications_file, "r") as f:
                data = yaml.safe_load(f)

            notifications = []
            current_time = datetime.now(timezone.utc)

            for item in data.get("notifications", []):
                try:
                    # Parse datetime strings - handle Z suffix properly
                    created_at_str = str(item["created_at"])
                    if created_at_str.endswith("Z"):
                        created_at_str = created_at_str[:-1] + "+00:00"
                    created_at = datetime.fromisoformat(created_at_str)

                    expires_at = None
                    if item.get("expires_at") and item.get("expires_at") != "null":
                        expires_at_str = str(item["expires_at"])
                        if expires_at_str.endswith("Z"):
                            expires_at_str = expires_at_str[:-1] + "+00:00"
                        expires_at = datetime.fromisoformat(expires_at_str)

                    # Only include active notifications that haven't expired
                    is_active = item["active"]
                    is_not_expired = expires_at is None or expires_at > current_time

                    if is_active and is_not_expired:
                        notifications.append(Notification(
                            id=item["id"],
                            type=item["type"],
                            title=item["title"],
                            message=item["message"],
                            active=item["active"],
                            created_at=created_at,
                            expires_at=expires_at
                        ))
                except Exception as e:
                    logger.debug(f"Failed to parse notification {item.get('id', 'unknown')}: {e}")
                    continue

            return NotificationResponse(notifications=notifications)

        except FileNotFoundError:
            logger.debug("Notifications file not found")
            return NotificationResponse(notifications=[])
        except Exception as e:
            logger.exception(f"Error loading notifications: {e}")
            return NotificationResponse(notifications=[])


    @api.post("/ticket", response_model=Ticket,
              description="Create a new ticket and return the key")
    async def create_ticket(
        username: str,
        fsp_name: str,
        path: str,
        project_key: str,
        issue_type: str,
        summary: str,
        description: str
    ) -> str:
        try:
            # Create ticket in JIRA
            jira_ticket = create_jira_ticket(
                project_key=project_key,
                issue_type=issue_type,
                summary=summary,
                description=description
            )
            logger.info(f"Created JIRA ticket: {jira_ticket}")
            if not jira_ticket or 'key' not in jira_ticket:
                raise HTTPException(status_code=500, detail="Failed to create JIRA ticket")

            # Save reference to the ticket in the database
            with db.get_db_session(settings.db_url) as session:
                db_ticket = db.create_ticket(
                    session=session,
                    username=username,
                    fsp_name=fsp_name,
                    path=path,
                    ticket_key=jira_ticket['key']
                )
                if db_ticket is None:
                    raise HTTPException(status_code=500, detail="Failed to create ticket entry in database")

                # Get the full ticket details from JIRA 
                ticket_details = get_jira_ticket_details(jira_ticket['key'])

                # Return DTO with details from both JIRA and database
                ticket = _convert_ticket(db_ticket)
                ticket.populate_details(ticket_details)
                return ticket

        except Exception as e:
            logger.exception(f"Error creating ticket: {e}")
            raise HTTPException(status_code=500, detail=str(e))


    @api.get("/ticket", response_model=List[Ticket],
             description="Retrieve tickets for a user")
    async def get_tickets(fsp_name: Optional[str] = Query(None, description="The name of the file share path that the ticket is associated with"),
                          path: Optional[str] = Query(None, description="The path that the ticket is associated with")):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            
            db_tickets = db.get_tickets(session, username, fsp_name, path)
            if not db_tickets:
                raise HTTPException(status_code=404, detail="No tickets found for this user")

            tickets = []
            for db_ticket in db_tickets:
                ticket = _convert_ticket(db_ticket)
                tickets.append(ticket)
                try:
                    ticket_details = get_jira_ticket_details(db_ticket.ticket_key)
                    ticket.populate_details(ticket_details)
                except Exception as e:
                    logger.warning(f"Could not retrieve details for ticket {db_ticket.ticket_key}: {e}")
                    ticket.description = f"Ticket {db_ticket.ticket_key} is no longer available in JIRA"
                    ticket.status = "Deleted"
                
            return tickets


    @api.delete("/ticket/{ticket_key}",
                description="Delete a ticket by its key")
    async def delete_ticket(ticket_key: str):
        try:
            delete_jira_ticket(ticket_key)
            with db.get_db_session(settings.db_url) as session:
                db.delete_ticket(session, ticket_key)
            return {"message": f"Ticket {ticket_key} deleted"}
        except Exception as e:
            if str(e) == "Issue Does Not Exist":
                raise HTTPException(status_code=404, detail=str(e))
            else:
                logger.exception(f"Error deleting ticket: {e}")
                raise HTTPException(status_code=500, detail=str(e))


    @api.get("/preference", response_model=Dict[str, Dict],
             description="Get all preferences for a user")
    async def get_preferences():
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            return db.get_all_user_preferences(session, username)


    @api.get("/preference/{key}", response_model=Optional[Dict],
             description="Get a specific preference for a user")
    async def get_preference(key: str):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, key)
            if pref is None:
                raise HTTPException(status_code=404, detail="Preference not found")
            return pref


    @api.put("/preference/{key}",
             description="Set a preference for a user")
    async def set_preference(key: str, value: Dict):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            db.set_user_preference(session, username, key, value)
            return {"message": f"Preference {key} set for user {username}"}


    @api.delete("/preference/{key}",
                description="Delete a preference for a user")
    async def delete_preference(key: str):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            deleted = db.delete_user_preference(session, username, key)
            if not deleted:
                raise HTTPException(status_code=404, detail="Preference not found")
            return {"message": f"Preference {key} deleted for user {username}"}


    @api.post("/proxied-path", response_model=ProxiedPath,
              description="Create a new proxied path")
    async def create_proxied_path(fsp_name: str = Query(..., description="The name of the file share path that this proxied path is associated with"),
                                  path: str = Query(..., description="The path relative to the file share path mount point")):

        username = get_current_user()
        sharing_name = os.path.basename(path)
        logger.info(f"Creating proxied path for {username} with sharing name {sharing_name} and fsp_name {fsp_name} and path {path}")
        with db.get_db_session(settings.db_url) as session:
            try:
                new_path = db.create_proxied_path(session, username, sharing_name, fsp_name, path)
                return _convert_proxied_path(new_path, settings.external_proxy_url)
            except ValueError as e:
                logger.error(f"Error creating proxied path: {e}")
                raise HTTPException(status_code=400, detail=str(e))


    @api.get("/proxied-path", response_model=ProxiedPathResponse,
             description="Query proxied paths for a user")
    async def get_proxied_paths(fsp_name: str = Query(None, description="The name of the file share path that this proxied path is associated with"),
                                path: str = Query(None, description="The path being proxied")):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            db_proxied_paths = db.get_proxied_paths(session, username, fsp_name, path)
            proxied_paths = [_convert_proxied_path(db_path, settings.external_proxy_url) for db_path in db_proxied_paths]
            return ProxiedPathResponse(paths=proxied_paths)


    @api.get("/proxied-path/{sharing_key}", response_model=ProxiedPath,
             description="Retrieve a proxied path by sharing key")
    async def get_proxied_path(sharing_key: str = Path(..., description="The sharing key of the proxied path")):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            path = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if not path:
                raise HTTPException(status_code=404, detail="Proxied path not found for sharing key {sharing_key}")
            if path.username != username:
                raise HTTPException(status_code=404, detail="Proxied path not found for username {username} and sharing key {sharing_key}")
            return _convert_proxied_path(path, settings.external_proxy_url)


    @api.put("/proxied-path/{sharing_key}", description="Update a proxied path by sharing key")
    async def update_proxied_path(sharing_key: str = Path(..., description="The sharing key of the proxied path"),
                                  fsp_name: Optional[str] = Query(default=None, description="The name of the file share path that this proxied path is associated with"),
                                  path: Optional[str] = Query(default=None, description="The path relative to the file share path mount point"),
                                  sharing_name: Optional[str] = Query(default=None, description="The sharing path of the proxied path")):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            try:
                updated = db.update_proxied_path(session, username, sharing_key, new_path=path, new_sharing_name=sharing_name, new_fsp_name=fsp_name)
                return _convert_proxied_path(updated, settings.external_proxy_url)
            except ValueError as e:
                logger.error(f"Error updating proxied path: {e}")
                raise HTTPException(status_code=400, detail=str(e))


    @api.delete("/proxied-path/{sharing_key}", description="Delete a proxied path by sharing key")
    async def delete_proxied_path(sharing_key: str = Path(..., description="The sharing key of the proxied path")):
        username = get_current_user()
        with db.get_db_session(settings.db_url) as session:
            deleted = db.delete_proxied_path(session, username, sharing_key)
            if deleted == 0:
                raise HTTPException(status_code=404, detail="Proxied path not found")
            return {"message": f"Proxied path {sharing_key} deleted for user {username}"}


    @app.get("/files/{sharing_key}/{sharing_name}")
    @app.get("/files/{sharing_key}/{sharing_name}/{path:path}")
    async def target_dispatcher(request: Request,
                                sharing_key: str,
                                sharing_name: str,
                                path: str | None = '',
                                list_type: Optional[int] = Query(None, alias="list-type"),
                                continuation_token: Optional[str] = Query(None, alias="continuation-token"),
                                delimiter: Optional[str] = Query(None, alias="delimiter"),
                                encoding_type: Optional[str] = Query(None, alias="encoding-type"),
                                fetch_owner: Optional[bool] = Query(None, alias="fetch-owner"),
                                max_keys: Optional[int] = Query(1000, alias="max-keys"),
                                prefix: Optional[str] = Query(None, alias="prefix"),
                                start_after: Optional[str] = Query(None, alias="start-after")):

        if 'acl' in request.query_params:
            return get_read_access_acl()

        client, ctx = _get_file_proxy_client(sharing_key, sharing_name)
        if isinstance(client, Response):
            return client

        if list_type:
            if list_type == 2:
                with ctx:
                    return await client.list_objects_v2(continuation_token, delimiter, \
                        encoding_type, fetch_owner, max_keys, prefix, start_after)
            else:
                return get_error_response(400, "InvalidArgument", f"Invalid list type {list_type}", path)
        else:
            range_header = request.headers.get("range")
            with ctx:
                return await client.get_object(path, range_header)


    @app.head("/files/{sharing_key}/{sharing_name}/{path:path}")
    async def head_object(sharing_key: str, sharing_name: str, path: str):
        try:
            client, ctx = _get_file_proxy_client(sharing_key, sharing_name)
            if isinstance(client, Response):
                return client
            with ctx:
                return await client.head_object(path)
        except:
            logger.opt(exception=sys.exc_info()).info("Error requesting head")
            return get_error_response(500, "InternalError", "Error requesting HEAD", path)

    # Helper functions for file handlers
    def _format_timestamp(timestamp):
        """Format the given timestamp to ISO date format compatible with HTTP."""
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        return dt.isoformat()

    def _guess_content_type(filename):
        """A wrapper for guess_type which deals with unknown MIME types"""
        content_type, _ = guess_type(filename)
        if content_type:
            return content_type
        else:
            if filename.endswith('.yaml'):
                return 'text/plain+yaml'
            else:
                return 'application/octet-stream'

    def _get_mounted_filestore(fsp: FileSharePath):
        """Constructs a filestore for the given file share path, checking to make sure it is mounted."""
        filestore = Filestore(fsp)
        try:
            filestore.get_file_info(None)
        except FileNotFoundError:
            return None
        return filestore

    def _get_filestore(path_name: str):
        """Get a filestore for the given path name."""
        # Get file share path from database or settings
        file_share_mounts = settings.file_share_mounts
        fsp = None

        if file_share_mounts:
            for mount in file_share_mounts:
                name = slugify_path(mount.mount_path)
                if name == path_name:
                    fsp = FileSharePath(
                        name=name,
                        zone='Local',
                        group='local',
                        storage='local',
                        mount_path=mount.mount_path,
                        mac_path=mount.mount_path,
                        windows_path=mount.mount_path,
                        linux_path=mount.mount_path,
                    )
                    break
        else:
            with db.get_db_session(settings.db_url) as session:
                db_paths = db.get_all_paths(session)
                for path in db_paths:
                    if path.name == path_name:
                        fsp = FileSharePath(
                            name=path.name,
                            zone=path.zone,
                            group=path.group,
                            storage=path.storage,
                            mount_path=path.mount_path,
                            mac_path=path.mac_path,
                            windows_path=path.windows_path,
                            linux_path=path.linux_path,
                        )
                        break

        if fsp is None:
            return None, f"File share path '{path_name}' not found"

        # Create a filestore for the file share path
        filestore = _get_mounted_filestore(fsp)
        if filestore is None:
            return None, f"File share path '{path_name}' is not mounted"

        return filestore, None

    def _parse_range_header(range_header: str, file_size: int):
        """Parse HTTP Range header and return start and end byte positions."""
        if not range_header or not range_header.startswith('bytes='):
            return None

        try:
            range_spec = range_header[6:]  # Remove 'bytes=' prefix

            if ',' in range_spec:
                range_spec = range_spec.split(',')[0].strip()

            if '-' not in range_spec:
                return None

            start_str, end_str = range_spec.split('-', 1)

            if start_str and end_str:
                start = int(start_str)
                end = int(end_str)
            elif start_str and not end_str:
                start = int(start_str)
                end = file_size - 1
            elif not start_str and end_str:
                suffix_length = int(end_str)
                start = max(0, file_size - suffix_length)
                end = file_size - 1
            else:
                return None

            if start < 0 or end < 0 or start >= file_size or start > end:
                return None

            end = min(end, file_size - 1)
            return (start, end)

        except (ValueError, IndexError):
            return None

    # Profile endpoint
    @api.get("/profile", description="Get the current user's profile")
    async def get_profile():
        """Get the current user's profile"""
        username = get_current_user()
        home_directory_path = os.path.expanduser(f"~{username}")
        home_directory_name = os.path.basename(home_directory_path)
        home_parent = os.path.dirname(home_directory_path)

        # Find matching file share path for home directory
        home_fsp_name = None
        file_share_mounts = settings.file_share_mounts
        if file_share_mounts:
            for mount in file_share_mounts:
                if mount.mount_path == home_parent:
                    home_fsp_name = slugify_path(mount.mount_path)
                    break
        else:
            with db.get_db_session(settings.db_url) as session:
                paths = db.get_all_paths(session)
                for fsp in paths:
                    if fsp.mount_path == home_parent:
                        home_fsp_name = fsp.name
                        break

        # Get user groups
        user_groups = []
        try:
            user_info = pwd.getpwnam(username)
            all_groups = grp.getgrall()
            for group in all_groups:
                if username in group.gr_mem:
                    user_groups.append(group.gr_name)
            primary_group = grp.getgrgid(user_info.pw_gid).gr_name
            if primary_group not in user_groups:
                user_groups.append(primary_group)
        except Exception as e:
            logger.error(f"Error getting groups for user {username}: {str(e)}")

        return {
            "username": username,
            "homeFileSharePathName": home_fsp_name,
            "homeDirectoryName": home_directory_name,
            "groups": user_groups,
        }

    # File content endpoint
    @api.head("/content/{path_name:path}")
    async def head_file_content(path_name: str, subpath: Optional[str] = Query('')):
        """Handle HEAD requests to get file metadata without content"""
        logger.info(f"HEAD /api/content/{path_name} subpath={subpath}")

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        filestore, error = _get_filestore(filestore_name)
        if filestore is None:
            raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

        file_name = subpath.split('/')[-1] if subpath else ''
        content_type = _guess_content_type(file_name)

        try:
            file_info = filestore.get_file_info(subpath)

            headers = {
                'Accept-Ranges': 'bytes',
            }

            if content_type == 'application/octet-stream' and file_name:
                headers['Content-Disposition'] = f'attachment; filename="{file_name}"'

            if hasattr(file_info, 'size') and file_info.size is not None:
                headers['Content-Length'] = str(file_info.size)

            if hasattr(file_info, 'last_modified') and file_info.last_modified is not None:
                headers['Last-Modified'] = _format_timestamp(file_info.last_modified)

            return Response(status_code=200, headers=headers, media_type=content_type)

        except FileNotFoundError:
            logger.error(f"File not found in {filestore_name}: {subpath}")
            raise HTTPException(status_code=404, detail="File not found")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

    @api.get("/content/{path_name:path}")
    async def get_file_content(request: Request, path_name: str, subpath: Optional[str] = Query('')):
        """Handle GET requests to get file content, with HTTP Range header support"""
        logger.info(f"GET /api/content/{path_name} subpath={subpath}")

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        filestore, error = _get_filestore(filestore_name)
        if filestore is None:
            raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

        file_name = subpath.split('/')[-1] if subpath else ''
        content_type = _guess_content_type(file_name)

        try:
            file_info = filestore.get_file_info(subpath)
            if file_info.is_dir:
                raise HTTPException(status_code=400, detail="Cannot download directory content")

            file_size = file_info.size
            range_header = request.headers.get('Range')

            if range_header:
                range_result = _parse_range_header(range_header, file_size)
                if range_result is None:
                    return Response(
                        status_code=416,
                        headers={'Content-Range': f'bytes */{file_size}'}
                    )

                start, end = range_result
                content_length = end - start + 1

                headers = {
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(content_length),
                    'Content-Range': f'bytes {start}-{end}/{file_size}',
                }

                if content_type == 'application/octet-stream' and file_name:
                    headers['Content-Disposition'] = f'attachment; filename="{file_name}"'

                return StreamingResponse(
                    filestore.stream_file_range(subpath, start, end),
                    status_code=206,
                    headers=headers,
                    media_type=content_type
                )
            else:
                headers = {
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(file_size),
                }

                if content_type == 'application/octet-stream' and file_name:
                    headers['Content-Disposition'] = f'attachment; filename="{file_name}"'

                return StreamingResponse(
                    filestore.stream_file_contents(subpath),
                    status_code=200,
                    headers=headers,
                    media_type=content_type
                )

        except FileNotFoundError:
            logger.error(f"File not found in {filestore_name}: {subpath}")
            raise HTTPException(status_code=404, detail="File or directory not found")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

    # File metadata endpoint (browsing)
    @api.get("/files/{path_name}")
    async def get_file_metadata(path_name: str, subpath: Optional[str] = Query('')):
        """Handle GET requests to list directory contents or return info for the file/folder itself"""
        logger.info(f"GET /api/files/{path_name} subpath={subpath}")

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        filestore, error = _get_filestore(filestore_name)
        if filestore is None:
            raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

        try:
            current_user = os.getenv("USER", "unknown")
            file_info = filestore.get_file_info(subpath, current_user)
            logger.info(f"File info: {file_info}")

            result = {"info": json.loads(file_info.model_dump_json())}

            if file_info.is_dir:
                try:
                    files = list(filestore.yield_file_infos(subpath, current_user))
                    result["files"] = [json.loads(f.model_dump_json()) for f in files]
                except PermissionError:
                    logger.error(f"Permission denied when listing files in directory: {subpath}")
                    result["files"] = []
                    result["error"] = "Permission denied when listing directory contents"
                    return JSONResponse(content=result, status_code=403)
                except FileNotFoundError:
                    logger.error(f"Directory not found during listing: {subpath}")
                    result["files"] = []
                    result["error"] = "Directory contents not found"
                    return JSONResponse(content=result, status_code=404)

            return result

        except FileNotFoundError:
            logger.error(f"File or directory not found: {subpath}")
            raise HTTPException(status_code=404, detail="File or directory not found")
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

    @api.post("/files/{path_name}")
    async def create_file_or_dir(path_name: str, subpath: Optional[str] = Query(''), body: Dict = Body(...)):
        """Handle POST requests to create a new file or directory"""
        logger.info(f"POST /api/files/{path_name} subpath={subpath}")
        filestore, error = _get_filestore(path_name)
        if filestore is None:
            raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

        try:
            file_type = body.get("type")
            if file_type == "directory":
                logger.info(f"Creating {subpath} as a directory")
                filestore.create_dir(subpath)
            elif file_type == "file":
                logger.info(f"Creating {subpath} as a file")
                filestore.create_empty_file(subpath)
            else:
                raise HTTPException(status_code=400, detail="Invalid file type")

        except FileExistsError:
            raise HTTPException(status_code=409, detail="A file or directory with this name already exists")
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))

        return Response(status_code=201)

    @api.patch("/files/{path_name}")
    async def update_file_or_dir(path_name: str, subpath: Optional[str] = Query(''), body: Dict = Body(...)):
        """Handle PATCH requests to rename or update file permissions"""
        logger.info(f"PATCH /api/files/{path_name} subpath={subpath}")
        filestore, error = _get_filestore(path_name)
        if filestore is None:
            raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

        current_user = os.getenv("USER", "unknown")
        old_file_info = filestore.get_file_info(subpath, current_user)
        new_path = body.get("path")
        new_permissions = body.get("permissions")

        try:
            if new_permissions is not None and new_permissions != old_file_info.permissions:
                logger.info(f"Changing permissions of {old_file_info.path} to {new_permissions}")
                filestore.change_file_permissions(subpath, new_permissions)

            if new_path is not None and new_path != old_file_info.path:
                logger.info(f"Renaming {old_file_info.path} to {new_path}")
                filestore.rename_file_or_dir(old_file_info.path, new_path)

        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except OSError as e:
            raise HTTPException(status_code=500, detail=str(e))

        return Response(status_code=204)

    @api.delete("/files/{path_name}")
    async def delete_file_or_dir(path_name: str, subpath: Optional[str] = Query('')):
        """Handle DELETE requests to remove a file or (empty) directory"""
        logger.info(f"DELETE /api/files/{path_name} subpath={subpath}")
        filestore, error = _get_filestore(path_name)
        if filestore is None:
            raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

        try:
            filestore.remove_file_or_dir(subpath)
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))

        return Response(status_code=204)

    # Include the API router
    app.include_router(api)

    # Catch-all route to serve SPA index.html for any unmatched routes
    # This must be the LAST route registered
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve index.html for all SPA routes (client-side routing)"""
        # Don't handle /api/* or /assets/* - let them 404 properly
        if full_path.startswith("api/") or full_path.startswith("assets/"):
            raise HTTPException(status_code=404, detail="Not found")

        # Serve logo.svg and other root-level static files
        if full_path:
            file_path = ui_dir / full_path
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)

        # Otherwise serve index.html for SPA routing
        index_path = ui_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path, media_type="text/html")
        raise HTTPException(status_code=404, detail="Not found")

    return app


app = create_app(get_settings())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, lifespan="on")
