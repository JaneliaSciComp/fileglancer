from typing import List, Optional
from functools import cache
import ipaddress
import sys

from pydantic import BaseModel, HttpUrl, ValidationError, field_validator, model_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    YamlConfigSettingsSource
)


class ClusterSettings(BaseModel):
    """Cluster configuration matching py-cluster-api's ClusterConfig."""
    executor: str = 'local'
    cpus: Optional[int] = None
    gpus: Optional[int] = None
    memory: Optional[str] = None
    walltime: Optional[str] = None
    queue: Optional[str] = None
    poll_interval: float = 10.0
    shebang: str = "#!/bin/bash"
    script_prologue: List[str] = []
    script_epilogue: List[str] = []
    extra_directives: List[str] = []
    extra_args: List[str] = []
    directives_skip: List[str] = []
    lsf_units: str = "MB"
    job_name_prefix: Optional[str] = None
    zombie_timeout_minutes: float = 30.0
    completed_retention_minutes: float = 10.0
    command_timeout: float = 100.0
    suppress_job_email: bool = True
    poll_all_users: bool = False


class AppsSettings(BaseModel):
    """Apps-specific configuration (not passed to py-cluster-api)."""
    extra_paths: List[str] = []
    # Extra environment variable names (exact) or prefixes (ending in '_') to
    # pass through to per-user workers, on top of the built-in allowlist. The
    # worker env is an allowlist so no server secret leaks to the user via
    # /proc/<pid>/environ; add site-specific vars your scheduler or tools need
    # here rather than widening the allowlist in code. FGC_* is never passed
    # through regardless of this list.
    worker_env_passthrough: List[str] = []
    # How long a job may sit in UNKNOWN before the poll loop gives up and marks
    # it FAILED. UNKNOWN means the scheduler can no longer report the job (it
    # aged out of the queue/history), so continued polling would never resolve
    # it. This is Fileglancer poll policy, not py-cluster-api config, so it
    # lives here rather than under `cluster`. Set to 0 to disable the cutoff.
    unknown_timeout_hours: float = 24.0
    # Wildcard DNS zone serving per-job HTTPS subdomains for running services,
    # e.g. "services.example.org" to publish
    # https://job-<id>.services.example.org/. Requires a matching wildcard
    # certificate and a reverse proxy configured to resolve upstreams via
    # GET /api/apps/resolve. Empty (the default) publishes the service's own
    # http://host:port URL unchanged.
    service_proxy_domain: str = ""
    # Restricts which hosts the service proxy will dial. When set, a service's
    # published upstream hostname must sit inside this DNS zone, e.g.
    # "nodes.example.org" to allow only cluster nodes. Matching is on whole DNS
    # labels, so a leading dot is optional and "evil-nodes.example.org" does not
    # satisfy a zone of "nodes.example.org". Applies to hostnames only: a service
    # that publishes the node's IP address is still accepted, since some clusters
    # do that and a literal has no zone to match. Recommended wherever
    # service_proxy_domain is set: the upstream comes from a file the user's job
    # wrote, so without a zone the proxy will dial any host the Fileglancer host
    # can reach. Empty disables the check.
    service_proxy_upstream_zone: str = ""
    # Restricts which IP addresses the service proxy will dial, as a list of
    # CIDR networks, e.g. ["10.20.0.0/16"] to allow only the cluster's node
    # subnet. The companion to service_proxy_upstream_zone: that one confines
    # upstreams published as hostnames, this one confines upstreams published as
    # addresses, since a bare address has no DNS zone to match. IPv6 entries
    # parse but cannot match anything today: the upstream authority pattern
    # forbids colons in the host, so no IPv6 literal ever reaches this check.
    # Empty disables the check, in which case any
    # address is allowed except those that reach the Fileglancer host itself
    # (loopback, unspecified, link-local, multicast and reserved are always
    # refused regardless of this setting).
    service_proxy_upstream_networks: List[str] = []

    @field_validator('service_proxy_upstream_networks')
    @classmethod
    def validate_service_proxy_upstream_networks(cls, v: List[str]) -> List[str]:
        """Reject unparseable CIDR entries at startup.

        A typo here fails closed — every address upstream stops resolving — so
        it is far better to refuse to start than to let the proxy look
        configured while silently rejecting every service.
        """
        for entry in v:
            try:
                ipaddress.ip_network(entry.strip(), strict=False)
            except ValueError as exc:
                raise ValueError(
                    f"apps.service_proxy_upstream_networks contains an invalid "
                    f"network {entry!r}: {exc}"
                ) from exc
        return v


