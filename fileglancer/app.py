import os
import sys
import pwd
import grp
import json
import secrets
from datetime import datetime, timedelta, timezone, UTC
from functools import cache
from pathlib import Path as PathLib
from typing import List, Optional, Dict, Tuple, Generator

try:
    import tomllib
except ImportError:
    import tomli as tomllib

import yaml
from loguru import logger
from pydantic import HttpUrl
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Query, Path, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response, JSONResponse, PlainTextResponse, StreamingResponse, FileResponse
from fastapi.exceptions import RequestValidationError, StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from urllib.parse import quote, unquote

from fileglancer import database as db
from fileglancer import auth
from fileglancer.model import *
from fileglancer.settings import get_settings
from fileglancer.issues import create_jira_ticket, get_jira_ticket_details, delete_jira_ticket
from fileglancer.utils import format_timestamp, guess_content_type, parse_range_header
from fileglancer.user_context import UserContext, EffectiveUserContext, CurrentUserContext
from fileglancer.filestore import Filestore
from fileglancer.log import AccessLogMiddleware

from x2s3.utils import get_read_access_acl, get_nosuchbucket_response, get_error_response
from x2s3.client_file import FileProxyClient
from x2s3.client import ObjectHandle


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
            package_json_path = os.path.join(project_root, "frontend", "package.json")

            with open(package_json_path, "r") as f:
                data = json.load(f)

            return data["version"]
        except Exception as e:
            logger.warning(f"Could not read version from package metadata or package.json: {e}")
            return "unknown"

APP_VERSION = _read_version()


def get_current_user(request: Request):
    """
    FastAPI dependency to get the current authenticated user

    If OKTA auth is enabled, validates session from cookie
    If OKTA auth is disabled, falls back to $USER environment variable
    """
    return auth.get_current_user(request, get_settings())


def _convert_external_bucket(db_bucket: db.ExternalBucketDB) -> ExternalBucket:
    return ExternalBucket(
        id=db_bucket.id,
        full_path=db_bucket.full_path,
        external_url=db_bucket.external_url,
        fsp_name=db_bucket.fsp_name,
        relative_path=db_bucket.relative_path
    )


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


def _validate_filename(name: str) -> None:
    """
    Validate that a filename/dirname is safe and only refers to a single item in the current directory.

    Args:
        name: The filename or directory name to validate

    Raises:
        HTTPException: If the name is invalid
    """
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="File or directory name cannot be empty")

    # Check for path separators (would create in subdirectory)
    if '/' in name:
        raise HTTPException(status_code=400, detail="File or directory name cannot contain path separators ('/')")

    # Check for null bytes (security issue)
    if '\0' in name:
        raise HTTPException(status_code=400, detail="File or directory name cannot contain null bytes")

    # Check for special directory references
    if name == '.' or name == '..':
        raise HTTPException(status_code=400, detail="File or directory name cannot be '.' or '..'")

    # Check for leading/trailing whitespace (can cause issues)
    if name != name.strip():
        raise HTTPException(status_code=400, detail="File or directory name cannot have leading or trailing whitespace")


