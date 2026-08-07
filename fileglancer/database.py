import secrets
import hashlib
from datetime import datetime, timedelta, UTC
import os
from functools import lru_cache

from sqlalchemy import create_engine, Boolean, Column, String, Integer, DateTime, JSON, UniqueConstraint, ForeignKey, func
from sqlalchemy import true as sa_true
from sqlalchemy import false as sa_false
from sqlalchemy.orm import sessionmaker, declarative_base, relationship, Session
from sqlalchemy.engine.url import make_url
from sqlalchemy.pool import StaticPool
from typing import Optional, Dict, List, Tuple
from loguru import logger
from cachetools import LRUCache, TTLCache

from fileglancer.giturls import canonical_github_url
from fileglancer.model import FileSharePath
from fileglancer.settings import get_settings
from fileglancer.utils import slugify_path

# Constants
SHARING_KEY_LENGTH = 12
NEUROGLANCER_SHORT_KEY_LENGTH = 12
VIEW_KEY_LENGTH = 12

# Global flag to track if migrations have been run
_migrations_run = False

# Engine cache - maintain multiple engines for different database URLs
_engine_cache = {}

# Sharing key cache - LRU cache for ProxiedPathDB objects
_sharing_key_cache = None

# File share path cache. The list changes rarely (written by an external
# process) and is read on every proxied data request and every worker file
# action, so it is cached for a short window rather than re-queried per call.
# Keyed by database URL: a process can talk to more than one database (the test
# suite builds a fresh one per module), and an unkeyed cache would serve one
# database's shares for another's.
FSP_CACHE_TTL_SECONDS = 60
_fsp_cache = TTLCache(maxsize=8, ttl=FSP_CACHE_TTL_SECONDS)

def _get_sharing_key_cache():
    """Get or initialize the sharing key cache"""
    global _sharing_key_cache
    if _sharing_key_cache is None:
        settings = get_settings()
        _sharing_key_cache = LRUCache(maxsize=settings.sharing_key_cache_size)
    return _sharing_key_cache

Base = declarative_base()
class FileSharePathDB(Base):
    """Database model for storing file share paths"""
    __tablename__ = 'file_share_paths'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, index=True, unique=True)
    zone = Column(String)
    group = Column(String)
    storage = Column(String)
    mount_path = Column(String)
    mac_path = Column(String)
    windows_path = Column(String)
    linux_path = Column(String)


class ExternalBucketDB(Base):
    """Database model for storing external buckets"""
    __tablename__ = 'external_buckets'
    id = Column(Integer, primary_key=True, autoincrement=True)
    full_path = Column(String)
    external_url = Column(String)
    fsp_name = Column(String, nullable=False)
    relative_path = Column(String)


class LastRefreshDB(Base):
    """Database model for storing the last refresh time of tables"""
    __tablename__ = 'last_refresh'
    id = Column(Integer, primary_key=True, autoincrement=True)
    table_name = Column(String, nullable=False, index=True)
    source_last_updated = Column(DateTime, nullable=False)
    db_last_updated = Column(DateTime, nullable=False)


class UserPreferenceDB(Base):
    """Database model for storing user preferences"""
    __tablename__ = 'user_preferences'

    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False)
    key = Column(String, nullable=False)
    value = Column(JSON, nullable=False)

    __table_args__ = (
        UniqueConstraint('username', 'key', name='uq_user_pref'),
    )


class ProxiedPathDB(Base):
    """Database model for storing proxied paths"""
    __tablename__ = 'proxied_paths'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    sharing_key = Column(String, nullable=False, unique=True)
    sharing_name = Column(String, nullable=False)
    fsp_name = Column(String, nullable=False)
    path = Column(String, nullable=False)
    url_prefix = Column(String, nullable=False, server_default="")
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    __table_args__ = (
        UniqueConstraint('username', 'fsp_name', 'path', name='uq_proxied_path'),
    )


class NeuroglancerStateDB(Base):
    """Database model for storing Neuroglancer states"""
    __tablename__ = 'neuroglancer_states'

    id = Column(Integer, primary_key=True, autoincrement=True)
    short_key = Column(String, nullable=False, unique=True, index=True)
    short_name = Column(String, nullable=True)
    username = Column(String, nullable=False)
    url_base = Column(String, nullable=False)
    state = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class ViewDB(Base):
    """Database model for a Neuroglancer View (state + sharing keys)."""
    __tablename__ = 'views'

    id = Column(Integer, primary_key=True, autoincrement=True)
    short_key = Column(String, nullable=False, unique=True, index=True)
    read_key = Column(String, nullable=False, unique=True, index=True)
    # ponytail: edit_key reserved, unused until the edit stack
    edit_key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    ng_state = Column(JSON, nullable=False)
    sharing_mode = Column(String, nullable=False, server_default='read')
    owner = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    layers = relationship(
        'ViewLayerDB',
        back_populates='view',
        cascade='all, delete-orphan',
        order_by='ViewLayerDB.layer_index',
    )


class ViewLayerDB(Base):
    """Join row: one dataset/channel layer of a View, backed by a Data Link."""
    __tablename__ = 'view_layers'

    id = Column(Integer, primary_key=True, autoincrement=True)
    view_id = Column(Integer, ForeignKey('views.id'), nullable=False, index=True)
    data_link_id = Column(Integer, ForeignKey('proxied_paths.id'), nullable=True, index=True)
    layer_index = Column(Integer, nullable=False)
    channel = Column(String, nullable=True)
    opts = Column(JSON, nullable=True)
    broken = Column(Boolean, nullable=False, server_default=sa_false())

    view = relationship('ViewDB', back_populates='layers')


class TicketDB(Base):
    """Database model for storing proxied paths"""
    __tablename__ = 'tickets'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    fsp_name = Column(String, nullable=False)
    path = Column(String, nullable=False)
    ticket_key = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    # TODO: Do we want to only allow one ticket per path?
    # Commented out now for testing purposes
    # __table_args__ = (
    #     UniqueConstraint('username', 'fsp_name', 'path', name='uq_ticket_path'),
    # )


