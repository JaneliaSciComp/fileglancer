import os
import sys
from datetime import datetime, timezone
from functools import cache
from pathlib import Path as PathLib
from typing import List, Optional, Dict, Tuple

try:
    import tomllib
except ImportError:
    import tomli as tomllib

import yaml
from loguru import logger
from pydantic import HttpUrl
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response,JSONResponse, PlainTextResponse
from fastapi.exceptions import RequestValidationError, StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from urllib.parse import quote

from fileglancer import database as db
from fileglancer.model import FileSharePath, FileSharePathResponse, Ticket, ProxiedPath, ProxiedPathResponse, ExternalBucket, ExternalBucketResponse, Notification, NotificationResponse
from fileglancer.settings import get_settings
from fileglancer.issues import create_jira_ticket, get_jira_ticket_details, delete_jira_ticket
from fileglancer.utils import slugify_path
from fileglancer.proxy_context import ProxyContext, AccessFlagsProxyContext

from x2s3.utils import get_read_access_acl, get_nosuchbucket_response, get_error_response
from x2s3.client_file import FileProxyClient


# Read version once at module load time
def _read_version() -> str:
    """Read version from package metadata or pyproject.toml file"""
    try:
        # First try to get version from installed package metadata
        from importlib.metadata import version
        return version("fileglancer-central")
    except Exception:
        # Fallback to reading from pyproject.toml during development
        try:
            # Use os.path instead of Path to avoid any Path-related issues
            current_file = os.path.abspath(__file__)
            current_dir = os.path.dirname(current_file)
            project_root = os.path.dirname(current_dir)
            pyproject_path = os.path.join(project_root, "pyproject.toml")

            with open(pyproject_path, "rb") as f:
                data = tomllib.load(f)

            return data["project"]["version"]
        except Exception as e:
            logger.warning(f"Could not read version from package metadata or pyproject.toml: {e}")
            return "unknown"

