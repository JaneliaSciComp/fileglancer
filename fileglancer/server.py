import logging
import os
import re
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
from fileglancer import apps as apps_module
from fileglancer.model import *
from fileglancer.settings import get_settings
from fileglancer.issues import create_jira_ticket, get_jira_ticket_details, delete_jira_ticket
from fileglancer.utils import format_timestamp, guess_content_type, parse_range_header
from fileglancer.user_context import UserContext, EffectiveUserContext, CurrentUserContext, UserContextConfigurationError
from fileglancer.filestore import Filestore, RootCheckError
from fileglancer.log import AccessLogMiddleware
from fileglancer.worker_pool import WorkerPool, WorkerError, WorkerDead
from fileglancer import sshkeys

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
        url = f"{external_proxy_url}/{db_path.sharing_key}/{quote(db_path.url_prefix, safe='/')}"
    else:
        logger.warning(f"No external proxy URL was provided, proxy links will not be available.")
        url = None
    return ProxiedPath(
        username=db_path.username,
        sharing_key=db_path.sharing_key,
        sharing_name=db_path.sharing_name,
        fsp_name=db_path.fsp_name,
        path=db_path.path,
        url_prefix=db_path.url_prefix,
        created_at=db_path.created_at,
        updated_at=db_path.updated_at,
        url=url
    )


# Regex: allow unreserved URI chars (RFC 3986), plus / for path separators and common safe chars
_VALID_URL_PREFIX_RE = re.compile(r'^[A-Za-z0-9\-._~/!@$&\'()*+,;:=%]+$')


def _validate_url_prefix(url_prefix: str) -> None:
    """Validate that a url_prefix is non-empty and contains only URL-safe characters."""
    if not url_prefix or not url_prefix.strip():
        raise HTTPException(status_code=400, detail="Data link name must not be empty")
    if not _VALID_URL_PREFIX_RE.match(url_prefix):
        invalid_chars = set(c for c in url_prefix if not re.match(r"[A-Za-z0-9\-._~/!@$&'()*+,;:=]", c))
        raise HTTPException(
            status_code=400,
            detail=f"Data link name contains invalid URL characters: {' '.join(sorted(invalid_chars))}"
        )
    if url_prefix.startswith('/') or url_prefix.endswith('/'):
        raise HTTPException(status_code=400, detail="Data link name must not start or end with /")
    if '//' in url_prefix:
        raise HTTPException(status_code=400, detail="Data link name must not contain consecutive slashes")


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


def _parse_neuroglancer_url(url: str) -> Tuple[str, Dict]:
    """
    Parse a Neuroglancer URL and return its base URL and decoded JSON state.
    """
    if not url or "#!" not in url:
        raise HTTPException(status_code=400, detail="Neuroglancer URL must include a '#!' state fragment")

    url_base, encoded_state = url.split("#!", 1)
    if not url_base.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Neuroglancer URL must start with http or https")

    decoded_state = unquote(encoded_state)
    if decoded_state.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Shortened Neuroglancer URLs are not supported; provide a full state URL")

    try:
        state = json.loads(decoded_state)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Neuroglancer state must be valid JSON")

    if not isinstance(state, dict):
        raise HTTPException(status_code=400, detail="Neuroglancer state must be a JSON object")

    return url_base, state


def _validate_short_name(short_name: str) -> None:
    """Validate short_name: only letters, numbers, hyphens, and underscores allowed."""
    if not all(ch.isalnum() or ch in ("-", "_") for ch in short_name):
        raise HTTPException(status_code=400, detail="short_name can only contain letters, numbers, hyphens, and underscores")