class JobDB(Base):
    """Database model for storing cluster jobs"""
    __tablename__ = 'jobs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False, index=True)
    cluster_job_id = Column(String, nullable=True, index=True)
    app_url = Column(String, nullable=False)
    app_name = Column(String, nullable=False)
    manifest_path = Column(String, nullable=False, server_default="")
    entry_point_id = Column(String, nullable=False)
    entry_point_name = Column(String, nullable=False)
    # Human-editable label for the job. Defaults to "app_name - entry_point_name"
    # at create time; NULL only for rows created before this column (backfilled
    # by migration).
    name = Column(String, nullable=True)
    entry_point_type = Column(String, nullable=False, server_default="job")
    parameters = Column(JSON, nullable=False)
    # Environment-tab parameter values. A separate namespace from `parameters`
    # so env-injected keys (e.g. Nextflow's -profile) can't collide with
    # pipeline param keys.
    env_parameters = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="PENDING")
    exit_code = Column(Integer, nullable=True)
    resources = Column(JSON, nullable=True)
    env = Column(JSON, nullable=True)
    # When True the job ran in a clean shell (minimal constructed
    # environment); when False/NULL it ran under the user's login shell.
    clean_env = Column(Boolean, nullable=True)
    pre_run = Column(String, nullable=True)
    post_run = Column(String, nullable=True)
    container = Column(String, nullable=True)
    container_args = Column(String, nullable=True)
    # Base command for the entry point and its declared runtime requirements,
    # snapshotted at submit time so the job detail view can show how the job ran
    # without re-fetching the (possibly changed) app manifest.
    command = Column(String, nullable=True)
    conda_env = Column(String, nullable=True)
    requirements = Column(JSON, nullable=True)
    work_dir = Column(String, nullable=True)
    # Absolute path to the script generated by cluster-api at submit time.
    # Stored so file path info can be served from the DB without globbing the
    # work directory on every read.
    script_path = Column(String, nullable=True)
    # Browse-link base for the work directory (file-share-path name + subpath),
    # resolved once in the user-context worker at submit time. Lets the job
    # detail endpoint build browse links without realpath'ing mounts per read.
    work_dir_fsp_name = Column(String, nullable=True)
    work_dir_subpath = Column(String, nullable=True)
    # Service URL as published by the job to its work directory, cached here so
    # the proxy-resolve endpoint can map a hostname to an upstream with one
    # indexed read, instead of a per-user worker RPC and an NFS stat on every
    # proxied request. NULL until the job publishes a URL and it is first read.
    service_url = Column(String, nullable=True)
    # Whether this service may be republished at the HTTPS proxy URL. Taken
    # from the entry point's service_proxy flag and snapshotted at submit time,
    # so editing the manifest cannot change the decision under a job that is
    # already running. False publishes the direct http://host:port URL instead
    # and makes the resolve endpoint refuse the job's proxy hostname.
    service_proxy = Column(Boolean, nullable=False, server_default=sa_true())
    # Commit whose code this job executed (the code repo's SHA when the
    # manifest declares a separate repo_url, else the app repo's SHA). NULL for
    # jobs submitted before commit pinning existed.
    commit_sha = Column(String, nullable=True)
    # Repo the executed commit belongs to, when it differs from app_url
    # (manifests with a separate repo_url). NULL means commit_sha is app_url's.
    code_repo_url = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    # When the status column last changed value. Lets the poll loop measure how
    # long a job has sat in a non-progressing state (e.g. UNKNOWN) without
    # conflating it with created_at. NULL for rows created before this column.
    status_updated_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


class UserAppDB(Base):
    """Database model for a user's installed apps with cached manifests."""
    __tablename__ = 'user_apps'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False, index=True)
    url = Column(String, nullable=False)
    manifest_path = Column(String, nullable=False, server_default="")
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    # Commit the app is pinned to: jobs run from an immutable snapshot of this
    # SHA, and only an explicit Update moves it. NULL for legacy rows, which
    # get pinned on their next launch or update.
    commit_sha = Column(String, nullable=True)
    # Pin for the manifest's separate code repo (repo_url), when declared.
    code_commit_sha = Column(String, nullable=True)
    manifest = Column(JSON, nullable=True)
    added_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('username', 'url', 'manifest_path', name='uq_user_app'),
    )


class AppListingDB(Base):
    """Database model for a shared app listing in the catalog."""
    __tablename__ = 'app_listings'

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_username = Column(String, nullable=False, index=True)
    url = Column(String, nullable=False)
    manifest_path = Column(String, nullable=False, server_default="")
    branch = Column(String, nullable=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('owner_username', 'url', 'manifest_path', name='uq_app_listing'),
    )


class SessionDB(Base):
    """Database model for storing user sessions"""
    __tablename__ = 'sessions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, unique=True, index=True)
    username = Column(String, nullable=False, index=True)
    email = Column(String, nullable=True)
    okta_access_token = Column(String, nullable=True)
    okta_id_token = Column(String, nullable=True)
    session_secret_key_hash = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    expires_at = Column(DateTime, nullable=False)
    last_accessed_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))


# --- API token constants ---

API_TOKEN_PREFIX = "fgt"
API_TOKEN_ID_LENGTH = 12
DEFAULT_TOKEN_EXPIRY_DAYS = 30
MAX_TOKEN_EXPIRY_DAYS = 365

# last_used_at is refreshed at most this often, so token auth does not cost a
# database write on every single API request.
TOKEN_TOUCH_INTERVAL_SECONDS = 300


class ApiTokenDB(Base):
    """Database model for programmatic API tokens.

    Only the SHA-256 hash of the secret half is stored. The full token string
    is returned exactly once, at creation, and is not recoverable afterwards.
    """
    __tablename__ = 'api_tokens'

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(String, nullable=False, unique=True, index=True)
    token_hash = Column(String, nullable=False)
    username = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    scopes = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=True)


def run_alembic_upgrade(db_url):
    """Run Alembic migrations to upgrade database to latest version"""
    global _migrations_run

    if _migrations_run:
        logger.debug("Migrations already run, skipping")
        return

    try:
        from alembic.config import Config
        from alembic import command
        import os

        alembic_cfg_path = None

        # Try to find alembic.ini - first in package directory, then development setup
        current_dir = os.path.dirname(os.path.abspath(__file__))

        # Check if alembic.ini is in the package directory (installed package)
        pkg_alembic_cfg_path = os.path.join(current_dir, "alembic.ini")
        if os.path.exists(pkg_alembic_cfg_path):
            alembic_cfg_path = pkg_alembic_cfg_path
            logger.debug("Using packaged alembic.ini")
        else:
            # Fallback to development setup
            project_root = os.path.dirname(current_dir)
            dev_alembic_cfg_path = os.path.join(project_root, "alembic.ini")
            if os.path.exists(dev_alembic_cfg_path):
                alembic_cfg_path = dev_alembic_cfg_path
                logger.debug("Using development alembic.ini")

        if alembic_cfg_path and os.path.exists(alembic_cfg_path):
            alembic_cfg = Config(alembic_cfg_path)
            alembic_cfg.set_main_option("sqlalchemy.url", db_url)

            # Update script_location for packaged installations
            if alembic_cfg_path == pkg_alembic_cfg_path:
                # Using packaged alembic.ini, also update script_location
                pkg_alembic_dir = os.path.join(current_dir, "alembic")
                if os.path.exists(pkg_alembic_dir):
                    alembic_cfg.set_main_option("script_location", pkg_alembic_dir)

            command.upgrade(alembic_cfg, "head")
            logger.info("Alembic migrations completed successfully")
        else:
            logger.warning("Alembic configuration not found, falling back to create_all")
            engine = _get_engine(db_url)
            Base.metadata.create_all(engine)
    except Exception as e:
        logger.warning(f"Alembic migration failed, falling back to create_all: {e}")
        engine = _get_engine(db_url)
        Base.metadata.create_all(engine)
    finally:
        _migrations_run = True


def initialize_database(db_url):
    """Initialize database by running migrations. Should be called once at startup."""
    logger.debug(f"Initializing database: {make_url(db_url).render_as_string(hide_password=True)}")
    run_alembic_upgrade(db_url)
    logger.debug("Database initialization completed")