APP_VERSION = _read_version()


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

    # Mount the static UI files
    ui_dir = PathLib(__file__).parent / "ui"
    if ui_dir.exists():
        app.mount("/fg", StaticFiles(directory=str(ui_dir), html=True), name="ui")
        logger.info(f"Mounted UI at /fg from {ui_dir}")
    else:
        logger.warning(f"UI directory not found at {ui_dir}")

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request, exc):
        return JSONResponse({"error":str(exc.detail)}, status_code=exc.status_code)


    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request, exc):
        return JSONResponse({"error":str(exc)}, status_code=400)
    

    @app.get('/robots.txt', response_class=PlainTextResponse)
    def robots():
        return """User-agent: *\nDisallow: /"""


    @app.get("/version", response_model=dict,
             description="Get the current version of the server")
    async def version_endpoint():
        return {"version": APP_VERSION}


    @app.get("/file-share-paths", response_model=FileSharePathResponse,
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

    @app.get("/external-buckets", response_model=ExternalBucketResponse,
             description="Get all external buckets from the database")
    async def get_external_buckets() -> ExternalBucketResponse:
        buckets = _get_external_buckets(settings.db_url)
        return ExternalBucketResponse(buckets=buckets)


    @app.get("/external-buckets/{fsp_name}", response_model=ExternalBucketResponse,
             description="Get the external buckets for a given FSP name")
    async def get_external_buckets(fsp_name: str) -> ExternalBucket:
        buckets = _get_external_buckets(settings.db_url, fsp_name)
        return ExternalBucketResponse(buckets=buckets)


    @app.get("/notifications", response_model=NotificationResponse,
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


    @app.post("/ticket", response_model=Ticket,
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


    @app.get("/ticket/{username}", response_model=List[Ticket],
             description="Retrieve tickets for a user")
    async def get_tickets(username: str = Path(..., description="The username of the user who created the tickets"),
                          fsp_name: Optional[str] = Query(None, description="The name of the file share path that the ticket is associated with"),
                          path: Optional[str] = Query(None, description="The path that the ticket is associated with")):
        
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


    @app.delete("/ticket/{ticket_key}",
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


    @app.get("/preference/{username}", response_model=Dict[str, Dict],
             description="Get all preferences for a user")
    async def get_preferences(username: str):
        with db.get_db_session(settings.db_url) as session:
            return db.get_all_user_preferences(session, username)


    @app.get("/preference/{username}/{key}", response_model=Optional[Dict],
             description="Get a specific preference for a user")
    async def get_preference(username: str, key: str):
        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, key)
            if pref is None:
                raise HTTPException(status_code=404, detail="Preference not found")
            return pref


    @app.put("/preference/{username}/{key}",
             description="Set a preference for a user")
    async def set_preference(username: str, key: str, value: Dict):
        with db.get_db_session(settings.db_url) as session:
            db.set_user_preference(session, username, key, value)
            return {"message": f"Preference {key} set for user {username}"}


    @app.delete("/preference/{username}/{key}",
                description="Delete a preference for a user")
    async def delete_preference(username: str, key: str):
        with db.get_db_session(settings.db_url) as session:
            deleted = db.delete_user_preference(session, username, key)
            if not deleted:
                raise HTTPException(status_code=404, detail="Preference not found")
            return {"message": f"Preference {key} deleted for user {username}"}


    @app.post("/proxied-path/{username}", response_model=ProxiedPath,
              description="Create a new proxied path")
    async def create_proxied_path(username: str = Path(..., description="The username of the user who owns this proxied path"),
                                  fsp_name: str = Query(..., description="The name of the file share path that this proxied path is associated with"),
                                  path: str = Query(..., description="The path relative to the file share path mount point")):

        sharing_name = os.path.basename(path)
        logger.info(f"Creating proxied path for {username} with sharing name {sharing_name} and fsp_name {fsp_name} and path {path}")
        with db.get_db_session(settings.db_url) as session:
            try:
                new_path = db.create_proxied_path(session, username, sharing_name, fsp_name, path)
                return _convert_proxied_path(new_path, settings.external_proxy_url)
            except ValueError as e:
                logger.error(f"Error creating proxied path: {e}")
                raise HTTPException(status_code=400, detail=str(e))


    @app.get("/proxied-path/{username}", response_model=ProxiedPathResponse,
             description="Query proxied paths for a user")
    async def get_proxied_paths(username: str = Path(..., description="The username of the user who owns the proxied paths"),
                                fsp_name: str = Query(None, description="The name of the file share path that this proxied path is associated with"),
                                path: str = Query(None, description="The path being proxied")):
        with db.get_db_session(settings.db_url) as session:
            db_proxied_paths = db.get_proxied_paths(session, username, fsp_name, path)
            proxied_paths = [_convert_proxied_path(db_path, settings.external_proxy_url) for db_path in db_proxied_paths]
            return ProxiedPathResponse(paths=proxied_paths)


    @app.get("/proxied-path/{username}/{sharing_key}", response_model=ProxiedPath,
             description="Retrieve a proxied path by sharing key")
    async def get_proxied_path(username: str = Path(..., description="The username of the user who owns the proxied paths"),
                               sharing_key: str = Path(..., description="The sharing key of the proxied path")):
        with db.get_db_session(settings.db_url) as session:
            path = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if not path:
                raise HTTPException(status_code=404, detail="Proxied path not found")
            if path.username != username:
                raise HTTPException(status_code=404, detail="Proxied path not found for user {username}")
            return _convert_proxied_path(path, settings.external_proxy_url)


    @app.put("/proxied-path/{username}/{sharing_key}", description="Update a proxied path by sharing key")
    async def update_proxied_path(username: str = Path(..., description="The username of the user who owns the proxied paths"),
                                  sharing_key: str = Path(..., description="The sharing key of the proxied path"),
                                  fsp_name: Optional[str] = Query(default=None, description="The name of the file share path that this proxied path is associated with"),
                                  path: Optional[str] = Query(default=None, description="The path relative to the file share path mount point"),
                                  sharing_name: Optional[str] = Query(default=None, description="The sharing path of the proxied path")):
        with db.get_db_session(settings.db_url) as session:
            try:
                updated = db.update_proxied_path(session, username, sharing_key, new_path=path, new_sharing_name=sharing_name, new_fsp_name=fsp_name)
                return _convert_proxied_path(updated, settings.external_proxy_url)
            except ValueError as e:
                logger.error(f"Error updating proxied path: {e}")
                raise HTTPException(status_code=400, detail=str(e))


    @app.delete("/proxied-path/{username}/{sharing_key}", description="Delete a proxied path by sharing key")
    async def delete_proxied_path(username: str = Path(..., description="The username of the user who owns the proxied paths"),
                                  sharing_key: str = Path(..., description="The sharing key of the proxied path")):
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

    return app


app = create_app(get_settings())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, lifespan="on")