def create_app(settings):

    # Initialize OAuth client for OKTA
    oauth = auth.setup_oauth(settings)

    # Define ui_dir for serving static files and SPA
    ui_dir = PathLib(__file__).parent / "ui"

    # Per-user persistent worker pool (only used when use_access_flags=True)
    worker_pool = WorkerPool(settings) if settings.use_access_flags else None

    def _get_user_context(username: str) -> UserContext:
        if settings.use_access_flags:
            return EffectiveUserContext(username)
        else:
            return CurrentUserContext()

    async def _worker_exec(username: str, action: str, **kwargs):
        """Dispatch an action to the per-user worker and return the result.

        When use_access_flags=True, dispatches to the persistent worker pool.
        When use_access_flags=False (dev/test mode), runs the action directly
        in the current process since no identity switching is needed.

        Raises HTTPException on worker-level errors or dead workers.
        """
        if worker_pool is not None:
            try:
                worker = await worker_pool.get_worker(username)
                return await worker.execute(action, **kwargs)
            except WorkerDead as e:
                logger.error(f"Worker dead for {username}: {e}")
                raise HTTPException(status_code=503, detail="Service temporarily unavailable")
            except WorkerError as e:
                raise  # Let caller handle application-level errors
        else:
            # Dev/test mode: run action directly in-process
            from fileglancer.user_worker import _ACTIONS, WorkerContext
            handler = _ACTIONS.get(action)
            if handler is None:
                raise HTTPException(status_code=500, detail=f"Unknown action: {action}")
            ctx = WorkerContext(username=username, db_url=settings.db_url)
            request = {"action": action, **kwargs}
            return handler(request, ctx)

    def _resolve_proxy_info(sharing_key: str, captured_path: str) -> Tuple[dict | Response, str]:
        """Resolve a sharing key to proxy info (mount_path, target_name, username, subpath).

        Returns (info_dict, subpath) on success, or (error_response, "") on failure.
        """
        def try_strip_prefix(captured: str, prefix: str) -> str | None:
            if captured == prefix:
                return ""
            if captured.startswith(prefix + "/"):
                return captured[len(prefix) + 1:]
            return None

        with db.get_db_session(settings.db_url) as session:

            proxied_path = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if not proxied_path:
                return get_nosuchbucket_response(captured_path), ""

            subpath = try_strip_prefix(captured_path, proxied_path.url_prefix)
            if subpath is None:
                subpath = try_strip_prefix(captured_path, unquote(proxied_path.url_prefix))
            if subpath is None:
                return get_error_response(404, "NoSuchKey", f"Path mismatch for sharing key {sharing_key}", captured_path), ""

            fsp = db.get_file_share_path(session, proxied_path.fsp_name)
            if not fsp:
                return get_error_response(400, "InvalidArgument", f"File share path {proxied_path.fsp_name} not found", captured_path), ""
            expanded_mount_path = os.path.expanduser(fsp.mount_path)
            mount_path = f"{expanded_mount_path}/{proxied_path.path}"
            target_name = captured_path.rsplit('/', 1)[-1] if captured_path else os.path.basename(proxied_path.path)
            return {
                "mount_path": mount_path,
                "target_name": target_name,
                "username": proxied_path.username,
            }, subpath


    @asynccontextmanager
    async def lifespan(app: FastAPI):

        # Configure logging based on the log level in the settings
        logger.remove()
        logger.add(sys.stderr, level=settings.log_level)

        # Intercept stdlib logging (e.g. py-cluster-api) into loguru
        class InterceptHandler(logging.Handler):
            def emit(self, record):
                # Get corresponding loguru level
                try:
                    level = logger.level(record.levelname).name
                except ValueError:
                    level = record.levelno
                # Find caller from where the log call originated
                frame, depth = logging.currentframe(), 0
                while frame and frame.f_code.co_filename == logging.__file__:
                    frame = frame.f_back
                    depth += 1
                logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())

        # Attach directly to cluster_api logger so uvicorn can't clobber it
        cluster_logger = logging.getLogger("cluster_api")
        cluster_logger.handlers = [InterceptHandler()]
        cluster_logger.setLevel(logging.DEBUG)
        cluster_logger.propagate = False

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

        # Source a shell script to import environment variables
        # (e.g., /misc/lsf/conf/profile.lsf). This runs the script
        # in a bash subshell and captures the resulting environment,
        # applying any new/changed vars to this process. Pixi strips
        # inherited env vars, so they must be set inside the process.
        #
        if settings.env_source_script:
            import subprocess as _sp
            script = settings.env_source_script
            try:
                result = _sp.run(
                    ["bash", "-c", f". {script} && env -0"],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0:
                    sourced_env = dict(
                        line.split("=", 1)
                        for line in result.stdout.split("\0")
                        if "=" in line
                    )
                    for key, value in sourced_env.items():
                        if os.environ.get(key) != value:
                            os.environ[key] = value
                            logger.debug(f"  env_source_script set: {key}={value}")
                else:
                    logger.warning(
                        f"env_source_script failed (rc={result.returncode}): "
                        f"{result.stderr.strip()}"
                    )
            except Exception as e:
                logger.warning(f"env_source_script error: {e}")

        # Initialize database (run migrations once at startup)
        db.initialize_database(settings.db_url)

        # Mount static assets (CSS, JS, images) at /assets
        assets_dir = ui_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
            logger.debug(f"Mounted static assets at /assets from {assets_dir}")
        else:
            logger.warning(f"Assets directory not found at {assets_dir}")

        # Check for notifications file at startup
        notifications_file = os.path.join(os.getcwd(), "notifications.yaml")
        if os.path.exists(notifications_file):
            logger.debug(f"Notifications file found: {notifications_file}")
        else:
            logger.debug(f"No notifications file found at {notifications_file}")

        # Start worker pool eviction loop (only when using access flags)
        if worker_pool is not None:
            await worker_pool.start_eviction_loop()
            logger.info("Worker pool started")

        # Start cluster job monitor
        try:
            await apps_module.start_job_monitor()
            logger.info("Cluster job monitor started")
        except Exception as e:
            logger.warning(f"Failed to start cluster job monitor: {e}")

        logger.info(f"Server ready")
        yield

        # Cleanup: stop job monitor
        try:
            await apps_module.stop_job_monitor()
        except Exception as e:
            logger.warning(f"Error stopping cluster job monitor: {e}")

        # Cleanup: shut down all workers
        if worker_pool is not None:
            try:
                await worker_pool.shutdown_all()
                logger.info("Worker pool shut down")
            except Exception as e:
                logger.warning(f"Error shutting down worker pool: {e}")

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


    @app.exception_handler(UserContextConfigurationError)
    async def user_context_config_error_handler(request, exc):
        logger.error(f"User context configuration error: {exc}")
        return JSONResponse(
            {"error": str(exc)},
            status_code=500
        )

    @app.exception_handler(PermissionError)
    async def permission_error_handler(request, exc):
        error_msg = str(exc)
        logger.error(f"Permission error: {error_msg}")
        return JSONResponse({"error": f"Permission denied: {error_msg}"}, status_code=403)


    @app.exception_handler(Exception)
    async def general_exception_handler(request, exc):
        logger.exception(f"Unhandled exception: {exc}")
        return JSONResponse({"error": f"{type(exc).__name__}: {str(exc)}"}, status_code=500)


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
        if next and next.startswith("/"):
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
            next_url = request.session.pop('next_url', '/browse')

            # Validate next_url to prevent open redirect vulnerabilities
            if not next_url.startswith('/'):
                next_url = '/browse'

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
        redirect_response = RedirectResponse(url="/browse")

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


    @app.post("/api/neuroglancer/nglinks", response_model=NeuroglancerShortenResponse,
              description="Store a Neuroglancer state and return a shortened link")
    async def shorten_neuroglancer_state(request: Request,
                                         payload: NeuroglancerShortenRequest,
                                         username: str = Depends(get_current_user)):
        short_name = payload.short_name.strip() if payload.short_name else None
        if short_name:
            _validate_short_name(short_name)
        title = payload.title.strip() if payload.title else None

        if payload.url and payload.state:
            raise HTTPException(status_code=400, detail="Provide either url or state, not both")

        if payload.url:
            url_base, state = _parse_neuroglancer_url(payload.url.strip())
        elif payload.state:
            if not payload.url_base:
                raise HTTPException(status_code=400, detail="url_base is required when providing state directly")
            if not isinstance(payload.state, dict):
                raise HTTPException(status_code=400, detail="state must be a JSON object")
            url_base = payload.url_base.strip()
            if not url_base.startswith(("http://", "https://")):
                raise HTTPException(status_code=400, detail="url_base must start with http or https")
            state = payload.state
        else:
            raise HTTPException(status_code=400, detail="Either url or state must be provided")

        # Add title to state if provided
        if title:
            state = {**state, "title": title}

        with db.get_db_session(settings.db_url) as session:
            try:
                entry = db.create_neuroglancer_state(
                    session,
                    username,
                    url_base,
                    state,
                    short_name=short_name
                )
                created_short_key = entry.short_key
                created_short_name = entry.short_name
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))

        # Generate URL based on whether short_name is provided
        if created_short_name:
            state_url = str(request.url_for("get_neuroglancer_state", short_key=created_short_key, short_name=created_short_name))
        else:
            state_url = str(request.url_for("get_neuroglancer_state_simple", short_key=created_short_key))
        neuroglancer_url = f"{url_base}#!{state_url}"
        return NeuroglancerShortenResponse(
            short_key=created_short_key,
            short_name=created_short_name,
            title=title,
            state_url=state_url,
            neuroglancer_url=neuroglancer_url
        )


    @app.put("/api/neuroglancer/nglinks/{short_key}", response_model=NeuroglancerShortenResponse,
             description="Update a stored Neuroglancer state")
    async def update_neuroglancer_short_link(request: Request,
                                             short_key: str,
                                             payload: NeuroglancerUpdateRequest,
                                             username: str = Depends(get_current_user)):
        title = payload.title.strip() if payload.title else None
        url_base, state = _parse_neuroglancer_url(payload.url.strip())

        # Add title to state if provided
        if title:
            state = {**state, "title": title}

        with db.get_db_session(settings.db_url) as session:
            entry = db.update_neuroglancer_state(
                session,
                username,
                short_key,
                url_base,
                state
            )
            if not entry:
                raise HTTPException(status_code=404, detail="Neuroglancer state not found")
            # Extract values before session closes
            updated_short_key = entry.short_key
            updated_short_name = entry.short_name

        # Generate URL based on whether short_name is present
        if updated_short_name:
            state_url = str(request.url_for("get_neuroglancer_state", short_key=updated_short_key, short_name=updated_short_name))
        else:
            state_url = str(request.url_for("get_neuroglancer_state_simple", short_key=updated_short_key))
        neuroglancer_url = f"{url_base}#!{state_url}"
        return NeuroglancerShortenResponse(
            short_key=updated_short_key,
            short_name=updated_short_name,
            title=title,
            state_url=state_url,
            neuroglancer_url=neuroglancer_url
        )


    @app.delete("/api/neuroglancer/nglinks/{short_key}",
                description="Delete a stored Neuroglancer state")
    async def delete_neuroglancer_short_link(short_key: str = Path(..., description="The short key of the Neuroglancer state"),
                                             username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            deleted = db.delete_neuroglancer_state(session, username, short_key)
            if deleted == 0:
                raise HTTPException(status_code=404, detail="Neuroglancer link not found")
            return {"message": f"Neuroglancer link {short_key} deleted"}


    @app.post("/api/proxied-path", response_model=ProxiedPath,
              description="Create a new proxied path")
    async def create_proxied_path(fsp_name: str = Query(..., description="The name of the file share path that this proxied path is associated with"),
                                  path: str = Query(..., description="The path relative to the file share path mount point"),
                                  url_prefix: Optional[str] = Query(None, description="The URL path prefix after the sharing key. Defaults to basename of path."),
                                  username: str = Depends(get_current_user)):

        if url_prefix is None:
            url_prefix = quote(os.path.basename(path), safe='/')
        elif not _VALID_URL_PREFIX_RE.match(url_prefix):
            url_prefix = quote(url_prefix, safe='/')
        _validate_url_prefix(url_prefix)
        sharing_name = url_prefix
        logger.info(f"Creating proxied path for {username} with sharing name {sharing_name} and fsp_name {fsp_name} and path {path} (url_prefix={url_prefix})")
        # Validate the user can access the path via worker
        validation = await _worker_exec(username, "validate_proxied_path", fsp_name=fsp_name, path=path)
        if "error" in validation:
            raise HTTPException(status_code=400, detail=validation["error"])

        with db.get_db_session(settings.db_url) as session:
            try:
                new_path = db.create_proxied_path(session, username, sharing_name, fsp_name, path, url_prefix=url_prefix)
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
        # If path or fsp_name is changing, validate access via worker
        if path is not None or fsp_name is not None:
            with db.get_db_session(settings.db_url) as session:
                existing = db.get_proxied_path_by_sharing_key(session, sharing_key)
            if existing:
                validate_fsp = fsp_name or existing.fsp_name
                validate_path = path or existing.path
                validation = await _worker_exec(username, "validate_proxied_path",
                                                fsp_name=validate_fsp, path=validate_path)
                if "error" in validation:
                    raise HTTPException(status_code=400, detail=validation["error"])

        with db.get_db_session(settings.db_url) as session:
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


    @app.get("/ng/{short_key}", name="get_neuroglancer_state_simple", include_in_schema=False)
    async def get_neuroglancer_state_simple(short_key: str = Path(..., description="Short key for a stored Neuroglancer state")):
        with db.get_db_session(settings.db_url) as session:
            entry = db.get_neuroglancer_state(session, short_key)
            if not entry:
                raise HTTPException(status_code=404, detail="Neuroglancer state not found")
            # If this entry has a short_name, require it in the URL
            if entry.short_name:
                raise HTTPException(status_code=404, detail="Neuroglancer state not found")
            return JSONResponse(content=entry.state, headers={"Cache-Control": "no-store"})

    @app.get("/ng/{short_key}/{short_name}", name="get_neuroglancer_state", include_in_schema=False)
    async def get_neuroglancer_state(short_key: str = Path(..., description="Short key for a stored Neuroglancer state"),
                                     short_name: str = Path(..., description="Short name for a stored Neuroglancer state")):
        with db.get_db_session(settings.db_url) as session:
            entry = db.get_neuroglancer_state(session, short_key)
            if not entry:
                raise HTTPException(status_code=404, detail="Neuroglancer state not found")
            # Validate short_name matches
            if entry.short_name != short_name:
                raise HTTPException(status_code=404, detail="Neuroglancer state not found")
            return JSONResponse(content=entry.state, headers={"Cache-Control": "no-store"})


    @app.get("/api/neuroglancer/nglinks", response_model=NeuroglancerShortLinkResponse,
             description="List stored Neuroglancer short links for the current user")
    async def get_neuroglancer_short_links(request: Request,
                                           username: str = Depends(get_current_user)):
        links = []
        with db.get_db_session(settings.db_url) as session:
            entries = db.get_neuroglancer_states(session, username)
            for entry in entries:
                # Generate URL based on whether short_name is provided
                if entry.short_name:
                    state_url = str(request.url_for("get_neuroglancer_state", short_key=entry.short_key, short_name=entry.short_name))
                else:
                    state_url = str(request.url_for("get_neuroglancer_state_simple", short_key=entry.short_key))
                neuroglancer_url = f"{entry.url_base}#!{state_url}"
                # Read title from the stored state
                title = entry.state.get("title") if isinstance(entry.state, dict) else None
                links.append(NeuroglancerShortLink(
                    short_key=entry.short_key,
                    short_name=entry.short_name,
                    title=title,
                    created_at=entry.created_at,
                    updated_at=entry.updated_at,
                    state_url=state_url,
                    neuroglancer_url=neuroglancer_url,
                    state=entry.state,
                    url_base=entry.url_base
                ))

        return NeuroglancerShortLinkResponse(links=links)


    @app.get("/files/{sharing_key}/{path:path}")
    async def target_dispatcher(request: Request,
                                sharing_key: str,
                                path: str = '',
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

        info, subpath = _resolve_proxy_info(sharing_key, path)
        if isinstance(info, Response):
            return info

        if list_type:
            if list_type == 2:
                result = await _worker_exec(info["username"], "s3_list_objects",
                                            mount_path=info["mount_path"],
                                            target_name=info["target_name"],
                                            continuation_token=continuation_token,
                                            delimiter=delimiter,
                                            encoding_type=encoding_type,
                                            fetch_owner=fetch_owner,
                                            max_keys=max_keys,
                                            prefix=prefix,
                                            start_after=start_after)
                return Response(content=result["body"], media_type=result.get("media_type", "application/xml"),
                                status_code=result.get("status_code", 200))
            else:
                return get_error_response(400, "InvalidArgument", f"Invalid list type {list_type}", path)
        else:
            range_header = request.headers.get("range")

            result = await _worker_exec(info["username"], "s3_open_object",
                                        mount_path=info["mount_path"],
                                        target_name=info["target_name"],
                                        path=subpath,
                                        range_header=range_header)

            if result.get("type") == "handle":
                # Worker validated access and returned file metadata
                # Open the file in main process (root can read anything)
                resolved_path = result["resolved_path"]
                if resolved_path is None:
                    return get_error_response(404, "NoSuchKey", "File not found", subpath)

                file_handle = open(resolved_path, "rb")
                from x2s3.client_file import FileObjectHandle, file_iterator
                handle = FileObjectHandle(
                    target_name=result["target_name"],
                    key=result["key"],
                    status_code=result["status_code"],
                    headers=result["headers"],
                    media_type=result.get("media_type"),
                    content_length=result["content_length"],
                    file_handle=file_handle,
                    start=result["start"],
                    end=result["end"],
                )
                return StreamingResponse(
                    file_iterator(handle, 256 * 1024),
                    status_code=handle.status_code,
                    headers=handle.headers,
                    media_type=handle.media_type,
                )
            else:
                # Error response
                return Response(
                    content=result.get("body", ""),
                    status_code=result.get("status_code", 500),
                    headers=result.get("headers", {}),
                )


    @app.head("/files/{sharing_key}/{path:path}")
    async def head_object(sharing_key: str, path: str = ''):
        try:
            info, subpath = _resolve_proxy_info(sharing_key, path)
            if isinstance(info, Response):
                return info
            result = await _worker_exec(info["username"], "s3_head_object",
                                        mount_path=info["mount_path"],
                                        target_name=info["target_name"],
                                        path=subpath)
            return Response(headers=result.get("headers", {}), status_code=result.get("status_code", 200))
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
        result = await _worker_exec(username, "get_profile")
        return result

    # SSH Key Management endpoints
    @app.get("/api/ssh-keys", response_model=sshkeys.SSHKeyListResponse,
             description="List Fileglancer-managed SSH keys")
    async def list_ssh_keys(username: str = Depends(get_current_user)):
        """List SSH keys with 'fileglancer' in the comment from authorized_keys"""
        result = await _worker_exec(username, "list_ssh_keys")
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])
        return sshkeys.SSHKeyListResponse(keys=[sshkeys.SSHKeyInfo(**k) for k in result["keys"]])

    @app.post("/api/ssh-keys/generate-temp",
              description="Generate a temporary SSH key and return private key for one-time copy")
    async def generate_temp_ssh_key(
        request: sshkeys.GenerateKeyRequest = Body(default=sshkeys.GenerateKeyRequest()),
        username: str = Depends(get_current_user)
    ):
        """Generate a temporary SSH key, add to authorized_keys, return private key.

        The private key is streamed securely and the temporary files are deleted
        after the response is sent. Key info is included in response headers:
        - X-SSH-Key-Fingerprint
        - X-SSH-Key-Comment
        """
        result = await _worker_exec(username, "generate_ssh_key", passphrase=request.passphrase)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])
        # Reconstruct the response with headers
        headers = {}
        if result.get("fingerprint"):
            headers["X-SSH-Key-Fingerprint"] = result["fingerprint"]
        if result.get("comment"):
            headers["X-SSH-Key-Comment"] = result["comment"]
        return Response(
            content=result["private_key"],
            media_type="application/x-pem-file",
            headers=headers,
        )

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

        result = await _worker_exec(username, "head_file", fsp_name=filestore_name, subpath=subpath)
        if result.get("redirect"):
            redirect_url = f"/api/content/{result['fsp_name']}"
            if result.get("subpath"):
                redirect_url += f"?subpath={result['subpath']}"
            return RedirectResponse(url=redirect_url, status_code=307)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])

        info = result["info"]
        file_name = subpath.split('/')[-1] if subpath else ''
        content_type = result["content_type"]
        is_binary = result["is_binary"]

        headers = {
            'Accept-Ranges': 'bytes',
            'X-Is-Binary': 'true' if is_binary else 'false',
        }
        if content_type == 'application/octet-stream' and file_name:
            headers['Content-Disposition'] = f'attachment; filename="{file_name}"'
        if info.get("size") is not None:
            headers['Content-Length'] = str(info["size"])
        if info.get("last_modified") is not None:
            headers['Last-Modified'] = format_timestamp(info["last_modified"])

        return Response(status_code=200, headers=headers, media_type=content_type)


    @app.get("/api/content/{path_name:path}")
    async def get_file_content(request: Request, path_name: str, subpath: Optional[str] = Query(''), username: str = Depends(get_current_user)):
        """Handle GET requests to get file content, with HTTP Range header support"""

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        # Worker validates path and returns metadata (runs as user)
        result = await _worker_exec(username, "open_file", fsp_name=filestore_name, subpath=subpath)

        if result.get("redirect"):
            redirect_url = f"/api/content/{result['fsp_name']}"
            if result.get("subpath"):
                redirect_url += f"?subpath={result['subpath']}"
            return RedirectResponse(url=redirect_url, status_code=307)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])

        full_path = result["full_path"]
        file_size = result["file_size"]
        content_type = result["content_type"]
        file_name = subpath.split('/')[-1] if subpath else ''

        # Open file in main process — the worker validated access;
        # main process runs as root so it can open the validated path
        file_handle = open(full_path, 'rb')

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

            # Construct a temporary filestore just for streaming
            # (stream_file_range only needs the file_handle)
            return StreamingResponse(
                Filestore._stream_range(start=start, end=end, content_length=content_length, file_handle=file_handle),
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
                Filestore._stream_contents(file_handle=file_handle),
                status_code=200,
                headers=headers,
                media_type=content_type
            )


    @app.get("/api/files/{path_name}")
    async def get_file_metadata(path_name: str, subpath: Optional[str] = Query(''),
                                limit: Optional[int] = Query(None),
                                cursor: Optional[str] = Query(None),
                                username: str = Depends(get_current_user)):
        """Handle GET requests to list directory contents or return info for the file/folder itself"""

        if subpath:
            filestore_name = path_name
        else:
            filestore_name, _, subpath = path_name.partition('/')

        if limit is not None:
            result = await _worker_exec(username, "list_dir_paged",
                                        fsp_name=filestore_name, subpath=subpath,
                                        limit=limit, cursor=cursor)
        else:
            result = await _worker_exec(username, "list_dir",
                                        fsp_name=filestore_name, subpath=subpath)

        if result.get("redirect"):
            redirect_url = f"/api/files/{result['fsp_name']}"
            if result.get("subpath"):
                redirect_url += f"?subpath={result['subpath']}"
            return RedirectResponse(url=redirect_url, status_code=307)
        if "error" in result and "status_code" in result:
            status_code = result["status_code"]
            if status_code == 403 or status_code == 404:
                return JSONResponse(content=result, status_code=status_code)
            raise HTTPException(status_code=status_code, detail=result["error"])
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result


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

        file_type = body.get("type")
        if file_type == "directory":
            logger.info(f"User {username} creating directory {path_name}/{validated_subpath}")
            result = await _worker_exec(username, "create_dir", fsp_name=path_name, subpath=validated_subpath)
        elif file_type == "file":
            logger.info(f"User {username} creating file {path_name}/{validated_subpath}")
            result = await _worker_exec(username, "create_file", fsp_name=path_name, subpath=validated_subpath)
        else:
            raise HTTPException(status_code=400, detail="Invalid file type")

        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])
        return JSONResponse(status_code=201, content={"message": "Item created"})


    @app.patch("/api/files/{path_name}")
    async def update_file_or_dir(path_name: str,
                                 subpath: Optional[str] = Query(''),
                                 body: Dict = Body(...),
                                 username: str = Depends(get_current_user)):
        """Handle PATCH requests to rename or update file permissions"""
        new_path = body.get("path")
        new_permissions = body.get("permissions")

        # Validate and sanitize new_path if renaming
        validated_new_path = new_path
        if new_path is not None:
            normalized_new_path = os.path.normpath(new_path)
            if normalized_new_path.startswith('..') or os.path.isabs(normalized_new_path):
                raise HTTPException(status_code=400, detail="New path cannot escape the current directory")
            new_filename = os.path.basename(normalized_new_path)
            _validate_filename(new_filename)
            validated_new_path = normalized_new_path

        result = await _worker_exec(username, "update_file",
                                    fsp_name=path_name, subpath=subpath,
                                    new_path=validated_new_path,
                                    new_permissions=new_permissions)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])
        return JSONResponse(status_code=200, content={"message": "Permissions changed"})


    @app.delete("/api/files/{fsp_name}")
    async def delete_file_or_dir(fsp_name: str,
                                 subpath: Optional[str] = Query(''),
                                 username: str = Depends(get_current_user)):
        """Handle DELETE requests to remove a file or (empty) directory"""
        logger.info(f"User {username} deleting {fsp_name}/{subpath}")
        result = await _worker_exec(username, "delete", fsp_name=fsp_name, subpath=subpath)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 500), detail=result["error"])
        return JSONResponse(status_code=200, content={"message": "Item deleted"})


    # --- Apps & Jobs API ---

    @app.post("/api/apps/manifest", response_model=AppManifest,
              description="Fetch and validate an app manifest from a URL")
    async def fetch_manifest(body: ManifestFetchRequest,
                             username: str = Depends(get_current_user)):
        try:
            logger.info(f"Fetching manifest for URL: '{body.url}' path: '{body.manifest_path}'")
            manifest = await apps_module.fetch_app_manifest(body.url, body.manifest_path,
                                                                username=username)
            return manifest
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid manifest: {str(e)}")

    @app.get("/api/apps", response_model=list[UserApp],
             description="Get the user's configured apps with their manifests")
    async def get_user_apps(username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, "apps")

        app_list = pref.get("apps", []) if pref else []
        result = []
        for app_entry in app_list:
            user_app = UserApp(
                url=app_entry["url"],
                manifest_path=app_entry.get("manifest_path", ""),
                name=app_entry.get("name", "Unknown"),
                description=app_entry.get("description"),
                added_at=app_entry.get("added_at", datetime.now(UTC).isoformat()),
                updated_at=app_entry.get("updated_at"),
            )
            # Try to fetch manifest from local clone
            try:
                user_app.manifest = await apps_module.fetch_app_manifest(
                    app_entry["url"], app_entry.get("manifest_path", ""),
                    username=username,
                )
                # Update name/description from manifest
                user_app.name = user_app.manifest.name
                user_app.description = user_app.manifest.description
                user_app.branch = await apps_module.get_app_branch(app_entry["url"])
            except Exception as e:
                logger.warning(f"Failed to fetch manifest for {app_entry['url']}: {e}")
            result.append(user_app)
        return result

    @app.post("/api/apps", response_model=list[UserApp],
              description="Add an app by URL (discovers all manifests in the repo)")
    async def add_user_app(body: AppAddRequest,
                           username: str = Depends(get_current_user)):
        # Clone the repo and discover all manifests
        try:
            discovered = await apps_module.discover_app_manifests(body.url,
                                                                   username=username)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to clone or scan repo: {str(e)}")

        if not discovered:
            filenames = apps_module.MANIFEST_FILENAME
            raise HTTPException(
                status_code=404,
                detail=f"No manifest files found ({filenames}). "
                       f"Make sure a manifest exists in the repository.",
            )

        now = datetime.now(UTC)

        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, "apps")
            app_list = pref.get("apps", []) if pref else []

            # Build set of existing (url, manifest_path) for dedup
            existing_keys = {
                (a["url"], a.get("manifest_path", "")) for a in app_list
            }

            branch = await apps_module.get_app_branch(body.url)
            new_apps: list[UserApp] = []
            for manifest_path, manifest in discovered:
                if (body.url, manifest_path) in existing_keys:
                    continue  # silently skip duplicates

                new_entry = {
                    "url": body.url,
                    "manifest_path": manifest_path,
                    "name": manifest.name,
                    "description": manifest.description,
                    "added_at": now.isoformat(),
                }
                app_list.append(new_entry)
                new_apps.append(UserApp(
                    url=body.url,
                    manifest_path=manifest_path,
                    branch=branch,
                    name=manifest.name,
                    description=manifest.description,
                    added_at=now,
                    manifest=manifest,
                ))

            if not new_apps:
                raise HTTPException(
                    status_code=409,
                    detail="All apps in this repository have already been added.",
                )

            db.set_user_preference(session, username, "apps", {"apps": app_list})

        return new_apps

    @app.delete("/api/apps",
                description="Remove an app by URL and manifest path")
    async def remove_user_app(url: str = Query(..., description="URL of the app to remove"),
                              manifest_path: str = Query("", description="Manifest path within the repo"),
                              username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, "apps")
            app_list = pref.get("apps", []) if pref else []

            new_list = [
                a for a in app_list
                if not (a["url"] == url and a.get("manifest_path", "") == manifest_path)
            ]
            if len(new_list) == len(app_list):
                raise HTTPException(status_code=404, detail="App not found")

            db.set_user_preference(session, username, "apps", {"apps": new_list})

        return {"message": "App removed"}

    @app.post("/api/apps/update", response_model=UserApp,
              description="Pull latest code and re-read the manifest for an app")
    async def update_user_app(body: ManifestFetchRequest,
                              username: str = Depends(get_current_user)):
        try:
            await apps_module._ensure_repo_cache(body.url, pull=True, username=username)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to pull latest code: {str(e)}")

        try:
            manifest = await apps_module.fetch_app_manifest(body.url, body.manifest_path,
                                                            username=username)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read manifest after update: {str(e)}")

        now = datetime.now(UTC)

        # Update stored name/description/updated_at from refreshed manifest
        with db.get_db_session(settings.db_url) as session:
            pref = db.get_user_preference(session, username, "apps")
            app_list = pref.get("apps", []) if pref else []
            added_at = now  # fallback
            for entry in app_list:
                if entry["url"] == body.url and entry.get("manifest_path", "") == body.manifest_path:
                    entry["name"] = manifest.name
                    entry["description"] = manifest.description
                    entry["updated_at"] = now.isoformat()
                    added_at = entry.get("added_at", now.isoformat())
                    break
            db.set_user_preference(session, username, "apps", {"apps": app_list})

        branch = await apps_module.get_app_branch(body.url)
        return UserApp(
            url=body.url,
            manifest_path=body.manifest_path,
            branch=branch,
            name=manifest.name,
            description=manifest.description,
            added_at=added_at,
            updated_at=now,
            manifest=manifest,
        )

    @app.post("/api/apps/validate-paths", response_model=PathValidationResponse,
              description="Validate file/directory paths for app parameters")
    async def validate_paths(body: PathValidationRequest,
                             username: str = Depends(get_current_user)):
        result = await _worker_exec(username, "validate_paths", paths=body.paths)
        return PathValidationResponse(errors=result.get("errors", {}))

    @app.get("/api/cluster-defaults",
             description="Get cluster configuration defaults")
    async def get_cluster_defaults():
        return {
            "extra_args": " ".join(settings.cluster.extra_args),
        }

    @app.post("/api/jobs", response_model=Job,
              description="Submit a new job")
    async def submit_job(body: JobSubmitRequest,
                         username: str = Depends(get_current_user)):
        try:
            resources_dict = None
            if body.resources:
                resources_dict = body.resources.model_dump(exclude_none=True)

            db_job = await apps_module.submit_job(
                username=username,
                app_url=body.app_url,
                entry_point_id=body.entry_point_id,
                parameters=body.parameters,
                resources=resources_dict,
                extra_args=body.extra_args,
                pull_latest=body.pull_latest,
                manifest_path=body.manifest_path,
                env=body.env,
                pre_run=body.pre_run,
                post_run=body.post_run,
                container=body.container,
                container_args=body.container_args,
            )
            return _convert_job(db_job)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.exception(f"Error submitting job: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/jobs", response_model=JobResponse,
             description="List the user's jobs")
    async def get_jobs(status: Optional[str] = Query(None, description="Filter by status"),
                       username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            db_jobs = db.get_jobs_by_username(session, username, status)
            # For listing, read service_url for running service jobs via worker
            jobs = []
            for j in db_jobs:
                service_url = None
                if getattr(j, 'entry_point_type', 'job') == 'service' and j.status == 'RUNNING':
                    try:
                        result = await _worker_exec(username, "get_service_url", job_id=j.id)
                        service_url = result.get("service_url")
                    except Exception:
                        pass
                jobs.append(_convert_job(j, service_url=service_url))
            return JobResponse(jobs=jobs)

    @app.get("/api/jobs/{job_id}", response_model=Job,
             description="Get a single job by ID")
    async def get_job(job_id: int,
                      username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            db_job = db.get_job(session, job_id, username)
            if db_job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            # Read file paths and service URL via worker
            files_result = await _worker_exec(username, "get_job_file_paths", job_id=job_id)
            service_url = None
            if getattr(db_job, 'entry_point_type', 'job') == 'service' and db_job.status == 'RUNNING':
                try:
                    svc_result = await _worker_exec(username, "get_service_url", job_id=job_id)
                    service_url = svc_result.get("service_url")
                except Exception:
                    pass
            return _convert_job(db_job, service_url=service_url, files=files_result.get("files"))

    @app.post("/api/jobs/{job_id}/cancel",
              description="Cancel a running job")
    async def cancel_job(job_id: int,
                         username: str = Depends(get_current_user)):
        try:
            db_job = await apps_module.cancel_job(job_id, username)
            return _convert_job(db_job)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.delete("/api/jobs/{job_id}",
                description="Delete a job record")
    async def delete_job(job_id: int,
                         username: str = Depends(get_current_user)):
        with db.get_db_session(settings.db_url) as session:
            deleted = db.delete_job(session, job_id, username)
            if not deleted:
                raise HTTPException(status_code=404, detail="Job not found")
        return {"message": "Job deleted"}

    @app.get("/api/jobs/{job_id}/files/{file_type}",
             description="Get job file content (script, stdout, or stderr)")
    async def get_job_file(job_id: int,
                           file_type: str = Path(..., description="File type: script, stdout, or stderr"),
                           username: str = Depends(get_current_user)):
        if file_type not in ("script", "stdout", "stderr"):
            raise HTTPException(status_code=400, detail="file_type must be script, stdout, or stderr")
        try:
            result = await _worker_exec(username, "get_job_file", job_id=job_id, file_type=file_type)
            if "error" in result:
                raise HTTPException(status_code=result.get("status_code", 404), detail=result["error"])
            content = result.get("content")
            if content is None:
                raise HTTPException(status_code=404, detail=f"File not found: {file_type}")
            return PlainTextResponse(content)
        except WorkerError as e:
            raise HTTPException(status_code=404, detail=str(e))

    def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
        """Re-attach UTC timezone to naive datetimes from the DB.

        SQLAlchemy's DateTime column strips tzinfo, so datetimes come back
        naive even though they were stored as UTC. Re-attaching ensures
        Pydantic serializes with '+00:00' so JS parses them correctly.
        """
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=UTC)
        return dt

    def _convert_job(db_job: db.JobDB, service_url: str = None, files: dict = None) -> Job:
        """Convert a database JobDB to a Pydantic Job model.

        File-reading fields (service_url, files) must be passed in pre-computed
        by the caller, since they require user-context file I/O.
        """
        return Job(
            id=db_job.id,
            app_url=db_job.app_url,
            app_name=db_job.app_name,
            manifest_path=db_job.manifest_path,
            entry_point_id=db_job.entry_point_id,
            entry_point_name=db_job.entry_point_name,
            entry_point_type=db_job.entry_point_type,
            parameters=db_job.parameters,
            status=db_job.status,
            exit_code=db_job.exit_code,
            resources=db_job.resources,
            env=db_job.env,
            pre_run=db_job.pre_run,
            post_run=db_job.post_run,
            container=db_job.container,
            container_args=db_job.container_args,
            pull_latest=db_job.pull_latest,
            cluster_job_id=db_job.cluster_job_id,
            service_url=service_url,
            created_at=_ensure_utc(db_job.created_at),
            started_at=_ensure_utc(db_job.started_at),
            finished_at=_ensure_utc(db_job.finished_at),
            files=files,
        )

    @app.post("/api/auth/simple-login", include_in_schema=not settings.enable_okta_auth)
    async def simple_login_handler(request: Request, body: dict = Body(...)):
        """Handle simple login JSON submission"""
        if settings.enable_okta_auth:
            raise HTTPException(status_code=404, detail="Use OKTA authentication")

        # Parse JSON body
        username = body.get("username")
        next_url = body.get("next", "/browse")

        if not username or not username.strip():
            raise HTTPException(status_code=400, detail="Username is required")

        username = username.strip()

        # Validate next_url to prevent open redirect vulnerabilities
        # Only allow relative URLs that start with /
        if not next_url.startswith("/"):
            next_url = "/browse"

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


    @app.post("/api/auth/test-login", include_in_schema=False)
    async def test_login(request: Request):
        """Create a session for automated testing. Requires test_api_key to be set in settings."""
        if not settings.test_api_key:
            raise HTTPException(status_code=404, detail="Not found")

        import secrets as _secrets
        api_key = request.headers.get("X-API-Key", "")
        if not api_key or not _secrets.compare_digest(api_key, settings.test_api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")

        username = settings.test_login_username

        expires_at = datetime.now(UTC) + timedelta(hours=settings.session_expiry_hours)

        with db.get_db_session(settings.db_url) as session:
            user_session = db.create_session(
                session=session,
                username=username,
                email=None,
                expires_at=expires_at,
                session_secret_key=settings.session_secret_key,
                okta_access_token=None,
                okta_id_token=None
            )
            session_id = user_session.session_id

        response = JSONResponse(content={"success": True, "username": username})
        auth.create_session_cookie(response, session_id, settings)

        logger.info(f"User {username} logged in via test API key")

        return response


    # Return 404 error at /attributes.json
    # Required for Neuroglancer to be able to render N5 volumes
    @app.get("/attributes.json", include_in_schema=False)
    async def serve_attributes_json():
        raise HTTPException(status_code=404, detail="Not found")

    # Serve SPA at /* for client-side routing
    # This must be the LAST route registered
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        """Serve index.html for all SPA routes (client-side routing)"""
        # Don't serve SPA for API or files paths - those should 404 if not found
        if full_path and (full_path.startswith("api/") or full_path.startswith("files/")):
            raise HTTPException(status_code=404, detail="Not found")

        # append the full_path to the ui_dir and ensure it is within the ui_dir after resolving
        resolved_dir = os.path.normpath(ui_dir / full_path)
        # if the resolved_dir is outside of ui_dir, reject the request
        if not resolved_dir.startswith(str(ui_dir)):
            raise HTTPException(status_code=400, detail="Invalid file path")

        resolved_path = PathLib(resolved_dir)
        # Serve logo.svg and other root-level static files from ui directory
        if resolved_path.exists() and resolved_path.is_file():
            return FileResponse(resolved_path)

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
