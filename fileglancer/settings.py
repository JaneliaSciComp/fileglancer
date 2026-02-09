from typing import List, Optional
from functools import cache
import sys

from pydantic import HttpUrl, ValidationError, field_validator, model_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    YamlConfigSettingsSource
)


class Settings(BaseSettings):
    """ Settings can be read from a settings.yaml file, 
        or from the environment, with environment variables prepended 
        with "fgc_" (case insensitive). The environment variables can
        be passed in the environment or in a .env file. 
    """

    log_level: str = 'INFO'
    db_url: str = 'sqlite:///fileglancer.db'
    db_admin_url: Optional[str] = None

    # Database connection pool settings
    db_pool_size: int = 5
    db_max_overflow: int = 0

    # If true, use seteuid/setegid for file access
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

    # CLI mode - enables auto-login endpoint for standalone CLI usage
    cli_mode: bool = False

    # Cluster / Apps settings
    cluster_executor: str = 'local'        # "lsf" or "local"
    cluster_queue: Optional[str] = None
    cluster_account: Optional[str] = None
    cluster_poll_interval: float = 10.0
    cluster_log_directory: str = './logs'
    cluster_default_memory: Optional[str] = None    # e.g. "8 GB"
    cluster_default_walltime: Optional[str] = None  # e.g. "04:00"
    cluster_default_cpus: Optional[int] = None

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
