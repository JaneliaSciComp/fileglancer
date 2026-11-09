"""Tests for the programmatic-API cross-origin allowlist.

Covers the pure origin-check logic (auth.is_origin_allowed) and the end-to-end
enforcement on a cookie-authenticated endpoint (get_current_user ->
enforce_request_origin).
"""
import getpass
import os
import tempfile
import shutil
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from fileglancer import auth
from fileglancer.settings import Settings
from fileglancer.server import create_app
from fileglancer.database import (
    create_engine,
    sessionmaker,
    Base,
    FileSharePathDB,
)


def _req(headers: dict):
    """Minimal stand-in for a Starlette Request for is_origin_allowed().

    The function only reads request.headers.get('origin'/'host') with lowercase
    keys, so a plain lowercase-keyed dict is sufficient.
    """
    return SimpleNamespace(headers={k.lower(): v for k, v in headers.items()})


def _settings(origins):
    return SimpleNamespace(api_allowed_origins=origins)


# --- Unit tests: is_origin_allowed -----------------------------------------

def test_origin_allowed_when_no_origin_header():
    # Same-origin GETs and non-browser clients send no Origin -> allowed.
    assert auth.is_origin_allowed(_req({"host": "fileglancer.int.janelia.org"}),
                                  _settings([])) is True


def test_origin_allowed_when_same_origin():
    # Origin netloc matches the Host the client addressed -> the UI calling
    # its own API. Allowed regardless of the allowlist.
    req = _req({
        "host": "fileglancer.int.janelia.org",
        "origin": "https://fileglancer.int.janelia.org",
    })
    assert auth.is_origin_allowed(req, _settings([])) is True


def test_origin_allowed_when_in_allowlist():
    req = _req({
        "host": "fileglancer.int.janelia.org",
        "origin": "https://ai-cryoet.int.janelia.org",
    })
    settings = _settings(["https://ai-cryoet.int.janelia.org"])
    assert auth.is_origin_allowed(req, settings) is True


def test_origin_rejected_when_not_allowlisted():
    req = _req({
        "host": "fileglancer.int.janelia.org",
        "origin": "https://evil.example.com",
    })
    settings = _settings(["https://ai-cryoet.int.janelia.org"])
    assert auth.is_origin_allowed(req, settings) is False


def test_origin_allowlist_ignores_trailing_slash():
    req = _req({
        "host": "fileglancer.int.janelia.org",
        "origin": "https://ai-cryoet.int.janelia.org",
    })
    settings = _settings(["https://ai-cryoet.int.janelia.org/"])
    assert auth.is_origin_allowed(req, settings) is True


def test_origin_allowlist_respects_port():
    # Dev topology: subdomain plus explicit port must match exactly.
    req = _req({
        "host": "nextflow.int.janelia.org:8443",
        "origin": "https://nextflow.int.janelia.org:8444",
    })
    settings = _settings(["https://nextflow.int.janelia.org:8444"])
    assert auth.is_origin_allowed(req, settings) is True

    # A different port is a different origin and is not allowed.
    req_wrong = _req({
        "host": "nextflow.int.janelia.org:8443",
        "origin": "https://nextflow.int.janelia.org:9999",
    })
    assert auth.is_origin_allowed(req_wrong, settings) is False


def test_origin_scheme_matters():
    # http vs https are distinct origins; only the exact allowlisted one passes.
    req = _req({
        "host": "fileglancer.int.janelia.org",
        "origin": "http://ai-cryoet.int.janelia.org",
    })
    settings = _settings(["https://ai-cryoet.int.janelia.org"])
    assert auth.is_origin_allowed(req, settings) is False


# --- Integration test: enforcement through get_current_user ------------------