def _get_engine(db_url):
    """Get or create a cached database engine for the given URL"""
    global _engine_cache

    # Return cached engine if it exists
    if db_url in _engine_cache:
        return _engine_cache[db_url]

    url = make_url(db_url)
    if url.drivername.startswith("sqlite"):
        if url.database in (None, "", ":memory:"):
            logger.warning("Configuring in-memory SQLite. This is not recommended for production use. Make sure to use --workers 1 when running uvicorn.")
            logger.info("Creating in-memory SQLite database engine (no connection pooling)")
            engine = create_engine(
                db_url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool
            )
            _engine_cache[db_url] = engine
            logger.info(f"In-memory SQLite engine created and cached")
            return engine

        # File-based SQLite
        logger.info(f"Creating file-based SQLite database engine:")
        logger.info(f"  Database file: {url.database}")
        logger.info(f"  Connection pooling: disabled (SQLite default)")
        engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False},  # Needed for SQLite with multiple threads
        )
        _engine_cache[db_url] = engine
        logger.info(f"File-based SQLite engine created and cached for: {url.database}")
        return engine

    # For other databases, use connection pooling options
    # Get settings for pool configuration
    settings = get_settings()

    # Log connection pool configuration
    logger.info(f"Creating database engine with connection pool settings:")
    logger.info(f"  Database URL: {make_url(db_url).render_as_string(hide_password=True)}")
    logger.info(f"  Pool size: {settings.db_pool_size}")
    logger.info(f"  Max overflow: {settings.db_max_overflow}")
    logger.info(f"  Pool recycle: 3600 seconds")
    logger.info(f"  Pool pre-ping: enabled")

    # Create new engine and cache it
    engine = create_engine(
        db_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_pre_ping=True  # Verify connections before use
    )
    _engine_cache[db_url] = engine

    logger.info(f"Database engine created and cached for: {make_url(db_url).render_as_string(hide_password=True)}")
    return engine


def get_db_session(db_url):
    """Create and return a database session using a cached engine"""
    engine = _get_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    return session


def dispose_engine(db_url=None):
    """Dispose of cached engine(s) and close connections"""
    global _engine_cache

    if db_url is None:
        # Dispose all engines
        for engine in _engine_cache.values():
            engine.dispose()
        _engine_cache.clear()
    elif db_url in _engine_cache:
        # Dispose specific engine
        _engine_cache[db_url].dispose()
        del _engine_cache[db_url]


def get_all_paths(session, fsp_name: Optional[str] = None):
    """Get all file share paths from the database"""
    query = session.query(FileSharePathDB)
    if fsp_name:
        query = query.filter_by(name=fsp_name)
    return query.all()


def _load_file_share_paths(session: Session) -> List[FileSharePath]:
    """Build the full file share path list from config or the database.

    Priority:
    1. Check local configuration first - if paths exist in local configuration, use those
    2. Otherwise, check the database
    """
    settings = get_settings()
    file_share_mounts = settings.file_share_mounts

    if file_share_mounts:
        return [FileSharePath(
            name=slugify_path(path),
            zone='Local',
            group='local',
            storage='home' if path in ("~", "~/") else 'local',
            mount_path=path,
            mac_path=path,
            windows_path=path,
            linux_path=path,
        ) for path in file_share_mounts]

    db_paths = get_all_paths(session)
    return [FileSharePath(
        name=path.name,
        zone=path.zone,
        group=path.group,
        storage=path.storage,
        mount_path=path.mount_path,
        mac_path=path.mac_path,
        windows_path=path.windows_path,
        linux_path=path.linux_path,
    ) for path in db_paths]


def get_file_share_paths(session: Session, fsp_name: Optional[str] = None):
    """
    Get all file share paths from either the local configuration or the database.

    This is the single source of truth for retrieving file share paths.
    Returns a list of FileSharePath model objects (not database models).

    Served from a short-lived process-local cache. Every proxied data request
    resolves its file share path through here (once per chunk a viewer pulls),
    as does every file action dispatched to a worker, so the uncached cost is
    paid on the hottest paths in the app. Nothing in Fileglancer writes the
    file_share_paths table -- it is populated externally -- so there is no
    event to invalidate on and the cache is a plain TTL.

    Args:
        session: Database session
        fsp_name: Optional name to filter by

    Returns:
        List of FileSharePath objects ready to be used in responses
    """
    key = str(session.get_bind().url)
    paths = _fsp_cache.get(key)
    if paths is None:
        paths = _fsp_cache[key] = _load_file_share_paths(session)
    if fsp_name:
        return [path for path in paths if path.name == fsp_name]
    # Copy so a caller mutating the list can't corrupt the cached one.
    return list(paths)


def get_file_share_path(session: Session, name: str) -> Optional[FileSharePath]:
    """Get a file share path by name"""
    paths = get_file_share_paths(session, name)
    return paths[0] if paths else None


def get_fsp_names_to_mount_paths(session: Session) -> Dict[str, str]:
    """
    Get a mapping of file share path names to their mount paths.

    This is a helper function that returns a dict for quick lookups.
    Uses get_file_share_paths() as the single source of truth.

    Args:
        session: Database session

    Returns:
        Dict mapping fsp names to mount paths
    """
    paths = get_file_share_paths(session)
    return {fsp.name: fsp.mount_path for fsp in paths}


def get_external_buckets(session, fsp_name: Optional[str] = None):
    """Get all external buckets from the database"""
    query = session.query(ExternalBucketDB)
    if fsp_name:
        query = query.filter_by(fsp_name=fsp_name)
    return query.all()


def get_last_refresh(session, table_name: str):
    """Get the last refresh time from the database for a specific table"""
    return session.query(LastRefreshDB).filter_by(table_name=table_name).first()


def get_user_preference(session: Session, username: str, key: str) -> Optional[Dict]:
    """Get a user preference value by username and key"""
    pref = session.query(UserPreferenceDB).filter_by(
        username=username,
        key=key
    ).first()
    return pref.value if pref else None


def set_user_preference(session: Session, username: str, key: str, value: Dict):
    """Set a user preference value
    If the preference already exists, it will be updated with the new value.
    If the preference does not exist, it will be created.
    Returns the preference object.
    """
    pref = session.query(UserPreferenceDB).filter_by(
        username=username,
        key=key
    ).first()

    if pref:
        pref.value = value
    else:
        pref = UserPreferenceDB(
            username=username,
            key=key,
            value=value
        )
        session.add(pref)

    session.commit()
    return pref


def delete_user_preference(session: Session, username: str, key: str) -> bool:
    """Delete a user preference and return True if it was deleted, False if it didn't exist"""
    deleted = session.query(UserPreferenceDB).filter_by(
        username=username,
        key=key
    ).delete()
    session.commit()
    return deleted > 0


def get_all_user_preferences(session: Session, username: str) -> Dict[str, Dict]:
    """Get all preferences for a user"""
    prefs = session.query(UserPreferenceDB).filter_by(username=username).all()
    return {pref.key: pref.value for pref in prefs}


def get_proxied_paths(session: Session, username: str, fsp_name: str = None, path: str = None) -> List[ProxiedPathDB]:
    """Get proxied paths for a user, optionally filtered by fsp_name and path"""
    logger.info(f"Getting proxied paths for {username} with fsp_name={fsp_name} and path={path}")
    query = session.query(ProxiedPathDB).filter_by(username=username)
    if fsp_name:
        query = query.filter_by(fsp_name=fsp_name)
    if path:
        query = query.filter_by(path=path)
    return query.all()


