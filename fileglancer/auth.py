"""
Authentication module for OKTA OAuth/OIDC integration
"""
import os
from datetime import datetime, timedelta, UTC
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException, Request, Response
from jose import jwt, JWTError
from loguru import logger

from fileglancer import database as db
from fileglancer.settings import Settings


def setup_oauth(settings: Settings) -> OAuth:
    """Initialize OAuth client for OKTA"""
    oauth = OAuth()

    if settings.enable_okta_auth:
        if not all([settings.okta_domain, settings.okta_client_id, settings.okta_client_secret]):
            raise ValueError("OKTA authentication enabled but credentials not configured")

        oauth.register(
            name='okta',
            client_id=settings.okta_client_id,
            client_secret=settings.okta_client_secret,
            server_metadata_url=f'https://{settings.okta_domain}/.well-known/openid-configuration',
            client_kwargs={
                'scope': 'openid email profile'
            }
        )
        logger.info(f"OKTA OAuth client configured for domain: {settings.okta_domain}")

    return oauth


def verify_id_token(id_token: str, settings: Settings) -> dict:
    """
    Verify and decode OKTA ID token
    Returns the decoded token payload
    """
    try:
        # For OKTA, we typically don't verify signature here since authlib does it
        # But we decode to extract claims
        decoded = jwt.decode(
            id_token,
            options={"verify_signature": False}  # authlib already verified it
        )
        return decoded
    except JWTError as e:
        logger.error(f"Failed to decode ID token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def get_session_from_cookie(request: Request, settings: Settings) -> Optional[db.SessionDB]:
    """
    Extract and validate session from cookie
    Returns the session object if valid, None otherwise
    """
    session_id = request.cookies.get(settings.session_cookie_name)

    if not session_id:
        return None

    # Get session from database
    with db.get_db_session(settings.db_url) as session:
        user_session = db.get_session_by_id(session, session_id)

        if not user_session:
            return None

        # Check if session is expired
        # Note: SQLAlchemy doesn't preserve timezone info, so we add UTC back
        expires_at_utc = user_session.expires_at.replace(tzinfo=UTC)
        if expires_at_utc < datetime.now(UTC):
            logger.info(f"Session expired for user {user_session.username}")
            db.delete_session(session, session_id)
            return None

        # Update last accessed time
        db.update_session_access_time(session, session_id)

        # Access all attributes while still in session context to avoid DetachedInstanceError
        # This forces SQLAlchemy to load all attributes before the session closes
        _ = user_session.username
        _ = user_session.email
        _ = user_session.session_id

        return user_session


def get_current_user(request: Request, settings: Settings) -> str:
    """
    Get the current authenticated user

    Always validates session from cookie (for both OKTA and simple auth)
    Raises HTTPException(401) if authentication fails
    """
    user_session = get_session_from_cookie(request, settings)

    if not user_session:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in."
        )

    return user_session.username


def create_session_cookie(
    response: Response,
    session_id: str,
    settings: Settings
):
    """
    Set session cookie on response
    """
    max_age = settings.session_expiry_hours * 3600  # Convert hours to seconds

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=max_age,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite='lax',  # CSRF protection while allowing navigation
        path='/'  # Ensure cookie is sent for all paths
    )


def delete_session_cookie(response: Response, settings: Settings):
    """
    Delete session cookie from response
    """
    response.delete_cookie(
        key=settings.session_cookie_name,
        path='/',  # Must match the path used when setting the cookie
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite='lax'
    )