@pytest.fixture
def make_auth_app():
    """Factory for a real single-user app with a stable session key and an allowlist."""
    cleanups = []

    def _make(**overrides):
        temp_dir = tempfile.mkdtemp()
        db_path = os.path.join(temp_dir, "test.db")
        db_url = f"sqlite:///{db_path}"

        engine = create_engine(db_url)
        Session = sessionmaker(bind=engine)
        db_session = Session()
        Base.metadata.create_all(engine)
        db_session.add(FileSharePathDB(
            name="tempdir", zone="z", group="g", storage="local",
            mount_path=temp_dir, mac_path="", windows_path="", linux_path="",
        ))
        db_session.commit()

        settings = Settings(**{
            "db_url": db_url,
            "file_share_mounts": [],
            "cli_mode": True,
            "enable_okta_auth": False,
            "session_secret_key": "test-secret-key",
            "session_cookie_secure": False,  # TestClient uses http; allow cookie round-trip
            "api_allowed_origins": ["https://ai-cryoet.int.janelia.org"],
            "simple_auth_password": "hunter2",
            **overrides,
        })

        # get_current_user resolves settings via get_settings() at request time.
        # server.py binds that name at import, so patch it there too (not just in
        # the settings/database modules) — otherwise the real endpoint would look up
        # the session in the default database instead of this test's.
        import fileglancer.settings
        import fileglancer.database
        import fileglancer.server
        original = fileglancer.settings.get_settings
        fileglancer.settings.get_settings = lambda: settings
        fileglancer.database.get_settings = lambda: settings
        fileglancer.server.get_settings = lambda: settings

        def cleanup():
            db_session.close()
            engine.dispose()
            from fileglancer.database import dispose_engine
            dispose_engine(db_url)
            fileglancer.settings.get_settings = original
            fileglancer.database.get_settings = original
            fileglancer.server.get_settings = original
            shutil.rmtree(temp_dir)
        cleanups.append(cleanup)

        return create_app(settings)

    yield _make
    for cleanup in reversed(cleanups):
        cleanup()


@pytest.fixture
def auth_app(make_auth_app):
    return make_auth_app()


@pytest.fixture
def authed_client(auth_app):
    """A TestClient that has logged in via simple auth (cookie in jar)."""
    client = TestClient(auth_app)
    resp = client.post("/api/auth/simple-login", json={"password": "hunter2"})
    assert resp.status_code == 200
    return client


def test_login_needs_only_the_password(auth_app):
    client = TestClient(auth_app)
    assert client.get("/api/auth/status").json() == {
        "authenticated": False, "auth_method": "simple"}
    assert client.get("/api/profile").status_code == 401

    resp = client.post("/api/auth/simple-login", json={"password": "wrong"})
    assert resp.status_code == 401
    assert client.get("/api/profile").status_code == 401

    # A typed username is ignored: the identity is always the OS user, so a
    # typo can no longer split this user's DB rows from their files.
    resp = client.post("/api/auth/simple-login",
                       json={"username": "someoneelse", "password": "hunter2"})
    assert resp.status_code == 200
    assert resp.json()["username"] == getpass.getuser()
    assert client.get("/api/profile").json()["username"] == getpass.getuser()


def test_password_is_generated_when_not_configured():
    settings = Settings(db_url="sqlite://", file_share_mounts=[], cli_mode=True)
    assert settings.simple_auth_password is None
    with TestClient(create_app(settings)):  # runs the lifespan
        assert settings.simple_auth_password


def test_login_fails_closed_without_a_password(make_auth_app):
    client = TestClient(make_auth_app(simple_auth_password=None))
    resp = client.post("/api/auth/simple-login", json={"password": ""})
    assert resp.status_code == 401


def test_access_flags_require_okta():
    with pytest.raises(ValueError, match="use_access_flags requires enable_okta_auth"):
        Settings(db_url="sqlite://", file_share_mounts=[],
                 enable_okta_auth=False, use_access_flags=True)


def test_allowed_origins_endpoint_is_public(auth_app):
    client = TestClient(auth_app)
    resp = client.get("/api/auth/allowed-origins")
    assert resp.status_code == 200
    assert resp.json() == {"origins": ["https://ai-cryoet.int.janelia.org"]}


def test_authed_request_without_origin_allowed(authed_client):
    resp = authed_client.get("/api/preference")
    assert resp.status_code == 200


def test_authed_request_same_origin_allowed(authed_client):
    # TestClient's Host is "testserver"; a matching Origin is same-origin.
    resp = authed_client.get(
        "/api/preference", headers={"Origin": "http://testserver"}
    )
    assert resp.status_code == 200


def test_authed_request_allowlisted_origin_allowed(authed_client):
    resp = authed_client.get(
        "/api/preference",
        headers={"Origin": "https://ai-cryoet.int.janelia.org"},
    )
    assert resp.status_code == 200


def test_authed_request_disallowed_origin_rejected(authed_client):
    resp = authed_client.get(
        "/api/preference",
        headers={"Origin": "https://evil.example.com"},
    )
    assert resp.status_code == 403


def test_disallowed_origin_rejected_before_auth(auth_app):
    # Even without a session, a cross-origin request from a disallowed origin is
    # rejected with 403 (origin check runs before the 401 auth check).
    client = TestClient(auth_app)
    resp = client.get(
        "/api/preference",
        headers={"Origin": "https://evil.example.com"},
    )
    assert resp.status_code == 403