def get_proxied_path_by_sharing_key(session: Session, sharing_key: str) -> Optional[ProxiedPathDB]:
    """Get a proxied path by sharing key with LRU caching"""
    cache = _get_sharing_key_cache()

    # Check cache first
    if sharing_key in cache:
        logger.trace(f"Cache HIT for sharing key: {sharing_key}")
        return cache[sharing_key]

    # Query database if not in cache
    logger.trace(f"Cache MISS for sharing key: {sharing_key}, querying database")
    proxied_path = session.query(ProxiedPathDB).filter_by(sharing_key=sharing_key).first()

    # Only cache valid results (not None)
    if proxied_path is not None:
        cache[sharing_key] = proxied_path
        logger.debug(f"Cached result for sharing key: {sharing_key}, cache size: {len(cache)}")
    else:
        logger.trace(f"Not caching None result for sharing key: {sharing_key}")

    return proxied_path


def _invalidate_sharing_key_cache(sharing_key: str):
    """Remove a sharing key from the cache"""
    cache = _get_sharing_key_cache()
    was_present = sharing_key in cache
    cache.pop(sharing_key, None)
    if was_present:
        logger.debug(f"Invalidated cache entry for sharing key: {sharing_key}, cache size: {len(cache)}")


def _clear_sharing_key_cache():
    """Clear the entire sharing key cache"""
    cache = _get_sharing_key_cache()
    old_size = len(cache)
    cache.clear()
    if old_size > 0:
        logger.debug(f"Cleared entire sharing key cache, removed {old_size} entries")


def _find_best_fsp_match(
    fsps: list[FileSharePath],
    normalized_input: str,
    get_candidates: callable,
    separator: str = "/",
) -> Optional[tuple[FileSharePath, str]]:
    """Find the FSP whose candidate path is the longest prefix of *normalized_input*.

    Used by ``find_fsp_from_absolute_path`` to check filesystem-resolved mount paths.

    Args:
        fsps: All file share paths to search.
        normalized_input: The input path, already normalised by the caller.
        get_candidates: ``fn(fsp) -> list[str | None]`` returning the candidate
            prefix strings to test for each FSP.
        separator: The path separator used for the boundary check (``/`` or
            ``os.sep``).

    Returns:
        ``(best_fsp, subpath)`` for the longest match, or *None*.
    """
    best_fsp: Optional[FileSharePath] = None
    best_len = 0

    for fsp in fsps:
        for candidate in get_candidates(fsp):
            if not candidate:
                continue
            if (
                normalized_input.startswith(candidate)
                and len(candidate) > best_len
            ):
                rest = normalized_input[len(candidate):]
                if rest == "" or rest.startswith(separator):
                    best_fsp = fsp
                    best_len = len(candidate)

    if best_fsp is None:
        return None

    subpath = normalized_input[best_len:]
    if subpath.startswith(separator):
        subpath = subpath.lstrip(separator)
    # Normalize to forward slashes so subpaths are portable (e.g. used in URLs)
    subpath = subpath.replace("\\", "/")

    return (best_fsp, subpath)


def find_fsp_in_paths(
    paths: list[FileSharePath], absolute_path: str
) -> Optional[tuple[FileSharePath, str]]:
    """Match *absolute_path* against an in-memory list of file share paths.

    Pure function with no DB access — useful from contexts that already have
    the path list (e.g. a worker subprocess that fetched it once and cached
    it).

    Args:
        paths: All file share paths to search.
        absolute_path: Absolute file path to match.

    Returns:
        ``(fsp, relative_subpath)`` for the longest match, or *None*.
    """
    normalized_path = os.path.realpath(absolute_path)

    expanded_mounts: dict[str, str] = {}
    for fsp in paths:
        expanded = os.path.expanduser(fsp.mount_path)
        expanded_mounts[fsp.name] = os.path.realpath(expanded)

    def _expanded_mount(fsp: FileSharePath):
        return [expanded_mounts[fsp.name]]

    result = _find_best_fsp_match(paths, normalized_path, _expanded_mount, separator=os.sep)
    if result is not None:
        fsp, subpath = result
        logger.trace(f"Found exact match for path: {absolute_path} in fsp: {fsp.name} with subpath: {subpath}")
    return result


def find_fsp_from_absolute_path(session: Session, absolute_path: str) -> Optional[tuple[FileSharePath, str]]:
    """
    Find the file share path that exactly matches the given absolute path.

    This function iterates through all file share paths and checks if the absolute
    path exists within any of them. Returns the first exact match found.

    Args:
        session: Database session
        absolute_path: Absolute file path to match against file shares

    Returns:
        Tuple of (FileSharePath, relative_subpath) if an exact match is found, None otherwise
    """
    return find_fsp_in_paths(get_file_share_paths(session), absolute_path)


def _validate_proxied_path(session: Session, fsp_name: str, path: str) -> None:
    """Validate that the file share path for a proxied path exists.

    Note: the filesystem existence and accessibility of *path* are deliberately
    NOT checked here. This function runs in the main server process, whose
    identity (uid/group memberships) differs from the requesting user's. A
    filesystem permission check here would therefore use the wrong identity and
    reject paths the user can legitimately access -- e.g. a directory that is
    group-readable but not world-readable, where the user is a group member but
    the server account is not. Per-user filesystem access is validated by the
    user worker (see ``_action_validate_proxied_path``), which executes as the
    real user before this function is called.
    """
    fsp = get_file_share_path(session, fsp_name)
    if not fsp:
        raise ValueError(f"File share path {fsp_name} does not exist")


def create_proxied_path(session: Session, username: str, sharing_name: str, fsp_name: str, path: str, url_prefix: str = "") -> ProxiedPathDB:
    """Create a new proxied path"""
    _validate_proxied_path(session, fsp_name, path)

    sharing_key = secrets.token_urlsafe(SHARING_KEY_LENGTH)
    now = datetime.now(UTC)
    proxied_path = ProxiedPathDB(
        username=username,
        sharing_key=sharing_key,
        sharing_name=sharing_name,
        fsp_name=fsp_name,
        path=path,
        url_prefix=url_prefix,
        created_at=now,
        updated_at=now
    )
    session.add(proxied_path)
    session.commit()

    # Cache the new proxied path
    cache = _get_sharing_key_cache()
    cache[sharing_key] = proxied_path
    logger.debug(f"Cached new proxied path for sharing key: {sharing_key}, cache size: {len(cache)}")
    return proxied_path



def update_proxied_path(session: Session,
                        username: str,
                        sharing_key: str,
                        new_sharing_name: Optional[str] = None,
                        new_path: Optional[str] = None,
                        new_fsp_name: Optional[str] = None) -> ProxiedPathDB:
    """Update a proxied path"""
    proxied_path = get_proxied_path_by_sharing_key(session, sharing_key)
    if not proxied_path:
        raise ValueError(f"Proxied path with sharing key {sharing_key} not found")

    if username != proxied_path.username:
        raise ValueError(f"Proxied path with sharing key {sharing_key} not found for user {username}")

    if new_sharing_name:
        proxied_path.sharing_name = new_sharing_name
        proxied_path.url_prefix = new_sharing_name

    if new_fsp_name:
        proxied_path.fsp_name = new_fsp_name

    if new_path:
        proxied_path.path = new_path

    _validate_proxied_path(session, proxied_path.fsp_name, proxied_path.path)
    proxied_path.updated_at = datetime.now(UTC)

    session.commit()

    # Update cache with the modified object
    cache = _get_sharing_key_cache()
    cache[sharing_key] = proxied_path
    logger.debug(f"Updated cache entry for sharing key: {sharing_key}, cache size: {len(cache)}")
    return proxied_path


