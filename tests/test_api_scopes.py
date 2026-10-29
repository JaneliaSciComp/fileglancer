"""Tests for the API token scope table and scope matching.

Both functions under test are pure, so these are plain table-driven tests
with no database or app fixture.
"""
import pytest

from fileglancer.auth import (
    ANY_SCOPE,
    API_SCOPES,
    required_scope,
    token_has_scope,
)


def test_api_scopes_are_exactly_the_six_documented_names():
    assert API_SCOPES == frozenset({
        "files:read", "files:write",
        "links:read", "links:write",
        "jobs:read", "jobs:write",
    })


@pytest.mark.parametrize("path,method,expected", [
    ("/api/files/tempdir", "GET", "files:read"),
    ("/api/files/tempdir", "POST", "files:write"),
    ("/api/files/tempdir", "PATCH", "files:write"),
    ("/api/files/tempdir", "DELETE", "files:write"),
    ("/api/content/tempdir/a.txt", "GET", "files:read"),
    ("/api/content/tempdir/a.txt", "HEAD", "files:read"),
    ("/api/content/tempdir/a.txt", "PUT", "files:write"),
    ("/api/proxied-path", "GET", "links:read"),
    ("/api/proxied-path", "POST", "links:write"),
    ("/api/proxied-path/abc123", "DELETE", "links:write"),
    ("/api/neuroglancer/nglinks", "GET", "links:read"),
    ("/api/neuroglancer/nglinks", "POST", "links:write"),
    ("/api/jobs", "GET", "jobs:read"),
    ("/api/jobs", "POST", "jobs:write"),
    ("/api/jobs/12/cancel", "POST", "jobs:write"),
    ("/api/cloud-storage/buckets", "GET", "files:read"),
    ("/api/cloud-storage/buckets", "POST", "files:write"),
    ("/api/cloud-storage/buckets/idr", "DELETE", "files:write"),
    ("/api/file-share-paths", "GET", "files:read"),
])
def test_required_scope_maps_path_and_method(path, method, expected):
    assert required_scope(path, method) == expected


@pytest.mark.parametrize("path", ["/api/profile"])
def test_paths_readable_by_any_valid_token(path):
    assert required_scope(path, "GET") == ANY_SCOPE


@pytest.mark.parametrize("path", [
    "/api/ssh-keys",
    "/api/ssh-keys/generate-temp",
    "/api/tokens",
    "/api/tokens/abc123",
    "/api/apps",
    "/api/catalog",
    "/api/preference/foo",
    "/api/ticket",
])
def test_unlisted_paths_are_not_token_reachable(path):
    assert required_scope(path, "GET") is None


def test_prefix_match_does_not_leak_across_similar_paths():
    # "/api/filesystem-admin" must not match the "/api/files" prefix.
    assert required_scope("/api/filesystem-admin", "GET") is None


@pytest.mark.parametrize("granted,required,expected", [
    ("files:read", "files:read", True),
    ("files:read", "files:write", False),
    ("files:write", "files:read", True),      # write implies read
    ("files:write", "files:write", True),
    ("files:read links:write", "links:read", True),
    ("files:read", "links:read", False),
    ("files:write", "jobs:read", False),
    ("", "files:read", False),
])
def test_token_has_scope(granted, required, expected):
    assert token_has_scope(granted, required) is expected


@pytest.mark.parametrize("granted", ["", "files:read", "jobs:write"])
def test_any_scope_is_satisfied_by_any_token(granted):
    assert token_has_scope(granted, ANY_SCOPE) is True


# --- Server-configurable scope set -----------------------------------------

def test_dangerous_scopes_are_absent_from_the_default_config():
    """files:write and jobs:write must be opt-in per server.

    Both amount to full access to the user's files, so inheriting them by
    default would defeat the point of having a scope model at all.
    """
    from fileglancer.settings import Settings

    default = Settings(external_proxy_url="http://localhost/files").api_token_scopes

    assert "files:write" not in default
    assert "jobs:write" not in default
    assert set(default) == {"files:read", "links:read", "links:write", "jobs:read"}


def test_unknown_scope_in_config_is_rejected_at_startup():
    from pydantic import ValidationError
    from fileglancer.settings import Settings

    with pytest.raises(ValidationError, match="Unknown api_token_scopes"):
        Settings(external_proxy_url="http://localhost/files",
                 api_token_scopes=["files:read", "files:delete"])


def test_every_scope_is_configurable():
    """Any subset of the six must be a valid configuration."""
    from fileglancer.settings import Settings

    settings = Settings(external_proxy_url="http://localhost/files",
                        api_token_scopes=sorted(API_SCOPES))

    assert set(settings.api_token_scopes) == API_SCOPES
