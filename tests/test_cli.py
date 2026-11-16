"""Tests for how `fileglancer start` finds and seeds its config."""
import yaml

from fileglancer import cli


def test_user_config_path_honors_xdg(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))
    assert cli.user_config_path() == tmp_path / "xdg" / "fileglancer" / "config.yaml"
    monkeypatch.delenv("XDG_CONFIG_HOME")
    monkeypatch.setenv("HOME", str(tmp_path))
    assert cli.user_config_path() == tmp_path / ".config" / "fileglancer" / "config.yaml"


def test_default_config_is_written_once_and_kept_private(tmp_path):
    path = tmp_path / "conf" / "config.yaml"
    assert cli.ensure_config_file(path) is True
    assert path.stat().st_mode & 0o777 == 0o600
    text = path.read_text()
    assert "simple_auth_password" in text
    # The packaged default sets nothing: it is the commented list of settings
    # a personal server user might change, so a fresh install runs on defaults.
    assert yaml.safe_load(text) is None

    path.write_text("log_level: TRACE\n")
    assert cli.ensure_config_file(path) is False
    assert path.read_text() == "log_level: TRACE\n"


def test_session_key_is_generated_once(tmp_path):
    first = cli.persistent_session_key(tmp_path)
    assert len(first) > 30
    assert (tmp_path / "session_secret_key").stat().st_mode & 0o777 == 0o600
    assert cli.persistent_session_key(tmp_path) == first