class Settings(BaseSettings):
    """ Settings can be read from a settings.yaml file, 
        or from the environment, with environment variables prepended 
        with "fgc_" (case insensitive). The environment variables can
        be passed in the environment or in a .env file. 
    """

    log_level: str = 'INFO'
    # 'text' for human-readable logs, 'json' for one ECS-shaped JSON object
    # per line, ready for a log shipper to forward to Elasticsearch/Kibana.
    log_format: str = 'text'
    db_url: str = 'sqlite:///fileglancer.db'
    db_admin_url: Optional[str] = None

    # Database connection pool settings
    db_pool_size: int = 5
    db_max_overflow: int = 0

    # If true, each per-user worker subprocess setuids to the target user
    # before handling requests. Requires root + non-CLI mode (validated at
    # app startup). When false, workers run as the parent process's user —
    # useful for local debugging of the worker code path without root.
    use_access_flags: bool = False

    # Atlassian settings for accessing JIRA services
    atlassian_url: Optional[HttpUrl] = None
    atlassian_username: Optional[str] = None
    atlassian_token: Optional[str] = None

    # The URL of JIRA's /browse/ API endpoint which can be used to construct a link to a ticket
    jira_browse_url: Optional[HttpUrl] = None

    # By default, use a static list of paths to mount as file shares. 
    # To use file share paths from the database, set this to an empty list.
    # You can specify the home directory using a ~/ prefix (will be expanded per-user).
    file_share_mounts: List[str] = ["~/"]
    
    # The external URL of the proxy server for accessing proxied paths.
    # Maps to the /files/ end points of the fileglancer-central app.
    external_proxy_url: Optional[HttpUrl] = None

    # Maximum size of the sharing key LRU cache
    sharing_key_cache_size: int = 1000

    # Maximum number of directory entries reported in total_count for paginated listings.
    # Prevents a full directory scan for the count in very large directories.
    max_directory_count: int = 10000

    # Maximum size in bytes accepted by a PUT /api/content upload. Guards the
    # streaming write path against an unbounded upload filling the disk. 0
    # disables the limit. Default 50 GiB.
    max_upload_size_bytes: int = 50 * 1024 ** 3

    # OKTA OAuth/OIDC settings for authentication
    okta_domain: Optional[str] = None
    okta_client_id: Optional[str] = None
    okta_client_secret: Optional[str] = None
    okta_redirect_uri: Optional[HttpUrl] = None

    # Session management settings
    session_secret_key: Optional[str] = None
    session_expiry_hours: int = 24
    session_cookie_name: str = 'fg_session'
    session_cookie_secure: bool = True  # Set to False for development with self-signed certs

    # Authentication toggle - if False, falls back to $USER environment variable
    enable_okta_auth: bool = False

    # Cross-origin browser apps allowed to call the authenticated API using the
    # logged-in user's session cookie. List full origins (scheme + host + optional
    # port), e.g. "https://ai-cryoet.int.janelia.org" or
    # "https://nextflow.int.janelia.org:8444". Same-origin requests (the
    # Fileglancer UI itself) are always allowed and need not be listed. Requests
    # that carry an Origin header not matching this list are rejected on
    # cookie-authenticated endpoints — this is the CSRF / cross-site boundary for
    # the programmatic API. Empty (default) means only same-origin calls work.
    api_allowed_origins: List[str] = []

    # Which API token scopes this server supports. A scope left out of this list
    # cannot be granted to a new token, and is ignored on tokens that already
    # hold it -- so removing one here genuinely removes the capability rather
    # than only affecting future tokens.
    #
    # files:write and jobs:write are deliberately absent by default. Both amount
    # to full access to the user's files (jobs:write runs arbitrary code as the
    # user), so an admin should opt into them per server rather than inherit
    # them.
    api_token_scopes: List[str] = [
        'files:read',
        'links:read',
        'links:write',
        'jobs:read',
    ]

    # CLI mode - enables auto-login endpoint for standalone CLI usage
    cli_mode: bool = False

    # Shell script sourced at startup to import environment variables.
    # Useful for setting up scheduler env (e.g., /misc/lsf/conf/profile.lsf).
    env_source_script: Optional[str] = None

    # Worker pool settings
    worker_pool_max_workers: int = 50
    worker_pool_idle_timeout: int = 300  # seconds

    # Cluster / Apps settings (mirrors py-cluster-api ClusterConfig)
    cluster: ClusterSettings = ClusterSettings()

    # Apps-specific settings (not passed to py-cluster-api)
    apps: AppsSettings = AppsSettings()

    # Test API key for automated integration testing.
    # NEVER set on production. The bypass activates when this value is set.
    test_api_key: Optional[str] = None

    # Username used when creating a session via the test-login endpoint.
    test_login_username: str = "jacs"

    # Optional path to a viewers configuration YAML file.
    # When set, the file is served at GET /api/viewers-config, allowing
    # runtime customization of OME-Zarr viewers without rebuilding the frontend.
    viewers_config: Optional[str] = None

    model_config = SettingsConfigDict(
        yaml_file="config.yaml",
        env_file='.env',
        env_prefix='fgc_',
        env_nested_delimiter="__",
        env_file_encoding='utf-8'
    )

    @field_validator('external_proxy_url')
    @classmethod
    def validate_external_proxy_url(cls, v):
        if v is None or (isinstance(v, str) and v.strip() == ''):
            raise ValueError("Add external_proxy_url to your config.yaml or FGC_EXTERNAL_PROXY_URL to your .env file")
        return v

    @field_validator('api_token_scopes')
    @classmethod
    def validate_api_token_scopes(cls, v: List[str]) -> List[str]:
        """Reject unknown scope names at startup.

        A typo would otherwise silently narrow what users can mint, which is
        the kind of misconfiguration nobody notices until someone cannot create
        the token they need.
        """
        # Imported here rather than at module scope: auth imports settings, so
        # a top-level import would be circular.
        from fileglancer.auth import API_SCOPES

        unknown = sorted(set(v) - API_SCOPES)
        if unknown:
            raise ValueError(
                f"Unknown api_token_scopes: {', '.join(unknown)}. "
                f"Valid scopes: {', '.join(sorted(API_SCOPES))}")
        return v

    @field_validator('max_directory_count')
    @classmethod
    def validate_max_directory_count(cls, v: int) -> int:
        if v <= 0:
            raise ValueError('max_directory_count must be a positive integer')
        return v
  
    @classmethod
    def settings_customise_sources(  # noqa: PLR0913
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            YamlConfigSettingsSource(settings_cls),
            file_secret_settings,
        )
    
    @model_validator(mode='after')
    def validate_service_proxy_needs_a_session_secret(self):
        """The service proxy signs its hostnames with session_secret_key.

        An unset key is generated at random per process, so under
        `uvicorn --workers N` each worker would sign with a different key and
        most proxied requests would be refused. Fail at startup instead, where
        the cause is obvious.
        """
        if self.apps.service_proxy_domain and not self.session_secret_key:
            raise ValueError(
                "apps.service_proxy_domain requires session_secret_key to be "
                "set: service proxy hostnames are signed with it, and a "
                "per-process random key breaks resolution across workers")
        return self

    @model_validator(mode='after')
    def set_jira_browse_url(self):
        if self.jira_browse_url is None:
            self.jira_browse_url = f"{self.atlassian_url}/browse"
        return self


@cache
def get_settings():
    try:
        return Settings()
    except ValidationError as e:
        # Extract and print only the custom error messages, not the full traceback
        print("\n❌ Configuration Error:", file=sys.stderr)
        for error in e.errors():
            if error.get('type') == 'value_error':
                # Custom validation error for external_proxy_url
                print(f"  {error['msg']}", file=sys.stderr)
            elif error.get('type') == 'missing':
                # Required field is missing
                field = error['loc'][0]
                print(f"  Missing required field: {field}", file=sys.stderr)
            else:
                # Other validation errors
                field = '.'.join(str(loc) for loc in error['loc'])
                print(f"  {field}: {error['msg']}", file=sys.stderr)
        print("", file=sys.stderr)
        sys.exit(1)


def reload_settings():
    """Clear the settings cache and reload from environment/config files.
    Useful when environment variables are set after initial settings load."""
    get_settings.cache_clear()
    return get_settings()
