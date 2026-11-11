"""Tests for how Settings finds its config file and resolves mode defaults."""
import pytest

from fileglancer.settings import Settings


def test_config_file_env_picks_the_yaml_and_its_sibling_dotenv(tmp_path, monkeypatch):
    confdir = tmp_path / "conf"
    confdir.mkdir()
    (confdir / "config.yaml").write_text("log_level: TRACE\n")
    (confdir / ".env").write_text("FGC_SESSION_COOKIE_NAME=from_dotenv\n")
    # A stray config in the current directory must be ignored.
    monkeypatch.chdir(tmp_path)
    (tmp_path / "config.yaml").write_text("log_level: ERROR\n")
    monkeypatch.setenv("FGC_CONFIG_FILE", str(confdir / "config.yaml"))

    settings = Settings(db_url="sqlite://", file_share_mounts=[])
    assert settings.log_level == "TRACE"
    assert settings.session_cookie_name == "from_dotenv"
    assert settings.model_fields_set >= {"log_level", "session_cookie_name"}


def test_proxy_url_and_cookie_secure_are_optional(monkeypatch):
    monkeypatch.delenv("FGC_EXTERNAL_PROXY_URL", raising=False)
    settings = Settings(db_url="sqlite://", file_share_mounts=[])
    assert settings.external_proxy_url is None
    assert settings.session_cookie_secure is None


def test_access_flags_need_a_scheduler():
    with pytest.raises(ValueError, match="requires a real scheduler"):
        Settings(db_url="sqlite://", file_share_mounts=[], enable_okta_auth=True,
                 use_access_flags=True, cluster={"executor": "local"})
    Settings(db_url="sqlite://", file_share_mounts=[], enable_okta_auth=True,
             use_access_flags=True, cluster={"executor": "lsf"})


def test_jira_browse_url_stays_unset_without_atlassian():
    settings = Settings(db_url="sqlite://", file_share_mounts=[])
    assert settings.jira_browse_url is None
    settings = Settings(db_url="sqlite://", file_share_mounts=[],
                        atlassian_url="https://example.atlassian.net")
    assert str(settings.jira_browse_url) == "https://example.atlassian.net/browse"