def delete_proxied_path(session: Session, username: str, sharing_key: str):
    """Delete a proxied path"""
    session.query(ProxiedPathDB).filter_by(username=username, sharing_key=sharing_key).delete()
    session.commit()

    # Remove from cache
    _invalidate_sharing_key_cache(sharing_key)


def _generate_unique_neuroglancer_key(session: Session) -> str:
    """Generate a unique short key for Neuroglancer states."""
    for _ in range(10):
        candidate = secrets.token_urlsafe(NEUROGLANCER_SHORT_KEY_LENGTH)
        exists = session.query(NeuroglancerStateDB).filter_by(short_key=candidate).first()
        if not exists:
            return candidate
    raise RuntimeError("Failed to generate a unique Neuroglancer short key")


def create_neuroglancer_state(
    session: Session,
    username: str,
    url_base: str,
    state: Dict,
    short_name: Optional[str] = None
) -> NeuroglancerStateDB:
    """Create a new Neuroglancer state entry and return it."""
    short_key = _generate_unique_neuroglancer_key(session)
    now = datetime.now(UTC)
    entry = NeuroglancerStateDB(
        short_key=short_key,
        short_name=short_name,
        username=username,
        url_base=url_base,
        state=state,
        created_at=now,
        updated_at=now
    )
    session.add(entry)
    session.commit()
    return entry


def get_neuroglancer_state(session: Session, short_key: str) -> Optional[NeuroglancerStateDB]:
    """Get a Neuroglancer state by short key."""
    return session.query(NeuroglancerStateDB).filter_by(short_key=short_key).first()


def get_neuroglancer_states(session: Session, username: str) -> List[NeuroglancerStateDB]:
    """Get all Neuroglancer states for a user, newest first."""
    return (
        session.query(NeuroglancerStateDB)
        .filter_by(username=username)
        .order_by(NeuroglancerStateDB.created_at.desc())
        .all()
    )


def update_neuroglancer_state(
    session: Session,
    username: str,
    short_key: str,
    url_base: str,
    state: Dict
) -> Optional[NeuroglancerStateDB]:
    """Update a Neuroglancer state entry. Returns the updated entry or None if not found."""
    entry = session.query(NeuroglancerStateDB).filter_by(
        short_key=short_key,
        username=username
    ).first()
    if not entry:
        return None
    entry.url_base = url_base
    entry.state = state
    entry.updated_at = datetime.now(UTC)
    session.commit()
    return entry


def delete_neuroglancer_state(session: Session, username: str, short_key: str) -> int:
    """Delete a Neuroglancer state entry. Returns the number of deleted rows."""
    deleted = session.query(NeuroglancerStateDB).filter_by(
        short_key=short_key,
        username=username
    ).delete()
    session.commit()
    return deleted


def _generate_unique_view_key(session: Session) -> str:
    """Generate a short key unique across all View keys (short/read/edit)."""
    for _ in range(10):
        candidate = secrets.token_urlsafe(VIEW_KEY_LENGTH)
        clash = session.query(ViewDB).filter(
            (ViewDB.short_key == candidate)
            | (ViewDB.read_key == candidate)
            | (ViewDB.edit_key == candidate)
        ).first()
        if not clash:
            return candidate
    raise RuntimeError("Failed to generate a unique View key")


def create_view(
    session: Session,
    username: str,
    name: str,
    ng_state: Dict,
    layers: List[Dict],
    sharing_mode: str = 'read',
) -> ViewDB:
    """Create a View plus its ViewLayer rows. Returns the persisted ViewDB.

    Each layer dict: {data_link_id, layer_index, channel, opts}.
    """
    now = datetime.now(UTC)
    view = ViewDB(
        short_key=_generate_unique_view_key(session),
        read_key=_generate_unique_view_key(session),
        edit_key=_generate_unique_view_key(session),
        name=name,
        ng_state=ng_state,
        sharing_mode=sharing_mode,
        owner=username,
        created_at=now,
        updated_at=now,
    )
    for layer in layers:
        view.layers.append(ViewLayerDB(
            data_link_id=layer.get('data_link_id'),
            layer_index=layer['layer_index'],
            channel=layer.get('channel'),
            opts=layer.get('opts'),
        ))
    session.add(view)
    session.commit()
    return view


def get_view_by_short_key(session: Session, short_key: str) -> Optional[ViewDB]:
    """Get a View by its short key. No owner filter — callers scope ownership."""
    return session.query(ViewDB).filter_by(short_key=short_key).first()


def get_view_by_read_key(session: Session, read_key: str) -> Optional[ViewDB]:
    """Resolve a View by its read key (read-only share access)."""
    return session.query(ViewDB).filter_by(read_key=read_key).first()


def get_views(session: Session, username: str) -> List[ViewDB]:
    """Get all Views owned by a user, newest first."""
    return (
        session.query(ViewDB)
        .filter_by(owner=username)
        .order_by(ViewDB.created_at.desc())
        .all()
    )


def update_view(
    session: Session,
    username: str,
    short_key: str,
    name: Optional[str] = None,
    ng_state: Optional[Dict] = None,
) -> Optional[ViewDB]:
    """Update an owned View's name and/or state. Returns None if not owned/found."""
    view = session.query(ViewDB).filter_by(short_key=short_key, owner=username).first()
    if not view:
        return None
    if name is not None:
        view.name = name
    if ng_state is not None:
        view.ng_state = ng_state
    view.updated_at = datetime.now(UTC)
    session.commit()
    return view


def delete_view(session: Session, username: str, short_key: str) -> int:
    """Delete an owned View (cascades to its layers). Returns rows deleted."""
    view = session.query(ViewDB).filter_by(short_key=short_key, owner=username).first()
    if not view:
        return 0
    session.delete(view)
    session.commit()
    return 1


def get_views_for_data_link(session: Session, data_link_id: int, owner: Optional[str] = None) -> List[ViewDB]:
    """Distinct Views that have at least one layer backed by this Data Link.
    If `owner` is given, restrict to Views owned by that user (used to avoid
    disclosing other users' Views when guarding a Data Link deletion)."""
    query = (
        session.query(ViewDB)
        .join(ViewLayerDB, ViewLayerDB.view_id == ViewDB.id)
        .filter(ViewLayerDB.data_link_id == data_link_id)
    )
    if owner is not None:
        query = query.filter(ViewDB.owner == owner)
    return query.distinct().all()


def mark_view_layers_broken(session: Session, data_link_id: int) -> int:
    """Detach a Data Link from all View layers that use it: null the
    data_link_id and set broken=True. Returns the number of layers updated.
    Leaves the Views themselves intact (degraded)."""
    layers = session.query(ViewLayerDB).filter_by(data_link_id=data_link_id).all()
    for layer in layers:
        layer.data_link_id = None
        layer.broken = True
    session.commit()
    return len(layers)


