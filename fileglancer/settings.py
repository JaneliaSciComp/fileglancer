from typing import List, Optional
from functools import cache

from pydantic import HttpUrl, model_validator
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
    external_proxy_url: HttpUrl = 'http://localhost:7878/files/'

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

    model_config = SettingsConfigDict(
        yaml_file="config.yaml",
        env_file='.env',
        env_prefix='fgc_',
        env_nested_delimiter="__",
        env_file_encoding='utf-8'
    )
  
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
    return Settings()


def reload_settings():
    """Clear the settings cache and reload from environment/config files.
    Useful when environment variables are set after initial settings load."""
    get_settings.cache_clear()
    return get_settings()
