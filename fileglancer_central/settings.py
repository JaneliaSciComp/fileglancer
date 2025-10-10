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

    log_level: str = 'DEBUG'
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

    # If confluence settings are not provided, use a static list of paths to mount as file shares
    # This can specify the home directory using a ~/ prefix.
    file_share_mounts: List[str] = []
    
    # The external URL of the proxy server for accessing proxied paths.
    # Maps to the /files/ end points of the fileglancer-central app.
    external_proxy_url: Optional[HttpUrl] = None

    # Maximum size of the sharing key LRU cache
    sharing_key_cache_size: int = 1000

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