def get_tickets(session: Session, username: str, fsp_name: str = None, path: str = None) -> List[TicketDB]:
    """Get tickets for a user, optionally filtered by fsp_name and path"""
    logger.info(f"Getting tickets for {username} with fsp_name={fsp_name} and path={path}")
    query = session.query(TicketDB).filter_by(username=username)
    if fsp_name:
        query = query.filter_by(fsp_name=fsp_name)
    if path:
        query = query.filter_by(path=path)
    return query.all()


def create_ticket(session: Session, username: str, fsp_name: str, path: str, ticket_key: str) -> TicketDB:
    """Create a new ticket entry in the database"""
    now = datetime.now(UTC)
    ticket = TicketDB(
        username=username,
        fsp_name=fsp_name,
        path=path,
        ticket_key=ticket_key,
        created_at=now,
        updated_at=now
    )
    session.add(ticket)
    session.commit()
    return ticket

def delete_ticket(session: Session, ticket_key: str):
    """Delete a ticket from the database"""
    session.query(TicketDB).filter_by(ticket_key=ticket_key).delete()
    session.commit()


def _hash_session_secret_key(session_secret_key: str) -> str:
    """Hash the session secret key using SHA-256"""
    return hashlib.sha256(session_secret_key.encode('utf-8')).hexdigest()


def create_session(session: Session, username: str, email: Optional[str],
                   expires_at: datetime, session_secret_key: str,
                   okta_access_token: Optional[str] = None,
                   okta_id_token: Optional[str] = None) -> SessionDB:
    """Create a new session for a user"""
    session_id = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    session_secret_key_hash = _hash_session_secret_key(session_secret_key)

    user_session = SessionDB(
        session_id=session_id,
        username=username,
        email=email,
        okta_access_token=okta_access_token,
        okta_id_token=okta_id_token,
        session_secret_key_hash=session_secret_key_hash,
        created_at=now,
        expires_at=expires_at,
        last_accessed_at=now
    )
    session.add(user_session)
    session.commit()
    return user_session


def get_session_by_id(session: Session, session_id: str) -> Optional[SessionDB]:
    """Get a session by session ID"""
    return session.query(SessionDB).filter_by(session_id=session_id).first()


def update_session_access_time(session: Session, session_id: str):
    """Update the last accessed time for a session"""
    user_session = get_session_by_id(session, session_id)
    if user_session:
        user_session.last_accessed_at = datetime.now(UTC)
        session.commit()


def delete_session(session: Session, session_id: str):
    """Delete a session (logout)"""
    session.query(SessionDB).filter_by(session_id=session_id).delete()
    session.commit()


def delete_expired_sessions(session: Session):
    """Delete all expired sessions"""
    now = datetime.now(UTC)
    deleted = session.query(SessionDB).filter(SessionDB.expires_at < now).delete()
    session.commit()
    return deleted


# --- API token functions ---

def hash_token_secret(secret: str) -> str:
    """Hash the secret half of an API token.

    ponytail: SHA-256 rather than a slow KDF. The secret is 32 bytes from
    secrets.token_urlsafe, not a human-chosen password, so key stretching
    defends against nothing here. Revisit only if user-chosen secrets are
    ever allowed.
    """
    return hashlib.sha256(secret.encode('utf-8')).hexdigest()


