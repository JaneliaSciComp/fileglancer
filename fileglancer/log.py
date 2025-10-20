"""
Custom access log middleware for FastAPI/Uvicorn

This middleware logs HTTP access information including authenticated username.
It replaces Uvicorn's default access logger to provide more detailed logging
with application-level authentication context.
"""
import time
from typing import Callable

from fastapi import Request, Response
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from fileglancer import auth
from fileglancer.settings import Settings


class AccessLogMiddleware(BaseHTTPMiddleware):
    """
    Middleware that logs HTTP access information with username when available.

    Logs in a format similar to standard HTTP access logs but includes:
    - Client IP and port
    - Authenticated username (or '-' if not authenticated)
    - Request method, path, and HTTP version
    - Response status code
    - Request duration in milliseconds
    """

    def __init__(self, app: ASGIApp, settings: Settings):
        super().__init__(app)
        self.settings = settings

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log access information"""
        start_time = time.time()

        # Extract username from session (if authenticated)
        username = "-"
        try:
            user_session = auth.get_session_from_cookie(request, self.settings)
            if user_session and user_session.username:
                username = user_session.username
        except Exception:
            # Silently handle any authentication errors - user is just not authenticated
            pass

        # Process the request
        response = await call_next(request)

        # Calculate request duration
        duration_ms = (time.time() - start_time) * 1000

        # Extract client information
        client_host = request.client.host if request.client else "unknown"
        client_port = request.client.port if request.client else 0

        # Get HTTP version from scope
        http_version = request.scope.get("http_version", "1.1")

        # Format log message in a standard access log format
        # Example: 192.168.1.100:54321 [username] "GET /api/files HTTP/1.1" 200 - 45.23ms
        log_message = (
            f"{client_host}:{client_port} [{username}] "
            f'"{request.method} {request.url.path}'
        )

        # Add query string if present
        if request.url.query:
            log_message += f"?{request.url.query}"

        log_message += (
            f' HTTP/{http_version}" '
            f"{response.status_code} - {duration_ms:.2f}ms"
        )

        # Log at INFO level for successful requests, WARNING for client errors, ERROR for server errors
        if 200 <= response.status_code < 400:
            logger.info(log_message)
        elif 400 <= response.status_code < 500:
            logger.warning(log_message)
        else:
            logger.error(log_message)

        return response