def create_app(settings):

    # Initialize OAuth client for OKTA
    oauth = auth.setup_oauth(settings)

    # Define ui_dir for serving static files and SPA
    ui_dir = PathLib(__file__).parent / "ui"

    def _get_user_context(username: str) -> UserContext:
        if settings.use_access_flags:
            return EffectiveUserContext(username)
        else:
            return CurrentUserContext()


    def _get_file_proxy_client(sharing_key: str, sharing_name: str) -> Tuple[FileProxyClient, UserContext] | Tuple[Response, None]:
        with db.get_db_session(settings.db_url) as session:

            proxied_path = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if not proxied_path:
                return get_nosuchbucket_response(sharing_name), None

            # Vol-E viewer sends URLs with literal % characters (not URL-encoded)
            # FastAPI automatically decodes path parameters - % chars are treated as escapes, creating a garbled sharing_name if they're present
            # We therefore need to handle two cases:
            #   1. Properly encoded requests (sharing_name matches DB value of proxied_path.sharing_name)
            #   2. Vol-E's unencoded requests (unquote(proxied_path.sharing_name) matches the garbled request value)
            if proxied_path.sharing_name != sharing_name and unquote(proxied_path.sharing_name) != sharing_name:
                return get_error_response(400, "InvalidArgument", f"Sharing name mismatch for sharing key {sharing_key}", sharing_name), None

            fsp = db.get_file_share_path(session, proxied_path.fsp_name)
            if not fsp:
                return get_error_response(400, "InvalidArgument", f"File share path {proxied_path.fsp_name} not found", sharing_name), None
            # Expand ~ to user's home directory before constructing the mount path
            expanded_mount_path = os.path.expanduser(fsp.mount_path)
            mount_path = f"{expanded_mount_path}/{proxied_path.path}"
            return FileProxyClient(proxy_kwargs={'target_name': sharing_name}, path=mount_path), _get_user_context(proxied_path.username)


    @asynccontextmanager
    async def lifespan(app: FastAPI):

        # Configure logging based on the log level in the settings
        logger.remove()
        logger.add(sys.stderr, level=settings.log_level)

        def mask_password(url: str) -> str:
            """Mask password in database URL for logging"""
            import re
            return re.sub(r'(://[^:]+:)[^@]+(@)', r'\1****\2', url)

        logger.debug(f"Settings:")
        logger.debug(f"  log_level: {settings.log_level}")
        logger.debug(f"  db_url: {mask_password(settings.db_url)}")
        if settings.db_admin_url:
            logger.debug(f"  db_admin_url: {mask_password(settings.db_admin_url)}")
        logger.debug(f"  use_access_flags: {settings.use_access_flags}")
        logger.debug(f"  external_proxy_url: {settings.external_proxy_url}")
        logger.debug(f"  atlassian_url: {settings.atlassian_url}")

        # Initialize database (run migrations once at startup)
        db.initialize_database(settings.db_url)

        # Mount static assets (CSS, JS, images) at /fg/assets
        assets_dir = ui_dir / "assets"
        if assets_dir.exists():
            app.mount("/fg/assets", StaticFiles(directory=str(assets_dir)), name="assets")
            logger.debug(f"Mounted static assets at /fg/assets from {assets_dir}")
        else:
            logger.warning(f"Assets directory not found at {assets_dir}")

        # Check for notifications file at startup
        notifications_file = os.path.join(os.getcwd(), "notifications.yaml")
        if os.path.exists(notifications_file):
            logger.debug(f"Notifications file found: {notifications_file}")
        else:
            logger.debug(f"No notifications file found at {notifications_file}")

        logger.info(f"Server ready")
        yield
        # Cleanup (if needed)
        pass

    app = FastAPI(lifespan=lifespan)

    # Add custom access log middleware
    # This logs HTTP access information with authenticated username
    app.add_middleware(AccessLogMiddleware, settings=settings)

    # Generate random session_secret_key if not configured
    if settings.session_secret_key is None:
        settings.session_secret_key = secrets.token_urlsafe(32)
        logger.warning("Generated random secret key. Set session_secret_key in your config to enable persistent sessions.")

    # Add SessionMiddleware for OAuth state management
    # This is required by authlib for the OAuth flow
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret_key,
        session_cookie="oauth_session",
        max_age=3600,  # 1 hour for OAuth flow
        same_site="lax",
        https_only=settings.session_cookie_secure  # Match session cookie security setting
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["GET","HEAD","POST","PUT","PATCH","DELETE"],
        allow_headers=["*"],
        expose_headers=["Range", "Content-Range"],
    )


    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request, exc):
        return JSONResponse({"error":str(exc.detail)}, status_code=exc.status_code)


    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request, exc):
        return JSONResponse({"error":str(exc)}, status_code=400)


    @app.get('/robots.txt', response_class=PlainTextResponse, include_in_schema=False)
    def robots():
        return """User-agent: *\nDisallow: /"""


    @app.get("/api/version", response_model=dict,
             description="Get the current version of the server")
    async def version_endpoint():
        return {"version": APP_VERSION}


    # Authentication routes
    @app.get("/api/auth/login", include_in_schema=settings.enable_okta_auth,
             description="Initiate OKTA OAuth login flow")
    async def login(request: Request, next: Optional[str] = Query(None)):
        """Redirect to OKTA for authentication"""
        if not settings.enable_okta_auth:
            raise HTTPException(status_code=404, detail="OKTA authentication not enabled")

        # Store the next URL in the session for use after OAuth callback
        if next and next.startswith("/fg/"):
            request.session['next_url'] = next

        redirect_uri = str(settings.okta_redirect_uri)
        return await oauth.okta.authorize_redirect(request, redirect_uri)


    @app.get("/api/oauth_callback", include_in_schema=settings.enable_okta_auth,
             description="OKTA OAuth callback endpoint")
    # the hub url is legacy from jupyterhub. Kept here for backwards compatibility with existing okta config.
    @app.get("/hub/oauth_callback", include_in_schema=settings.enable_okta_auth,
             description="OKTA OAuth callback endpoint")
    async def auth_callback(request: Request, response: Response):
        """Handle OKTA OAuth callback"""
        if not settings.enable_okta_auth:
            raise HTTPException(status_code=404, detail="OKTA authentication not enabled")

        try:
            # Exchange authorization code for tokens
            token = await oauth.okta.authorize_access_token(request)

            # Extract user info from ID token
            id_token = token.get('id_token')
            user_info = token.get('userinfo')

            if not user_info:
                # Decode ID token if userinfo not provided
                user_info = auth.verify_id_token(id_token, settings)

            username = user_info.get('preferred_username') or user_info.get('email')
            email = user_info.get('email')

            if not username:
                raise HTTPException(status_code=400, detail="Unable to extract username from OKTA response")

            # Create session in database
            expires_at = datetime.now(UTC) + timedelta(hours=settings.session_expiry_hours)

            with db.get_db_session(settings.db_url) as session:
                user_session = db.create_session(
                    session=session,
                    username=username,
                    email=email,
                    expires_at=expires_at,
                    session_secret_key=settings.session_secret_key,
                    okta_access_token=token.get('access_token'),
                    okta_id_token=id_token
                )
                # Extract session_id while still in database session context
                session_id = user_session.session_id

            # Get the next URL from session (stored during initial login redirect)
            next_url = request.session.pop('next_url', '/fg/browse')

            # Validate next_url to prevent open redirect vulnerabilities
            if not next_url.startswith('/fg/'):
                next_url = '/fg/browse'

            # Create redirect response
            redirect_response = RedirectResponse(url=next_url)

            # Set session cookie on the redirect response
            auth.create_session_cookie(redirect_response, session_id, settings)

            logger.info(f"User {username} authenticated successfully via OKTA")

            # Return the redirect with the cookie
            return redirect_response

        except Exception as e:
            logger.exception(f"Authentication callback failed: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")


    @app.get("/api/auth/logout", description="Logout and clear session")
    @app.post("/api/auth/logout", description="Logout and clear session")
    async def logout(request: Request):
        """Logout user and delete session"""
        session_id = request.cookies.get(settings.session_cookie_name)

        if session_id:
            with db.get_db_session(settings.db_url) as session:
                db.delete_session(session, session_id)
                logger.info(f"Session {session_id} deleted")

        # Create redirect response to home page
        redirect_response = RedirectResponse(url="/", status_code=303)

        # Delete cookie on the redirect response
        auth.delete_session_cookie(redirect_response, settings)

        return redirect_response


    @app.get("/api/auth/cli-login", include_in_schema=False,
             description="Auto-login endpoint for CLI users")
    async def cli_login(request: Request, session_id: str):
        """Auto-login for CLI users - sets session cookie and redirects to browse page"""

        # Only allow this endpoint when running in CLI mode
        if not settings.cli_mode:
            raise HTTPException(status_code=404, detail="Not found")

        # Verify session exists in database
        with db.get_db_session(settings.db_url) as session:
            user_session = db.get_session_by_id(session, session_id)

            if not user_session:
                raise HTTPException(status_code=401, detail="Invalid session")

            # Access username while still in session context
            username = user_session.username

        # Create redirect response to browse page
        redirect_response = RedirectResponse(url="/fg/browse")

        # Set session cookie
        auth.create_session_cookie(redirect_response, session_id, settings)

        logger.info(f"User {username} auto-logged in via CLI")

        return redirect_response


    @app.get("/api/auth/status", description="Check authentication status")
    async def auth_status(request: Request):
        """Check if user is authenticated"""
        user_session = auth.get_session_from_cookie(request, settings)

        if user_session:
            auth_method = "okta" if settings.enable_okta_auth else "simple"
            return {
                "authenticated": True,
                "username": user_session.username,
                "email": user_session.email,
                "auth_method": auth_method
            }

        auth_method = "okta" if settings.enable_okta_auth else "simple"
        return {"authenticated": False, "auth_method": auth_method}


    @app.get("/api/file-share-paths", response_model=FileSharePathResponse,
             description="Get all file share paths from the database")
    async def get_file_share_paths() -> List[FileSharePath]:
        with db.get_db_session(settings.db_url) as session:
            paths = db.get_file_share_paths(session)
            return FileSharePathResponse(paths=paths)


    @app.get("/api/external-buckets", response_model=ExternalBucketResponse,
             description="Get all external buckets from the database")
    async def get_external_buckets() -> ExternalBucketResponse:
        with db.get_db_session(settings.db_url) as session:
            buckets = [_convert_external_bucket(bucket) for bucket in db.get_external_buckets(session)]
            return ExternalBucketResponse(buckets=buckets)


    @app.get("/api/external-buckets/{fsp_name}", response_model=ExternalBucketResponse,
             description="Get the external buckets for a given FSP name")
    async def get_external_buckets(fsp_name: str) -> ExternalBucket:
        with db.get_db_session(settings.db_url) as session:
            buckets = [_convert_external_bucket(bucket) for bucket in db.get_external_buckets(session, fsp_name)]
            return ExternalBucketResponse(buckets=buckets)


    @app.get("/api/notifications", response_model=NotificationResponse,
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
            logger.trace("Notifications file not found")
            return NotificationResponse(notifications=[])
        except Exception as e:
            logger.exception(f"Error loading notifications: {e}")
            return NotificationResponse(notifications=[])


    @app.post("/api/ticket", response_model=Ticket,
              description="Create a new ticket and return the key")
    async def create_ticket(
        body: dict,
        username: str = Depends(get_current_user)
    ):
        fsp_name = body.get("fsp_name")
        path = body.get("path")
        project_key = body.get("project_key")
        issue_type = body.get("issue_type")
        summary = body.get("summary")
        description = body.get("description")
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


    @app.get("/api/ticket", response_model=TicketResponse,
             description="Retrieve tickets for a user")
    async def get_tickets(fsp_name: Optional[str] = Query(None, description="The name of the file share path that the ticket is associated with"),
                          path: Optional[str] = Query(None, description="The path that the ticket is associated with"),
                          username: str = Depends(get_current_user)):

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

            return TicketResponse(tickets=tickets)


    @app.delete("/api/ticket/{ticket_key}",
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


    @app.get("/api/preference", response_model=Dict[str, Dict],
             description="Get all preferences for a user")
    async def get_preferences(username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            return db.get_all_user_preferences(session, username)


    @app.get("/api/preference/{key}", response_model=Optional[Dict],
             description="Get a specific preference for a user")
    async def get_preference(key: str, username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, key)
            if pref is None:
                raise HTTPException(status_code=404, detail="Preference not found")
            return pref


    @app.put("/api/preference/{key}",
             description="Set a preference for a user")
    async def set_preference(key: str, value: Dict, username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            db.set_user_preference(session, username, key, value)
            return {"message": f"Preference {key} set for user {username}"}


    @app.delete("/api/preference/{key}",
                description="Delete a preference for a user")
    async def delete_preference(key: str, username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            deleted = db.delete_user_preference(session, username, key)
            if not deleted:
                raise HTTPException(status_code=404, detail="Preference not found")
            return {"message": f"Preference {key} deleted for user {username}"}


    @app.post("/api/proxied-path", response_model=ProxiedPath,
              description="Create a new proxied path")
    async def create_proxied_path(fsp_name: str = Query(..., description="The name of the file share path that this proxied path is associated with"),
                                  path: str = Query(..., description="The path relative to the file share path mount point"),
                                  username: str = Depends(get_current_user)):

        sharing_name = os.path.basename(path)
        logger.info(f"Creating proxied path for {username} with sharing name {sharing_name} and fsp_name {fsp_name} and path {path}")
        with db.get_db_session(settings.db_url) as session:
            with _get_user_context(username): # Necessary to validate the user can access the proxied path
                try:
                    new_path = db.create_proxied_path(session, username, sharing_name, fsp_name, path)
                    return _convert_proxied_path(new_path, settings.external_proxy_url)
                except ValueError as e:
                    logger.error(f"Error creating proxied path: {e}")
                    raise HTTPException(status_code=400, detail=str(e))


    @app.get("/api/proxied-path", response_model=ProxiedPathResponse,
             description="Query proxied paths for a user")
    async def get_proxied_paths(fsp_name: str = Query(None, description="The name of the file share path that this proxied path is associated with"),
                                path: str = Query(None, description="The path being proxied"),
                                username: str = Depends(get_current_user)):

        with db.get_db_session(settings.db_url) as session:
            db_proxied_paths = db.get_proxied_paths(session, username, fsp_name, path)
            proxied_paths = [_convert_proxied_path(db_path, settings.external_proxy_url) for db_path in db_proxied_paths]
            return ProxiedPathResponse(paths=proxied_paths)


    @app.get("/api/proxied-path/{sharing_key}", response_model=ProxiedPath,
             description="Retrieve a proxied path by sharing key")
    async def get_proxied_path(sharing_key: str = Path(..., description="The sharing key of the proxied path"),
                               username: str = Depends(get_current_user)):

        with db.get_db_session(settings.db_url) as session:
            path = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if not path:
                raise HTTPException(status_code=404, detail="Proxied path not found for sharing key {sharing_key}")
            if path.username != username:
                raise HTTPException(status_code=404, detail="Proxied path not found for username {username} and sharing key {sharing_key}")
            return _convert_proxied_path(path, settings.external_proxy_url)


    @app.put("/api/proxied-path/{sharing_key}", description="Update a proxied path by sharing key")
    async def update_proxied_path(sharing_key: str = Path(..., description="The sharing key of the proxied path"),
                                  fsp_name: Optional[str] = Query(default=None, description="The name of the file share path that this proxied path is associated with"),
                                  path: Optional[str] = Query(default=None, description="The path relative to the file share path mount point"),
                                  sharing_name: Optional[str] = Query(default=None, description="The sharing path of the proxied path"),
                                  username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            with _get_user_context(username): # Necessary to validate the user can access the proxied path
                try:
                    updated = db.update_proxied_path(session, username, sharing_key, new_path=path, new_sharing_name=sharing_name, new_fsp_name=fsp_name)
                    return _convert_proxied_path(updated, settings.external_proxy_url)
                except ValueError as e:
                    logger.error(f"Error updating proxied path: {e}")
                    raise HTTPException(status_code=400, detail=str(e))


    @app.delete("/api/proxied-path/{sharing_key}", description="Delete a proxied path by sharing key")
    async def delete_proxied_path(sharing_key: str = Path(..., description="The sharing key of the proxied path"),
                                  username: str = Depends(get_current_user)):
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

            # Open file in user context, then immediately exit
            # The file descriptor retains access rights after we switch back to root
            with ctx:
                handle = await client.open_object(path, range_header)

            # Context exited! Now stream without holding the lock
            if isinstance(handle, ObjectHandle):
                return client.stream_object(handle)
            else:
                # Error response (e.g., file not found, invalid range)
                return handle


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
        # Get file share path using centralized function and filter for the requested path
        with db.get_db_session(settings.db_url) as session:
            fsp = db.get_file_share_path(session, path_name)
            if fsp is None:
                return None, f"File share path '{path_name}' not found"

        # Create a filestore for the file share path
        filestore = _get_mounted_filestore(fsp)
        if filestore is None:
            return None, f"File share path '{path_name}' is not mounted"

        return filestore, None


    # Profile endpoint
    @app.get("/api/profile", description="Get the current user's profile")
    async def get_profile(username: str = Depends(get_current_user)):
        """Get the current user's profile"""
        with _get_user_context(username):

            # Find matching file share path for home directory
            with db.get_db_session(settings.db_url) as session:
                paths = db.get_file_share_paths(session)

                # First, check if there's a "home" FSP (for ~/ paths)
                home_fsp = next((fsp for fsp in paths if fsp.mount_path in ('~', '~/')), None)
                if home_fsp:
                    home_directory_name = "."
                else:
                    # If no "home" FSP exists, fall back to finding by mount path
                    home_directory_path = os.path.expanduser(f"~{username}")
                    home_parent = os.path.dirname(home_directory_path)
                    home_fsp = next((fsp for fsp in paths if fsp.mount_path == home_parent), None)
                    home_directory_name = os.path.basename(home_directory_path)

                home_fsp_name = home_fsp.name if home_fsp else None

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
    @app.head("/api/content/{path_name:path}")
    async def head_file_content(path_name: str,
                                subpath: Optional[str] = Query(''),
                                username: str = Depends(get_current_user)):
        """Handle HEAD requests to get file metadata without content"""

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        with _get_user_context(username):
            filestore, error = _get_filestore(filestore_name)
            if filestore is None:
                raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

            file_name = subpath.split('/')[-1] if subpath else ''
            content_type = guess_content_type(file_name)

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
                    headers['Last-Modified'] = format_timestamp(file_info.last_modified)

                return Response(status_code=200, headers=headers, media_type=content_type)

            except FileNotFoundError:
                logger.warning(f"File not found in {filestore_name}: {subpath}")
                raise HTTPException(status_code=404, detail="File not found")
            except PermissionError:
                raise HTTPException(status_code=403, detail="Permission denied")


    @app.get("/api/content/{path_name:path}")
    async def get_file_content(request: Request, path_name: str, subpath: Optional[str] = Query(''), username: str = Depends(get_current_user)):
        """Handle GET requests to get file content, with HTTP Range header support"""

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        # Open file with user's permissions, then immediately release the context
        # The file descriptor retains the access rights after we switch back to root
        with _get_user_context(username):
            filestore, error = _get_filestore(filestore_name)
            if filestore is None:
                raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

            file_name = subpath.split('/')[-1] if subpath else ''
            content_type = guess_content_type(file_name)

            try:
                file_info = filestore.get_file_info(subpath)
                if file_info.is_dir:
                    raise HTTPException(status_code=400, detail="Cannot download directory content")

                file_size = file_info.size

                # Open the file while we have user's permissions
                full_path = filestore._check_path_in_root(subpath)
                file_handle = open(full_path, 'rb')

            except FileNotFoundError:
                logger.error(f"File not found in {filestore_name}: {subpath}")
                raise HTTPException(status_code=404, detail="File or directory not found")
            except PermissionError:
                raise HTTPException(status_code=403, detail="Permission denied")

        # Context exited! We're back to root, but file_handle retains user's access rights
        # Now we can stream the file asynchronously without holding the user context lock

        range_header = request.headers.get('Range')

        if range_header:
            range_result = parse_range_header(range_header, file_size)
            if range_result is None:
                file_handle.close()
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
                filestore.stream_file_range(start=start, end=end, file_handle=file_handle),
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
                filestore.stream_file_contents(file_handle=file_handle),
                status_code=200,
                headers=headers,
                media_type=content_type
            )


    @app.get("/api/files/{path_name}")
    async def get_file_metadata(path_name: str, subpath: Optional[str] = Query(''),
                                username: str = Depends(get_current_user)):
        """Handle GET requests to list directory contents or return info for the file/folder itself"""

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        with _get_user_context(username):
            filestore, error = _get_filestore(filestore_name)
            if filestore is None:
                raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

            try:
                file_info = filestore.get_file_info(subpath, username)
                logger.trace(f"File info: {file_info}")

                result = {"info": json.loads(file_info.model_dump_json())}

                if file_info.is_dir:
                    try:
                        files = list(filestore.yield_file_infos(subpath, username))
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


    @app.post("/api/files/{path_name}")
    async def create_file_or_dir(path_name: str,
                                 subpath: Optional[str] = Query(''),
                                 body: Dict = Body(...),
                                 username: str = Depends(get_current_user)):
        """Handle POST requests to create a new file or directory"""
        # Validate and sanitize the user-provided subpath to prevent path traversal attacks
        if not subpath:
            raise HTTPException(status_code=400, detail="File or directory path is required")

        # Normalize the path to prevent path traversal (e.g., "../../../etc/passwd")
        # This converts relative paths to a clean form and removes redundant separators
        normalized_path = os.path.normpath(subpath)

        # Security check: Ensure normalized path doesn't start with ".." or "/"
        # which would indicate an attempt to escape the intended directory
        if normalized_path.startswith('..') or os.path.isabs(normalized_path):
            raise HTTPException(status_code=400, detail="Path cannot escape the current directory")

        # Validate the filename portion (basename) for invalid characters
        filename = os.path.basename(normalized_path)
        _validate_filename(filename)

        # Use the validated and sanitized path for all operations
        validated_subpath = normalized_path

        with _get_user_context(username):
            filestore, error = _get_filestore(path_name)
            if filestore is None:
                raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

            try:
                file_type = body.get("type")
                if file_type == "directory":
                    logger.info(f"User {username} creating directory {path_name}/{validated_subpath}")
                    # Path is validated above - safe to use in filesystem operation
                    filestore.create_dir(validated_subpath)
                elif file_type == "file":
                    logger.info(f"User {username} creating file {path_name}/{validated_subpath}")
                    # Path is validated above - safe to use in filesystem operation
                    filestore.create_empty_file(validated_subpath)
                else:
                    raise HTTPException(status_code=400, detail="Invalid file type")

            except FileExistsError:
                raise HTTPException(status_code=409, detail="A file or directory with this name already exists")
            except PermissionError as e:
                raise HTTPException(status_code=403, detail=str(e))

            return Response(status_code=201)


    @app.patch("/api/files/{path_name}")
    async def update_file_or_dir(path_name: str,
                                 subpath: Optional[str] = Query(''),
                                 body: Dict = Body(...),
                                 username: str = Depends(get_current_user)):
        """Handle PATCH requests to rename or update file permissions"""
        with _get_user_context(username):
            filestore, error = _get_filestore(path_name)
            if filestore is None:
                raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)
            old_file_info = filestore.get_file_info(subpath, username)
            new_path = body.get("path")
            new_permissions = body.get("permissions")

            # Validate and sanitize new_path if renaming
            validated_new_path = new_path
            if new_path is not None and new_path != old_file_info.path:
                # Normalize the path to prevent path traversal
                normalized_new_path = os.path.normpath(new_path)

                # Security check: Ensure normalized path doesn't escape directory
                if normalized_new_path.startswith('..') or os.path.isabs(normalized_new_path):
                    raise HTTPException(status_code=400, detail="New path cannot escape the current directory")

                # Validate the filename portion for invalid characters
                new_filename = os.path.basename(normalized_new_path)
                _validate_filename(new_filename)

                # Use the validated path
                validated_new_path = normalized_new_path

            try:
                if new_permissions is not None and new_permissions != old_file_info.permissions:
                    logger.info(f"User {username} changing permissions of {old_file_info.absolute_path} to {new_permissions}")
                    filestore.change_file_permissions(subpath, new_permissions)

                if new_path is not None and new_path != old_file_info.path:
                    logger.info(f"User {username} renaming {old_file_info.absolute_path} to {validated_new_path}")
                    # Path is validated above - safe to use in filesystem operation
                    filestore.rename_file_or_dir(old_file_info.path, validated_new_path)

            except PermissionError as e:
                raise HTTPException(status_code=403, detail=str(e))
            except OSError as e:
                raise HTTPException(status_code=500, detail=str(e))

            return Response(status_code=204)


    @app.delete("/api/files/{fsp_name}")
    async def delete_file_or_dir(fsp_name: str,
                                 subpath: Optional[str] = Query(''),
                                 username: str = Depends(get_current_user)):
        """Handle DELETE requests to remove a file or (empty) directory"""
        with _get_user_context(username):
            filestore, error = _get_filestore(fsp_name)
            if filestore is None:
                raise HTTPException(status_code=404 if "not found" in error else 500, detail=error)

            try:
                logger.info(f"User {username} deleting {filestore.get_root_path()}/{subpath}")
                filestore.remove_file_or_dir(subpath)
            except PermissionError as e:
                raise HTTPException(status_code=403, detail=str(e))

            return Response(status_code=204)


    @app.post("/api/auth/simple-login", include_in_schema=not settings.enable_okta_auth)
    async def simple_login_handler(request: Request, body: dict = Body(...)):
        """Handle simple login JSON submission"""
        if settings.enable_okta_auth:
            raise HTTPException(status_code=404, detail="Use OKTA authentication")

        # Parse JSON body
        username = body.get("username")
        next_url = body.get("next", "/fg/browse")

        if not username or not username.strip():
            raise HTTPException(status_code=400, detail="Username is required")

        username = username.strip()

        # Validate next_url to prevent open redirect vulnerabilities
        # Only allow relative URLs that start with /fg/
        if not next_url.startswith("/fg/"):
            next_url = "/fg/browse"

        # Create session in database
        expires_at = datetime.now(UTC) + timedelta(hours=settings.session_expiry_hours)

        with db.get_db_session(settings.db_url) as session:
            user_session = db.create_session(
                session=session,
                username=username,
                email=None,  # No email for simple auth
                expires_at=expires_at,
                session_secret_key=settings.session_secret_key,
                okta_access_token=None,
                okta_id_token=None
            )
            session_id = user_session.session_id

        # Create JSON response with the next URL
        response = JSONResponse(content={"success": True, "username": username, "redirect": next_url})

        # Set session cookie
        auth.create_session_cookie(response, session_id, settings)

        logger.info(f"User {username} logged in via simple authentication")

        return response


    # Home page - redirect to /fg
    @app.get("/", include_in_schema=False)
    async def home_page():
        """Redirect root to /fg"""
        return RedirectResponse(url="/fg/")


    # Serve SPA at /fg/* for client-side routing
    # This must be the LAST route registered
    @app.get("/fg/{full_path:path}", include_in_schema=False)
    @app.get("/fg", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        """Serve index.html for all SPA routes under /fg/ (client-side routing)"""
        # Serve logo.svg and other root-level static files from ui directory
        if full_path and full_path != "/":
            file_path = ui_dir / full_path
            # Validate that the resolved path is under ui_dir (prevent path traversal)
            try:
                resolved_file_path = file_path.resolve(strict=False)
                resolved_ui_dir = ui_dir.resolve(strict=True)
                # Ensure that the requested file path is within the ui_dir to prevent path traversal
                try:
                    # Python 3.9+: use is_relative_to
                    if not resolved_file_path.is_relative_to(resolved_ui_dir):
                        raise HTTPException(status_code=400, detail="Invalid file path")
                except AttributeError:
                    # For Python < 3.9
                    try:
                        resolved_file_path.relative_to(resolved_ui_dir)
                    except ValueError:
                        raise HTTPException(status_code=400, detail="Invalid file path")
            except (ValueError, RuntimeError):
                raise HTTPException(status_code=400, detail="Invalid file path")
            if resolved_file_path.exists() and resolved_file_path.is_file():
                return FileResponse(resolved_file_path)

        # Otherwise serve index.html for SPA routing
        index_path = ui_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path, media_type="text/html")
        raise HTTPException(status_code=404, detail="Not found")

    return app


app = create_app(get_settings())

if __name__ == "__main__":
    import uvicorn
    # Disable Uvicorn's default access logger since we use custom middleware
    uvicorn.run(app, host="0.0.0.0", port=8000, lifespan="on", access_log=False)