def create_api_token(session: Session, username: str, name: str,
                     scopes: List[str],
                     expires_in_days: int = DEFAULT_TOKEN_EXPIRY_DAYS
                     ) -> Tuple[ApiTokenDB, str]:
    """Create an API token for a user.

    Returns (row, plaintext_token). The plaintext token is the only time the
    secret is available; only its hash is persisted.
    """
    if not 1 <= expires_in_days <= MAX_TOKEN_EXPIRY_DAYS:
        raise ValueError(
            f"expires_in_days must be between 1 and {MAX_TOKEN_EXPIRY_DAYS}")

    # token_hex, not token_urlsafe: the base64url alphabet contains '_', which
    # is the delimiter in the fgt_<token_id>_<secret> format, so ~17% of
    # urlsafe ids would break parsing and be permanently unusable.
    token_id = secrets.token_hex(API_TOKEN_ID_LENGTH // 2)
    secret = secrets.token_urlsafe(32)
    now = datetime.now(UTC)

    row = ApiTokenDB(
        token_id=token_id,
        token_hash=hash_token_secret(secret),
        username=username,
        name=name,
        scopes=" ".join(sorted(set(scopes))),
        created_at=now,
        expires_at=now + timedelta(days=expires_in_days),
        last_used_at=None,
    )
    session.add(row)
    session.commit()
    return row, f"{API_TOKEN_PREFIX}_{token_id}_{secret}"


def get_api_token_by_id(session: Session, token_id: str) -> Optional[ApiTokenDB]:
    """Get an API token row by its public token_id."""
    return session.query(ApiTokenDB).filter_by(token_id=token_id).first()


def list_api_tokens(session: Session, username: str) -> List[ApiTokenDB]:
    """List a user's API tokens, newest first."""
    return (session.query(ApiTokenDB)
            .filter_by(username=username)
            .order_by(ApiTokenDB.created_at.desc())
            .all())


def delete_api_token(session: Session, username: str, token_id: str) -> int:
    """Revoke a token. Returns the number of rows deleted (0 or 1).

    Filtering on username as well as token_id means one user cannot revoke
    another user's token by guessing its id.
    """
    deleted = (session.query(ApiTokenDB)
               .filter_by(username=username, token_id=token_id)
               .delete())
    session.commit()
    return deleted


def touch_api_token(session: Session, token_id: str) -> None:
    """Refresh last_used_at, at most once per TOKEN_TOUCH_INTERVAL_SECONDS."""
    row = get_api_token_by_id(session, token_id)
    if row is None:
        return

    now = datetime.now(UTC)
    if row.last_used_at is not None:
        # SQLAlchemy strips tzinfo on read; add it back before comparing.
        last_used = row.last_used_at.replace(tzinfo=UTC)
        if (now - last_used).total_seconds() < TOKEN_TOUCH_INTERVAL_SECONDS:
            return

    row.last_used_at = now
    session.commit()


# --- Job database functions ---

TERMINAL_JOB_STATUSES = ("DONE", "FAILED", "KILLED")


def is_terminal_job_status(status: str | None) -> bool:
    """Return True when a job status means no scheduler work should remain.

    Any status outside this explicit terminal set (including UNKNOWN or a
    scheduler-specific transient state) is treated as active so polling,
    cancellation, and delete guards do not drop a potentially live job.
    """
    return status in TERMINAL_JOB_STATUSES


def create_job(session: Session, username: str, app_url: str, app_name: str,
               entry_point_id: str, entry_point_name: str, parameters: Dict,
               env_parameters: Optional[Dict] = None,
               resources: Optional[Dict] = None, manifest_path: str = "",
               entry_point_type: str = "job",
               name: Optional[str] = None,
               env: Optional[Dict] = None, pre_run: Optional[str] = None,
               post_run: Optional[str] = None,
               container: Optional[str] = None,
               container_args: Optional[str] = None,
               command: Optional[str] = None,
               conda_env: Optional[str] = None,
               requirements: Optional[List[str]] = None,
               commit_sha: Optional[str] = None,
               code_repo_url: Optional[str] = None,
               service_proxy: bool = True,
               clean_env: bool = False) -> JobDB:
    """Create a new job record"""
    now = datetime.now(UTC)
    if not (name and name.strip()):
        name = f"{app_name} - {entry_point_name}"
    job = JobDB(
        username=username,
        app_url=canonical_github_url(app_url),
        app_name=app_name,
        name=name,
        manifest_path=manifest_path,
        entry_point_id=entry_point_id,
        entry_point_name=entry_point_name,
        entry_point_type=entry_point_type,
        parameters=parameters,
        env_parameters=env_parameters,
        resources=resources,
        env=env,
        clean_env=clean_env,
        pre_run=pre_run,
        post_run=post_run,
        container=container,
        container_args=container_args,
        command=command,
        conda_env=conda_env,
        requirements=requirements,
        commit_sha=commit_sha,
        code_repo_url=code_repo_url,
        service_proxy=service_proxy,
        status="PENDING",
        created_at=now,
        status_updated_at=now,
    )
    session.add(job)
    session.commit()
    return job


def get_jobs_by_username(session: Session, username: str, status: Optional[str] = None) -> List[JobDB]:
    """Get all jobs for a user, newest first"""
    query = session.query(JobDB).filter_by(username=username)
    if status:
        query = query.filter_by(status=status)
    return query.order_by(JobDB.created_at.desc()).all()


def get_job(session: Session, job_id: int, username: str) -> Optional[JobDB]:
    """Get a single job by ID and username"""
    return session.query(JobDB).filter_by(id=job_id, username=username).first()


def get_job_by_id(session: Session, job_id: int) -> Optional[JobDB]:
    """Get a job by ID without an ownership check.

    The proxy-resolve endpoint runs with no authenticated user — the browser's
    session cookie is scoped to the Fileglancer hostname and is never sent to an
    app subdomain — so it cannot use get_job(). Callers that do have a user must
    keep using get_job(), which filters by username.
    """
    return session.query(JobDB).filter_by(id=job_id).first()


def set_job_service_url(session: Session, job_id: int, service_url: str) -> None:
    """Cache the origin of a job's published service URL on its row.

    Only the origin is stored: the rest of the URL carries the service's access
    token, and the column's one reader wants the authority. Normalizing here
    rather than at the call site keeps the token out of the column no matter who
    writes it. Imported inside the function because fileglancer.apps imports
    this module, so a module-level import would close a cycle.
    """
    from fileglancer.apps.serviceproxy import service_url_origin

    origin = service_url_origin(service_url)
    job = session.query(JobDB).filter_by(id=job_id).first()
    if job is None or job.service_url == origin:
        return
    job.service_url = origin
    session.commit()


def update_job(session: Session, job_id: int, username: str,
               name: str) -> Optional[JobDB]:
    """Rename a job. Returns the job, or None if it doesn't exist or isn't
    owned by username."""
    job = session.query(JobDB).filter_by(id=job_id, username=username).first()
    if job is None:
        return None
    job.name = name
    session.commit()
    return job


def count_active_jobs_by_username(session: Session, username: str) -> int:
    """Count a user's jobs that are running/pending, for the header badge.

    Unlike get_active_jobs (used for polling/delete guards, where UNKNOWN
    must stay "active" so a possibly-live job is never dropped), UNKNOWN jobs
    don't count here — the scheduler can't currently confirm they're
    running, so the badge shouldn't claim they are.
    """
    return session.query(JobDB).filter_by(username=username).filter(
        ~JobDB.status.in_(TERMINAL_JOB_STATUSES),
        JobDB.status != "UNKNOWN",
    ).count()


def get_active_jobs(session: Session) -> List[JobDB]:
    """Get all jobs that are not known-terminal.

    UNKNOWN and future scheduler-specific statuses are considered active:
    until a job reaches DONE/FAILED/KILLED, Fileglancer should keep polling and
    must not allow the record to be deleted as if the cluster job were gone.
    """
    return session.query(JobDB).filter(
        ~JobDB.status.in_(TERMINAL_JOB_STATUSES)
    ).all()


def get_job_by_cluster_id(session: Session, cluster_job_id: str) -> Optional[JobDB]:
    """Get a single job by its cluster job ID"""
    return session.query(JobDB).filter_by(cluster_job_id=cluster_job_id).first()


def update_job_status(session: Session, job_id: int, status: str,
                      exit_code: Optional[int] = None,
                      cluster_job_id: Optional[str] = None,
                      started_at: Optional[datetime] = None,
                      finished_at: Optional[datetime] = None,
                      script_path: Optional[str] = None,
                      work_dir_fsp_name: Optional[str] = None,
                      work_dir_subpath: Optional[str] = None) -> Optional[JobDB]:
    """Update a job's status and related fields"""
    job = session.query(JobDB).filter_by(id=job_id).first()
    if not job:
        return None
    # Record when the status actually changes so the poll loop can tell how long
    # a job has been in a stuck state (e.g. UNKNOWN). A no-op update (same
    # status) leaves the timestamp untouched, so it marks entry into the state.
    if job.status != status:
        job.status_updated_at = datetime.now(UTC)
    job.status = status
    if exit_code is not None:
        job.exit_code = exit_code
    if cluster_job_id is not None:
        job.cluster_job_id = cluster_job_id
    if started_at is not None:
        job.started_at = started_at
    if finished_at is not None:
        job.finished_at = finished_at
    if script_path is not None:
        job.script_path = script_path
    if work_dir_fsp_name is not None:
        job.work_dir_fsp_name = work_dir_fsp_name
    if work_dir_subpath is not None:
        job.work_dir_subpath = work_dir_subpath
    session.commit()
    return job


def delete_job(session: Session, job_id: int, username: str) -> bool:
    """Delete a single job record. Returns True if deleted, False if not found."""
    deleted = session.query(JobDB).filter_by(id=job_id, username=username).delete()
    session.commit()
    return deleted > 0


def delete_old_jobs(session: Session, days: int = 30) -> int:
    """Delete completed/failed jobs older than the specified number of days"""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    deleted = session.query(JobDB).filter(
        JobDB.status.in_(TERMINAL_JOB_STATUSES),
        JobDB.created_at < cutoff
    ).delete(synchronize_session='fetch')
    session.commit()
    return deleted


# --- User app database functions ---

def list_user_apps(session: Session, username: str) -> List[UserAppDB]:
    """Get all apps installed by a user, oldest first."""
    return (
        session.query(UserAppDB)
        .filter_by(username=username)
        .order_by(UserAppDB.added_at.asc())
        .all()
    )


def get_user_app(session: Session, username: str, url: str,
                 manifest_path: str = "") -> Optional[UserAppDB]:
    """Get a single user app by (username, url, manifest_path)."""
    return session.query(UserAppDB).filter_by(
        username=username,
        url=canonical_github_url(url),
        manifest_path=manifest_path,
    ).first()


def upsert_user_app(session: Session, username: str, url: str,
                    manifest_path: str = "", *,
                    name: str,
                    description: Optional[str] = None,
                    branch: Optional[str] = None,
                    commit_sha: Optional[str] = None,
                    code_commit_sha: Optional[str] = None,
                    manifest: Optional[Dict] = None,
                    bump_updated_at: bool = True) -> UserAppDB:
    """Insert or update a user app row.

    On insert, added_at is set to now and updated_at stays NULL.
    On update, added_at is preserved. updated_at is bumped only when
    bump_updated_at is True (the default) — set False for invisible
    refreshes like a lazy manifest backfill.

    branch holds the user's *requested* revision ("" means no explicit revision
    was requested). The fixed revision actually cloned is encoded in url; due to
    canonical URL folding, a bare stored URL means the fixed "main" revision.
    Pass branch=None to leave an existing row's branch untouched —
    manifest-cache refreshes use this so they don't clobber the requested
    revision with a resolved one.

    commit_sha / code_commit_sha are the app's pins (see UserAppDB). Like
    branch, None means "leave the existing value untouched" — only add, update
    and launch-time backfill move a pin.
    """
    now = datetime.now(UTC)
    url = canonical_github_url(url)
    row = get_user_app(session, username, url, manifest_path)
    if row is None:
        row = UserAppDB(
            username=username,
            url=url,
            manifest_path=manifest_path,
            name=name,
            description=description,
            branch=branch,
            commit_sha=commit_sha,
            code_commit_sha=code_commit_sha,
            manifest=manifest,
            added_at=now,
        )
        session.add(row)
    else:
        row.name = name
        row.description = description
        if branch is not None:
            row.branch = branch
        if commit_sha is not None:
            row.commit_sha = commit_sha
        if code_commit_sha is not None:
            row.code_commit_sha = code_commit_sha
        row.manifest = manifest
        if bump_updated_at:
            row.updated_at = now
    session.commit()
    return row


def update_user_app_manifest_cache(session: Session, username: str, url: str,
                                   manifest_path: str = "", *,
                                   manifest: Dict,
                                   bump_updated_at: bool = False
                                   ) -> Optional[UserAppDB]:
    """Sync only the cached manifest column on an existing row.

    Cache refreshes must not touch user-facing metadata: a catalog app added
    under a custom name would otherwise revert to the raw manifest name
    whenever its cache is refilled (e.g. after schema drift invalidates the
    stored copy). No-op returning None when the row doesn't exist.
    """
    row = get_user_app(session, username, url, manifest_path)
    if row is None:
        return None
    row.manifest = manifest
    if bump_updated_at:
        row.updated_at = datetime.now(UTC)
    session.commit()
    return row


def set_user_app_pins(session: Session, username: str, url: str,
                      manifest_path: str = "", *,
                      commit_sha: Optional[str] = None,
                      code_commit_sha: Optional[str] = None) -> Optional[UserAppDB]:
    """Set an app row's commit pins without touching any other field.

    Used by launch-time backfill of legacy unpinned rows. None leaves a pin
    unchanged. Returns the row, or None if it doesn't exist.
    """
    row = get_user_app(session, username, url, manifest_path)
    if row is None:
        return None
    if commit_sha is not None:
        row.commit_sha = commit_sha
    if code_commit_sha is not None:
        row.code_commit_sha = code_commit_sha
    session.commit()
    return row


def delete_user_app(session: Session, username: str, url: str,
                    manifest_path: str = "") -> bool:
    """Delete a user app row. Returns True if a row was deleted."""
    deleted = session.query(UserAppDB).filter_by(
        username=username,
        url=canonical_github_url(url),
        manifest_path=manifest_path,
    ).delete()
    session.commit()
    return deleted > 0


# --- App listing (catalog) database functions ---

def list_app_listings(session: Session) -> List[AppListingDB]:
    """Get all app listings in the catalog, newest first."""
    return (
        session.query(AppListingDB)
        .order_by(AppListingDB.published_at.desc())
        .all()
    )


def get_app_listing(session: Session, listing_id: int) -> Optional[AppListingDB]:
    """Get a single app listing by id."""
    return session.query(AppListingDB).filter_by(id=listing_id).first()


def count_installs_by_app(session: Session) -> Dict[Tuple[str, str], int]:
    """Number of users who currently have each app installed, keyed by
    (canonical url, manifest_path). The user_apps unique constraint on
    (username, url, manifest_path) means one row per user, so a plain COUNT per
    (url, manifest_path) is the distinct-user install count. Both user_apps and
    app_listings store canonicalized URLs, so listings can look up their count
    by exact (url, manifest_path)."""
    rows = (
        session.query(
            UserAppDB.url,
            UserAppDB.manifest_path,
            func.count().label("n"),
        )
        .group_by(UserAppDB.url, UserAppDB.manifest_path)
        .all()
    )
    return {(url, manifest_path): n for url, manifest_path, n in rows}


def get_app_listings_by_owner(session: Session, owner_username: str) -> List[AppListingDB]:
    """Get all app listings owned by a user."""
    return session.query(AppListingDB).filter_by(owner_username=owner_username).all()


def get_app_listing_for_app(session: Session, owner_username: str, url: str,
                            manifest_path: str = "") -> Optional[AppListingDB]:
    """Get the listing (if any) that this user has published for a given app."""
    return session.query(AppListingDB).filter_by(
        owner_username=owner_username,
        url=canonical_github_url(url),
        manifest_path=manifest_path,
    ).first()


def create_app_listing(session: Session, owner_username: str, url: str,
                       manifest_path: str, name: str,
                       description: Optional[str] = None,
                       branch: Optional[str] = None) -> AppListingDB:
    """Publish a new listing. Raises ValueError if a duplicate exists."""
    url = canonical_github_url(url)
    existing = get_app_listing_for_app(session, owner_username, url, manifest_path)
    if existing is not None:
        raise ValueError("This app is already shared")
    listing = AppListingDB(
        owner_username=owner_username,
        url=url,
        manifest_path=manifest_path,
        branch=branch,
        name=name,
        description=description,
        published_at=datetime.now(UTC),
    )
    session.add(listing)
    session.commit()
    return listing


def update_app_listing(session: Session, listing_id: int, owner_username: str, *,
                       name: Optional[str] = None,
                       description: Optional[str] = None,
                       url: Optional[str] = None,
                       branch: Optional[str] = None) -> Optional[AppListingDB]:
    """Update an existing listing's editable metadata. Returns the listing, or
    None if it doesn't exist or isn't owned by owner_username.

    url repoints the listing (the caller has already validated that the new
    repo/revision still contains the listing's manifest path); branch is the
    requested revision that goes with it and is only applied alongside url.
    Raises ValueError if the new url collides with another listing by the
    same owner (unique on owner/url/manifest_path)."""
    listing = session.query(AppListingDB).filter_by(
        id=listing_id,
        owner_username=owner_username,
    ).first()
    if listing is None:
        return None
    if url is not None:
        url = canonical_github_url(url)
        duplicate = session.query(AppListingDB).filter(
            AppListingDB.owner_username == owner_username,
            AppListingDB.url == url,
            AppListingDB.manifest_path == listing.manifest_path,
            AppListingDB.id != listing_id,
        ).first()
        if duplicate is not None:
            raise ValueError("You already have another listing for this app")
        listing.url = url
        listing.branch = branch
    if name is not None:
        listing.name = name
    if description is not None:
        listing.description = description
    listing.updated_at = datetime.now(UTC)
    session.commit()
    return listing


def delete_app_listing(session: Session, listing_id: int, owner_username: str) -> bool:
    """Delete a listing. Returns True if a row was deleted."""
    deleted = session.query(AppListingDB).filter_by(
        id=listing_id,
        owner_username=owner_username,
    ).delete()
    session.commit()
    return deleted > 0
