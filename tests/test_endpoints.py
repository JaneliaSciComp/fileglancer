import json
import os
import tempfile
import shutil
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from urllib.parse import quote

import pytest
from conftest import requires_symlinks
from fastapi.testclient import TestClient
from pydantic import HttpUrl

from fileglancer.settings import Settings
from fileglancer.server import create_app
from fileglancer.database import *
from fileglancer.model import TicketComment

# Test user constant for authentication override
TEST_USERNAME = "testuser"

@pytest.fixture
def temp_dir():
    temp_dir = tempfile.mkdtemp()
    print(f"Created temp directory: {temp_dir}")
    yield temp_dir
    # Clean up the temp directory
    print(f"Cleaning up temp directory: {temp_dir}")
    shutil.rmtree(temp_dir)


@pytest.fixture
def test_app(temp_dir):
    """Create test FastAPI app"""

    # Create temp directory for test database
    db_path = os.path.join(temp_dir, "test.db")
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db_session = Session()
    Base.metadata.create_all(engine)

    fsp = FileSharePathDB(
        name="tempdir",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path=temp_dir,
        mac_path="smb://tempdir/test/path",
        windows_path="\\\\tempdir\\test\\path",
        linux_path="/tempdir/test/path"
    )
    db_session.add(fsp)
    db_session.commit()
    print(f"Created file share path {fsp.name} with mount path {fsp.mount_path}")

    # Create directory for testing proxied paths
    test_proxied_path = os.path.join(temp_dir, "test_proxied_path")
    os.makedirs(test_proxied_path, exist_ok=True)
    test_proxied_path = os.path.join(temp_dir, "new_test_proxied_path")
    os.makedirs(test_proxied_path, exist_ok=True)

    settings = Settings(db_url=db_url, file_share_mounts=[], cli_mode=True)

    # Monkey-patch get_settings to return our test settings
    import fileglancer.settings
    import fileglancer.database

    # Save original functions and clear cache
    original_get_settings = fileglancer.settings.get_settings

    # Replace with test settings
    fileglancer.settings.get_settings = lambda: settings
    fileglancer.database.get_settings = lambda: settings

    app = create_app(settings)

    yield app

    # Cleanup: close all database connections
    db_session.close()
    engine.dispose()
    # Dispose the cached engine from the database module
    from fileglancer.database import dispose_engine
    dispose_engine(db_url)

    # Clear the per-process filestore cache so subsequent tests don't see
    # stale Filestore instances pointing at this test's temp directory
    from fileglancer.user_worker import _filestore_cache, _user_groups_cache
    _filestore_cache.clear()
    _user_groups_cache.clear()

    # Restore original get_settings and clear cache
    fileglancer.settings.get_settings = original_get_settings
    fileglancer.database.get_settings = original_get_settings


@pytest.fixture
def test_client(test_app):
    """Create test client with authentication bypass"""
    # Override the get_current_user dependency to return a test user
    from fileglancer.server import get_current_user

    def override_get_current_user():
        return TEST_USERNAME

    test_app.dependency_overrides[get_current_user] = override_get_current_user
    client = TestClient(test_app)

    yield client

    # Clean up the override after tests
    test_app.dependency_overrides.clear()


def test_robots_txt(test_client):
    """Test robots.txt endpoint"""
    response = test_client.get("/robots.txt")
    assert response.status_code == 200
    assert "text/plain" in response.headers.get('content-type', '')
    assert "User-agent: *" in response.text
    assert "Disallow: /" in response.text


def test_version_endpoint(test_client):
    """Test /api/version endpoint"""
    response = test_client.get("/api/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert isinstance(data["version"], str)


def test_pna_preflight_grants_private_network(test_client):
    """A CORS preflight carrying Access-Control-Request-Private-Network must be
    answered with Access-Control-Allow-Private-Network: true so Chromium permits
    public-origin viewers (e.g. Neuroglancer) to load data from an internal host."""
    response = test_client.options(
        "/files/somekey/some.zarr/.zattrs",
        headers={
            "Origin": "https://neuroglancer-demo.appspot.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert response.headers.get("access-control-allow-private-network") == "true"


def test_pna_header_absent_without_request(test_client):
    """The PNA grant header must not leak onto responses that did not ask for it."""
    response = test_client.get("/api/version")
    assert response.status_code == 200
    assert "access-control-allow-private-network" not in response.headers


def test_root_endpoint(test_client):
    """Test root endpoint - should serve SPA index.html"""
    response = test_client.get("/", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')

def test_spa_routing(test_client):
    """Test /browse and other SPA routes - should serve SPA index.html"""
    response = test_client.get("/browse", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')

    response = test_client.get("/browse/some/path", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')

    response = test_client.get("/login", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')

def test_api_404_returns_json(test_client):
    """Test that invalid API endpoints return JSON 404, not HTML"""
    response = test_client.get("/api/nonexistent", follow_redirects=False)
    assert response.status_code == 404
    assert 'application/json' in response.headers.get('content-type', '')
    data = response.json()
    assert 'error' in data


def test_get_preferences(test_client):
    """Test getting user preferences"""
    response = test_client.get("/api/preference")
    assert response.status_code == 200
    value = response.json()
    assert isinstance(value, dict)
    assert value == {}


def test_get_specific_preference(test_client):
    """Test getting specific user preference"""
    response = test_client.get("/api/preference/unknown_key")
    assert response.status_code == 404


def test_set_preference(test_client):
    """Test setting user preference"""
    pref_data = {"test": "value"}
    response = test_client.put("/api/preference/test_key", json=pref_data)
    assert response.status_code == 200

    response = test_client.get("/api/preference/test_key")
    assert response.status_code == 200
    assert response.json() == pref_data


def test_set_preference_requires_json_content_type(test_client):
    """FastAPI >=0.132 enables strict Content-Type checking by default: a JSON
    body sent without an `application/json` Content-Type is rejected rather than
    silently parsed (the pre-0.132 lenient behavior would have returned 200)."""
    # The normal json= path sets Content-Type: application/json and succeeds.
    assert test_client.put("/api/preference/ct_key", json={"a": 1}).status_code == 200

    # The identical body bytes with a non-JSON Content-Type are not parsed as
    # JSON, so body validation fails. FastAPI raises RequestValidationError
    # (normally 422); this app's validation_exception_handler maps that to 400.
    response = test_client.put(
        "/api/preference/ct_key",
        content='{"a": 1}',
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 400


def test_delete_preference(test_client):
    """Test deleting user preference"""
    pref_data = {"test": "value"}
    response = test_client.put("/api/preference/test_key", json=pref_data)

    response = test_client.delete("/api/preference/test_key")
    assert response.status_code == 200

    response = test_client.delete("/api/preference/unknown_key")
    assert response.status_code == 404


def test_neuroglancer_shortener(test_client):
    """Test creating and retrieving a shortened Neuroglancer state"""
    state = {"layers": [], "title": "Example"}
    encoded_state = quote(json.dumps(state))
    url = f"https://neuroglancer-demo.appspot.com/#!{encoded_state}"

    # Test with short_name - URL should include both short_key and short_name
    response = test_client.post(
        "/api/neuroglancer/nglinks",
        json={"url": url, "short_name": "example-view"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "short_key" in data
    assert data["short_name"] == "example-view"
    assert "state_url" in data
    assert "neuroglancer_url" in data

    short_key = data["short_key"]
    short_name = data["short_name"]
    assert data["state_url"].endswith(f"/ng/{short_key}/{short_name}")
    assert data["neuroglancer_url"].startswith("https://neuroglancer-demo.appspot.com/#!")

    # Retrieving with both short_key and short_name should work
    state_response = test_client.get(f"/ng/{short_key}/{short_name}")
    assert state_response.status_code == 200
    assert state_response.json() == state

    # Retrieving with only short_key should fail (404)
    state_response_simple = test_client.get(f"/ng/{short_key}")
    assert state_response_simple.status_code == 404

    list_response = test_client.get("/api/neuroglancer/nglinks")
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert "links" in list_data
    assert any(link["short_key"] == short_key for link in list_data["links"])


def test_neuroglancer_shortener_no_name(test_client):
    """Test creating a shortened Neuroglancer state without short_name"""
    state = {"layers": []}
    encoded_state = quote(json.dumps(state))
    url = f"https://neuroglancer-demo.appspot.com/#!{encoded_state}"

    response = test_client.post(
        "/api/neuroglancer/nglinks",
        json={"url": url}
    )
    assert response.status_code == 200
    data = response.json()
    assert "short_key" in data
    assert data["short_name"] is None

    short_key = data["short_key"]
    assert data["state_url"].endswith(f"/ng/{short_key}")

    # Retrieving with only short_key should work when no short_name was set
    state_response = test_client.get(f"/ng/{short_key}")
    assert state_response.status_code == 200
    assert state_response.json() == state


def test_create_proxied_path(test_client, temp_dir):
    """Test creating a new proxied path"""
    path = "test_proxied_path"

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == TEST_USERNAME
    assert data["path"] == path
    assert "sharing_key" in data
    assert "sharing_name" in data


def test_create_proxied_path_at_fsp_root(test_client, temp_dir):
    """Data links created at the FSP root must produce working URLs.

    Regression for issue #368: the file browser surfaces FSP root as ".",
    but a literal "." in the share URL gets collapsed by URL normalization
    at the recipient, breaking key/path resolution.
    """
    # Path "." (what the file browser sends at FSP root) should be normalized
    response = test_client.post("/api/proxied-path?fsp_name=tempdir&path=.")
    assert response.status_code == 200
    data = response.json()
    assert data["path"] == "", "FSP-root path should be normalized to empty string"
    assert "." not in data["url_prefix"].split("/"), \
        "url_prefix must not contain a '.' segment that browsers would collapse"
    # Default url_prefix at FSP root falls back to the FSP name
    assert data["url_prefix"] == "tempdir"
    sharing_key = data["sharing_key"]

    # Resolving the share URL at the FSP root should not return Path mismatch.
    # Create a test file at FSP root and verify it's reachable through the link.
    with open(os.path.join(temp_dir, "root_file.txt"), "w") as f:
        f.write("hello root")
    response = test_client.get(f"/files/{sharing_key}/tempdir/root_file.txt")
    assert response.status_code == 200
    assert response.text == "hello root"


def test_data_link_returns_request_id_header(test_client, temp_dir):
    """Serving a data link must return an S3-style x-amz-request-id header.

    Carries over the feature added in x2s3 1.3.0: clients (Neuroglancer/N5/Vizarr)
    can reference a specific request when correlating logs or reporting issues.
    The header should be a 16-char uppercase-alphanumeric string and unique per
    request. It is scoped to the /files/ proxy surface, so non-data endpoints
    must not carry it.
    """
    import re

    response = test_client.post("/api/proxied-path?fsp_name=tempdir&path=.")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    with open(os.path.join(temp_dir, "root_file.txt"), "w") as f:
        f.write("hello root")

    r1 = test_client.get(f"/files/{sharing_key}/tempdir/root_file.txt")
    assert r1.status_code == 200
    request_id = r1.headers.get("x-amz-request-id")
    assert request_id is not None, "data-link response must include x-amz-request-id"
    assert re.fullmatch(r"[A-Z0-9]{16}", request_id), \
        f"x-amz-request-id should be 16 uppercase alphanumerics, got {request_id!r}"

    # Unique per request
    r2 = test_client.get(f"/files/{sharing_key}/tempdir/root_file.txt")
    assert r2.headers.get("x-amz-request-id") != request_id

    # Scoped to data links: non-/files/ endpoints must not carry the header
    api_response = test_client.get("/api/version")
    assert "x-amz-request-id" not in api_response.headers


def test_get_proxied_path_at_fsp_root_normalizes_dot(test_client):
    """Sidebar's `is there a link for the current folder?` query uses path='.'
    when the user is at the FSP root. After creating a link at the FSP root,
    the GET endpoint must return that link for path='.' (frontend never sees
    the backend normalization) — otherwise the sidebar toggle/link UI fails
    to reflect the just-created link.
    """
    # Create the FSP-root link via the same path the file browser sends ("."")
    response = test_client.post("/api/proxied-path?fsp_name=tempdir&path=.")
    assert response.status_code == 200
    created = response.json()
    assert created["path"] == ""

    # Query with path="." (what the sidebar sends) — must find the link.
    response = test_client.get("/api/proxied-path?fsp_name=tempdir&path=.")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert len(paths) == 1, f"expected sidebar query to find the FSP-root link, got {paths}"
    assert paths[0]["sharing_key"] == created["sharing_key"]

    # Query with the normalized form too, for completeness
    response = test_client.get("/api/proxied-path?fsp_name=tempdir&path=")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert len(paths) == 1
    assert paths[0]["sharing_key"] == created["sharing_key"]


def test_create_proxied_path_rejects_dot_url_prefix(test_client):
    """url_prefix containing '.' or '..' segments must be rejected."""
    for bad_prefix in (".", "..", "./foo", "foo/.", "foo/./bar", "foo/../bar"):
        response = test_client.post(
            "/api/proxied-path",
            params={"fsp_name": "tempdir", "path": "test_proxied_path",
                    "url_prefix": bad_prefix},
        )
        assert response.status_code == 400, \
            f"expected 400 for url_prefix={bad_prefix!r}, got {response.status_code}"


def test_resolve_legacy_dot_proxied_path(test_client, temp_dir):
    """Existing DB records with stored path='.' must still resolve.

    Backward-compat for records created before the normalization fix.
    """
    # Directly insert a legacy record bypassing the API normalization
    with open(os.path.join(temp_dir, "legacy.txt"), "w") as f:
        f.write("legacy content")
    from fileglancer.database import get_db_session, ProxiedPathDB
    import secrets
    sharing_key = secrets.token_urlsafe(16)
    # Use the same db_url the test app uses
    db_url = f"sqlite:///{os.path.join(temp_dir, 'test.db')}"
    with get_db_session(db_url) as session:
        session.add(ProxiedPathDB(
            username=TEST_USERNAME,
            sharing_key=sharing_key,
            sharing_name=".",
            fsp_name="tempdir",
            path=".",
            url_prefix=".",
        ))
        session.commit()

    # The recipient's browser collapses the "." segment, so the request that
    # actually arrives at the server has no url_prefix in the path.
    response = test_client.get(f"/files/{sharing_key}/legacy.txt")
    assert response.status_code == 200
    assert response.text == "legacy content"


def test_get_proxied_paths(test_client):
    """Test retrieving proxied paths for a user"""
    path = "test_proxied_path"
    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    response = test_client.get(f"/api/proxied-path")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "paths" in data
    assert isinstance(data["paths"], list)


def test_update_proxied_path(test_client):
    """Test updating a proxied path"""
    # First, create a proxied path to update
    path = "test_proxied_path"
    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    sharing_key = data["sharing_key"]

    # Update the proxied path
    new_path = "new_test_proxied_path"

    response = test_client.put(f"/api/proxied-path/{sharing_key}?fsp_name=tempdir&path={new_path}")
    assert response.status_code == 200
    updated_data = response.json()
    assert updated_data["path"] == new_path


def test_delete_proxied_path(test_client):
    """Test deleting a proxied path"""
    # First, create a proxied path to delete
    path = "test_proxied_path"
    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    sharing_key = data["sharing_key"]

    # Delete the proxied path
    response = test_client.delete(f"/api/proxied-path/{sharing_key}")
    assert response.status_code == 200

    # Verify deletion
    response = test_client.get(f"/api/proxied-path/{sharing_key}")
    assert response.status_code == 404


def test_get_external_buckets(test_client):
    """Test getting external buckets"""
    response = test_client.get("/api/external-buckets")
    assert response.status_code == 200
    data = response.json()
    assert "buckets" in data
    assert isinstance(data["buckets"], list)
    # Should contain external buckets from the database
    # The actual number depends on what's in the database
    assert len(data["buckets"]) >= 0

    # Verify structure of returned buckets if any exist
    if data["buckets"]:
        bucket = data["buckets"][0]
        assert "id" in bucket
        assert "fsp_name" in bucket
        # full_path and external_url are now required fields
        assert "full_path" in bucket
        assert bucket["full_path"] is not None
        assert "external_url" in bucket
        assert bucket["external_url"] is not None
        assert "relative_path" in bucket  # This can still be None


def test_get_file_share_paths(test_client):
    """Test getting file share paths"""
    response = test_client.get("/api/file-share-paths")
    assert response.status_code == 200
    data = response.json()
    assert "paths" in data
    assert isinstance(data["paths"], list)
    # Should have at least the tempdir path we created in the fixture
    assert len(data["paths"]) > 0

    # Verify structure of returned paths
    path = data["paths"][0]
    assert "zone" in path
    assert "name" in path
    assert "mount_path" in path
    assert path["zone"] == "testzone"
    assert path["name"] == "tempdir"


def test_get_files(test_client, temp_dir):
    """Test getting files from a file share path"""
    # Create a test file in the temp directory
    test_file = os.path.join(temp_dir, "test_file.txt")
    with open(test_file, "w") as f:
        f.write("test content")

    response = test_client.get("/api/files/tempdir")
    assert response.status_code == 200
    data = response.json()
    assert "files" in data
    assert isinstance(data["files"], list)

    # Find our test file in the results
    file_names = [f["name"] for f in data["files"]]
    assert "test_file.txt" in file_names


def test_create_directory(test_client, temp_dir):
    """Test creating a directory"""
    response = test_client.post(
        "/api/files/tempdir?subpath=newdir",
        json={"type": "directory"}
    )
    assert response.status_code == 201
    assert os.path.exists(os.path.join(temp_dir, "newdir"))


def test_create_file(test_client, temp_dir):
    """Test creating an empty file"""
    response = test_client.post(
        "/api/files/tempdir?subpath=newfile.txt",
        json={"type": "file"}
    )
    assert response.status_code == 201
    assert os.path.exists(os.path.join(temp_dir, "newfile.txt"))


def test_patch_file_permissions(test_client, temp_dir):
    """Test changing file permissions"""
    # Create a test file
    test_file = os.path.join(temp_dir, "test_perms.txt")
    with open(test_file, "w") as f:
        f.write("test")

    response = test_client.patch(
        "/api/files/tempdir?subpath=test_perms.txt",
        json={"permissions": "-rw-r--r--"}
    )
    assert response.status_code == 200


def test_patch_file_move(test_client, temp_dir):
    """Test moving a file"""
    # Create a test file
    test_file = os.path.join(temp_dir, "move_me.txt")
    with open(test_file, "w") as f:
        f.write("test")

    response = test_client.patch(
        "/api/files/tempdir?subpath=move_me.txt",
        json={"path": "moved.txt"}
    )
    assert response.status_code == 200
    assert not os.path.exists(test_file)
    assert os.path.exists(os.path.join(temp_dir, "moved.txt"))


def test_delete_file(test_client, temp_dir):
    """Test deleting a file"""
    # Create a test file
    test_file = os.path.join(temp_dir, "delete_me.txt")
    with open(test_file, "w") as f:
        f.write("test")

    response = test_client.delete("/api/files/tempdir?subpath=delete_me.txt")
    assert response.status_code == 200
    assert not os.path.exists(test_file)


def test_get_profile(test_client):
    """Test getting user profile"""
    response = test_client.get("/api/profile")
    assert response.status_code == 200
    data = response.json()
    assert "username" in data
    assert "homeFileSharePathName" in data
    assert "homeDirectoryName" in data
    assert "groups" in data
    assert isinstance(data["username"], str)
    assert isinstance(data["groups"], list)


def test_get_notifications_no_file(test_client):
    """Test getting notifications when notifications.yaml doesn't exist"""
    response = test_client.get("/api/notifications")
    assert response.status_code == 200
    data = response.json()
    assert "notifications" in data
    assert isinstance(data["notifications"], list)
    assert len(data["notifications"]) == 0


def test_get_notifications_with_file(test_client, temp_dir):
    """Test getting notifications when notifications.yaml exists"""
    # Create a notifications.yaml file in the current working directory
    notifications_file = os.path.join(os.getcwd(), "notifications.yaml")
    notifications_content = f"""notifications:
  - id: 1
    type: info
    title: Test Notification
    message: This is a test notification
    active: true
    created_at: {datetime.now(timezone.utc).isoformat()}
    expires_at: null
  - id: 2
    type: warning
    title: Expired Notification
    message: This notification is expired
    active: true
    created_at: 2020-01-01T00:00:00Z
    expires_at: 2020-01-02T00:00:00Z
  - id: 3
    type: error
    title: Inactive Notification
    message: This notification is inactive
    active: false
    created_at: {datetime.now(timezone.utc).isoformat()}
    expires_at: null
"""

    try:
        with open(notifications_file, "w") as f:
            f.write(notifications_content)

        response = test_client.get("/api/notifications")
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert isinstance(data["notifications"], list)
        # Should only include the active, non-expired notification
        assert len(data["notifications"]) == 1
        assert data["notifications"][0]["id"] == 1
        assert data["notifications"][0]["type"] == "info"
        assert data["notifications"][0]["title"] == "Test Notification"
    finally:
        # Clean up
        if os.path.exists(notifications_file):
            os.remove(notifications_file)


def test_head_file_content(test_client, temp_dir):
    """Test HEAD request for file content"""
    # Create a test file
    test_file = os.path.join(temp_dir, "content_test.txt")
    test_content = "Hello, World!"
    with open(test_file, "w") as f:
        f.write(test_content)

    response = test_client.head("/api/content/tempdir?subpath=content_test.txt")
    assert response.status_code == 200
    assert "Accept-Ranges" in response.headers
    assert response.headers["Accept-Ranges"] == "bytes"
    assert "Content-Length" in response.headers
    assert int(response.headers["Content-Length"]) == len(test_content)


def test_head_file_content_text_file_is_not_binary(test_client, temp_dir):
    """Test HEAD request returns X-Is-Binary: false for text files"""
    # Create a text file
    test_file = os.path.join(temp_dir, "text_file.txt")
    test_content = "This is a text file with regular content.\n" * 100
    with open(test_file, "w") as f:
        f.write(test_content)

    response = test_client.head("/api/content/tempdir?subpath=text_file.txt")
    assert response.status_code == 200
    assert "X-Is-Binary" in response.headers
    assert response.headers["X-Is-Binary"] == "false"


def test_head_file_content_json_file_is_not_binary(test_client, temp_dir):
    """Test HEAD request returns X-Is-Binary: false for JSON files"""
    # Create a JSON file
    test_file = os.path.join(temp_dir, "data.json")
    test_content = '{"key": "value", "number": 123, "array": [1, 2, 3]}'
    with open(test_file, "w") as f:
        f.write(test_content)

    response = test_client.head("/api/content/tempdir?subpath=data.json")
    assert response.status_code == 200
    assert "X-Is-Binary" in response.headers
    assert response.headers["X-Is-Binary"] == "false"


def test_head_file_content_binary_file_is_binary(test_client, temp_dir):
    """Test HEAD request returns X-Is-Binary: true for binary files"""
    # Create a binary file with null bytes and control characters
    test_file = os.path.join(temp_dir, "binary_file.bin")
    binary_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10'
    with open(test_file, "wb") as f:
        f.write(binary_content)

    response = test_client.head("/api/content/tempdir?subpath=binary_file.bin")
    assert response.status_code == 200
    assert "X-Is-Binary" in response.headers
    assert response.headers["X-Is-Binary"] == "true"


def test_head_file_content_large_text_file_is_not_binary(test_client, temp_dir):
    """Test HEAD request checks only first 4KB for large text files"""
    # Create a large text file (10KB)
    test_file = os.path.join(temp_dir, "large_text.txt")
    # Repeat text to create a 10KB file
    test_content = "This is line number {}\n".format(1) * 500
    with open(test_file, "w") as f:
        f.write(test_content)

    response = test_client.head("/api/content/tempdir?subpath=large_text.txt")
    assert response.status_code == 200
    assert "X-Is-Binary" in response.headers
    assert response.headers["X-Is-Binary"] == "false"


def test_head_file_content_directory_no_binary_check(test_client, temp_dir):
    """Test HEAD request for directory doesn't include X-Is-Binary header"""
    # Create a subdirectory
    test_dir = os.path.join(temp_dir, "test_subdir")
    os.makedirs(test_dir, exist_ok=True)

    response = test_client.head("/api/content/tempdir?subpath=test_subdir")
    assert response.status_code == 200
    # For directories, is_binary should be false (default)
    assert "X-Is-Binary" in response.headers
    assert response.headers["X-Is-Binary"] == "false"


def test_head_file_content_empty_file_is_not_binary(test_client, temp_dir):
    """Test HEAD request returns X-Is-Binary: false for empty files"""
    # Create an empty file
    test_file = os.path.join(temp_dir, "empty_file.txt")
    with open(test_file, "w") as f:
        pass  # Empty file

    response = test_client.head("/api/content/tempdir?subpath=empty_file.txt")
    assert response.status_code == 200
    assert "X-Is-Binary" in response.headers
    assert response.headers["X-Is-Binary"] == "false"


def test_get_file_content(test_client, temp_dir):
    """Test GET request for file content"""
    # Create a test file
    test_file = os.path.join(temp_dir, "download_test.txt")
    test_content = "This is test content for download"
    with open(test_file, "w") as f:
        f.write(test_content)

    response = test_client.get("/api/content/tempdir?subpath=download_test.txt")
    assert response.status_code == 200
    assert response.text == test_content
    assert "Accept-Ranges" in response.headers
    assert response.headers["Accept-Ranges"] == "bytes"


def test_get_file_content_with_range(test_client, temp_dir):
    """Test GET request for file content with Range header"""
    # Create a test file
    test_file = os.path.join(temp_dir, "range_test.txt")
    test_content = "0123456789"
    with open(test_file, "w") as f:
        f.write(test_content)

    # Request bytes 2-5 (should return "2345")
    response = test_client.get(
        "/api/content/tempdir?subpath=range_test.txt",
        headers={"Range": "bytes=2-5"}
    )
    assert response.status_code == 206  # Partial content
    assert response.text == "2345"
    assert "Content-Range" in response.headers
    assert response.headers["Content-Range"] == "bytes 2-5/10"


def test_get_file_content_invalid_range(test_client, temp_dir):
    """Test GET request with invalid range returns 416"""
    # Create a test file
    test_file = os.path.join(temp_dir, "invalid_range_test.txt")
    test_content = "short"
    with open(test_file, "w") as f:
        f.write(test_content)

    # Request range beyond file size
    response = test_client.get(
        "/api/content/tempdir?subpath=invalid_range_test.txt",
        headers={"Range": "bytes=100-200"}
    )
    assert response.status_code == 416  # Range not satisfiable
    assert "Content-Range" in response.headers


def test_get_file_content_directory_error(test_client, temp_dir):
    """Test GET request for directory content returns 400"""
    # Create a directory
    test_dir = os.path.join(temp_dir, "test_directory")
    os.makedirs(test_dir)

    response = test_client.get("/api/content/tempdir?subpath=test_directory")
    assert response.status_code == 400


def test_put_file_content_creates_file(test_client, temp_dir):
    """PUT to /api/content writes body to a new file."""
    content = "hello from the programmatic API"
    response = test_client.put(
        "/api/content/tempdir?subpath=written.txt",
        content=content.encode("utf-8"),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["bytes_written"] == len(content.encode("utf-8"))

    written_path = os.path.join(temp_dir, "written.txt")
    assert os.path.exists(written_path)
    with open(written_path) as f:
        assert f.read() == content


def test_put_file_content_overwrites_file(test_client, temp_dir):
    """PUT replaces the contents of an existing file (truncating)."""
    target = os.path.join(temp_dir, "overwrite.txt")
    with open(target, "w") as f:
        f.write("original much longer content")

    new_content = "new"
    response = test_client.put(
        "/api/content/tempdir?subpath=overwrite.txt",
        content=new_content.encode("utf-8"),
    )
    assert response.status_code == 200
    with open(target) as f:
        assert f.read() == new_content


def test_put_file_content_binary(test_client, temp_dir):
    """PUT writes binary bodies byte-for-byte."""
    data = bytes(range(256))
    response = test_client.put(
        "/api/content/tempdir?subpath=blob.bin",
        content=data,
    )
    assert response.status_code == 200
    with open(os.path.join(temp_dir, "blob.bin"), "rb") as f:
        assert f.read() == data


def test_put_file_content_into_subdir(test_client, temp_dir):
    """PUT writes into an existing subdirectory."""
    os.makedirs(os.path.join(temp_dir, "sub"))
    response = test_client.put(
        "/api/content/tempdir?subpath=sub/nested.txt",
        content=b"nested",
    )
    assert response.status_code == 200
    assert os.path.exists(os.path.join(temp_dir, "sub", "nested.txt"))


def test_put_file_content_missing_parent_dir(test_client, temp_dir):
    """PUT to a path whose parent directory doesn't exist returns 404."""
    response = test_client.put(
        "/api/content/tempdir?subpath=does_not_exist/file.txt",
        content=b"data",
    )
    assert response.status_code == 404


def test_put_file_content_to_directory_fails(test_client, temp_dir):
    """PUT targeting an existing directory returns 400."""
    os.makedirs(os.path.join(temp_dir, "adir"))
    response = test_client.put(
        "/api/content/tempdir?subpath=adir",
        content=b"data",
    )
    assert response.status_code == 400


def test_put_file_content_path_traversal_blocked(test_client, temp_dir):
    """PUT with a traversal subpath is rejected before touching the filesystem."""
    response = test_client.put(
        "/api/content/tempdir?subpath=../escape.txt",
        content=b"data",
    )
    assert response.status_code == 400
    assert not os.path.exists(os.path.join(os.path.dirname(temp_dir), "escape.txt"))


def test_get_content_emits_etag_and_last_modified(test_client, temp_dir):
    """GET content returns an ETag and Last-Modified for concurrency validators."""
    with open(os.path.join(temp_dir, "etagged.txt"), "w") as f:
        f.write("v1")
    response = test_client.get("/api/content/tempdir?subpath=etagged.txt")
    assert response.status_code == 200
    assert response.headers.get("ETag")
    assert response.headers.get("Last-Modified")


def test_put_if_match_matches_succeeds(test_client, temp_dir):
    """PUT with a current If-Match ETag succeeds."""
    with open(os.path.join(temp_dir, "oc.txt"), "w") as f:
        f.write("v1")
    etag = test_client.get("/api/content/tempdir?subpath=oc.txt").headers["ETag"]

    response = test_client.put(
        "/api/content/tempdir?subpath=oc.txt",
        content=b"v2",
        headers={"If-Match": etag},
    )
    assert response.status_code == 200
    with open(os.path.join(temp_dir, "oc.txt")) as f:
        assert f.read() == "v2"


def test_put_if_match_stale_returns_412_and_preserves_file(test_client, temp_dir):
    """A stale If-Match ETag returns 412 and leaves the file untouched."""
    target = os.path.join(temp_dir, "oc2.txt")
    with open(target, "w") as f:
        f.write("original")

    response = test_client.put(
        "/api/content/tempdir?subpath=oc2.txt",
        content=b"clobbered",
        headers={"If-Match": '"stale-etag-value"'},
    )
    assert response.status_code == 412
    with open(target) as f:
        assert f.read() == "original"  # untouched


def test_put_if_match_star_requires_existence(test_client, temp_dir):
    """If-Match: * on a missing file returns 412 (nothing to match)."""
    response = test_client.put(
        "/api/content/tempdir?subpath=missing.txt",
        content=b"data",
        headers={"If-Match": "*"},
    )
    assert response.status_code == 412
    assert not os.path.exists(os.path.join(temp_dir, "missing.txt"))


def test_put_if_unmodified_since_stale_returns_412(test_client, temp_dir):
    """If-Unmodified-Since older than the file's mtime returns 412."""
    target = os.path.join(temp_dir, "oc3.txt")
    with open(target, "w") as f:
        f.write("original")
    # A date well in the past — the file was modified after it.
    response = test_client.put(
        "/api/content/tempdir?subpath=oc3.txt",
        content=b"clobbered",
        headers={"If-Unmodified-Since": "Wed, 01 Jan 2020 00:00:00 GMT"},
    )
    assert response.status_code == 412
    with open(target) as f:
        assert f.read() == "original"


def test_put_if_unmodified_since_fresh_succeeds(test_client, temp_dir):
    """If-Unmodified-Since matching the file's Last-Modified succeeds."""
    with open(os.path.join(temp_dir, "oc4.txt"), "w") as f:
        f.write("v1")
    last_modified = test_client.get(
        "/api/content/tempdir?subpath=oc4.txt"
    ).headers["Last-Modified"]

    response = test_client.put(
        "/api/content/tempdir?subpath=oc4.txt",
        content=b"v2",
        headers={"If-Unmodified-Since": last_modified},
    )
    assert response.status_code == 200


def _set_max_upload(value):
    """Set max_upload_size_bytes on the active (test-patched) settings object."""
    from fileglancer.settings import get_settings
    settings = get_settings()
    prev = settings.max_upload_size_bytes
    settings.max_upload_size_bytes = value
    return settings, prev


def test_put_upload_over_limit_content_length_413(test_client, temp_dir):
    """A declared Content-Length over the limit is rejected before the file opens."""
    settings, prev = _set_max_upload(10)
    try:
        response = test_client.put(
            "/api/content/tempdir?subpath=toobig.txt",
            content=b"x" * 100,
        )
        assert response.status_code == 413
        assert not os.path.exists(os.path.join(temp_dir, "toobig.txt"))
    finally:
        settings.max_upload_size_bytes = prev


def test_put_upload_over_limit_streaming_413(test_client, temp_dir):
    """An upload exceeding the limit is rejected (413), honest or chunked."""
    settings, prev = _set_max_upload(10)
    try:
        def gen():
            for _ in range(5):
                yield b"x" * 8  # 40 bytes total

        response = test_client.put(
            "/api/content/tempdir?subpath=toobig_stream.txt",
            content=gen(),
        )
        assert response.status_code == 413
    finally:
        settings.max_upload_size_bytes = prev


def test_put_upload_within_limit_succeeds(test_client, temp_dir):
    """An upload under the limit still succeeds."""
    settings, prev = _set_max_upload(1000)
    try:
        response = test_client.put(
            "/api/content/tempdir?subpath=ok.txt",
            content=b"small",
        )
        assert response.status_code == 200
    finally:
        settings.max_upload_size_bytes = prev


def test_get_file_content_not_found(test_client):
    """Test GET request for non-existent file returns 404"""
    response = test_client.get("/api/content/tempdir?subpath=nonexistent.txt")
    assert response.status_code == 404


# Ticket endpoint tests with mocked JIRA integration

@patch('fileglancer.server.create_jira_ticket')
@patch('fileglancer.server.get_jira_ticket_details')
def test_create_ticket(mock_get_details, mock_create, test_client, temp_dir):
    """Test creating a new ticket"""
    # Mock JIRA responses
    mock_create.return_value = {'key': 'TEST-123'}
    mock_get_details.return_value = {
        'key': 'TEST-123',
        'created': datetime.now(timezone.utc),
        'updated': datetime.now(timezone.utc),
        'status': 'Open',
        'resolution': 'Unresolved',
        'description': 'Test ticket description',
        'link': HttpUrl('https://jira.example.com/browse/TEST-123'),
        'comments': []
    }

    # Create a test directory in tempdir
    test_path = os.path.join(temp_dir, "test_ticket_path")
    os.makedirs(test_path, exist_ok=True)

    ticket_data = {
        "fsp_name": "tempdir",
        "path": "test_ticket_path",
        "project_key": "TEST",
        "issue_type": "Bug",
        "summary": "Test ticket",
        "description": "This is a test ticket"
    }

    response = test_client.post("/api/ticket", json=ticket_data)
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "TEST-123"
    assert data["username"] == TEST_USERNAME
    assert data["fsp_name"] == "tempdir"
    assert data["path"] == "test_ticket_path"
    assert data["status"] == "Open"
    assert data["resolution"] == "Unresolved"

    # Verify JIRA functions were called
    mock_create.assert_called_once_with(
        project_key="TEST",
        issue_type="Bug",
        summary="Test ticket",
        description="This is a test ticket"
    )
    mock_get_details.assert_called_once_with('TEST-123')


@patch('fileglancer.server.create_jira_ticket')
@patch('fileglancer.server.get_jira_ticket_details')
def test_create_ticket_jira_failure(mock_get_details, mock_create, test_client, temp_dir):
    """Test creating a ticket when JIRA returns invalid response"""
    # Mock JIRA to return invalid response
    mock_create.return_value = {}  # Missing 'key'

    test_path = os.path.join(temp_dir, "test_ticket_path")
    os.makedirs(test_path, exist_ok=True)

    ticket_data = {
        "fsp_name": "tempdir",
        "path": "test_ticket_path",
        "project_key": "TEST",
        "issue_type": "Bug",
        "summary": "Test ticket",
        "description": "This is a test ticket"
    }

    response = test_client.post("/api/ticket", json=ticket_data)
    assert response.status_code == 500
    data = response.json()
    assert "error" in data


@patch('fileglancer.server.create_jira_ticket')
@patch('fileglancer.server.get_jira_ticket_details')
def test_get_tickets(mock_get_details, mock_create, test_client, temp_dir):
    """Test retrieving tickets for a user"""
    # First create a ticket
    mock_create.return_value = {'key': 'TEST-456'}

    # Create a proper TicketComment object
    test_comment = TicketComment(
        author_name='testuser',
        author_display_name='Test User',
        body='Test comment',
        created=datetime.now(timezone.utc),
        updated=datetime.now(timezone.utc)
    )

    mock_get_details.return_value = {
        'key': 'TEST-456',
        'created': datetime.now(timezone.utc),
        'updated': datetime.now(timezone.utc),
        'status': 'In Progress',
        'resolution': 'Unresolved',
        'description': 'Another test ticket',
        'link': HttpUrl('https://jira.example.com/browse/TEST-456'),
        'comments': [test_comment]
    }

    test_path = os.path.join(temp_dir, "test_ticket_path2")
    os.makedirs(test_path, exist_ok=True)

    ticket_data = {
        "fsp_name": "tempdir",
        "path": "test_ticket_path2",
        "project_key": "TEST",
        "issue_type": "Task",
        "summary": "Another ticket",
        "description": "Another test ticket"
    }

    # Create the ticket
    response = test_client.post("/api/ticket", json=ticket_data)
    assert response.status_code == 200

    # Now retrieve tickets
    response = test_client.get("/api/ticket")
    assert response.status_code == 200
    data = response.json()
    assert "tickets" in data
    assert isinstance(data["tickets"], list)
    assert len(data["tickets"]) > 0

    # Check the ticket details
    ticket = data["tickets"][0]
    assert ticket["key"] == "TEST-456"
    assert ticket["status"] == "In Progress"
    assert "comments" in ticket
    assert len(ticket["comments"]) == 1


@patch('fileglancer.server.create_jira_ticket')
@patch('fileglancer.server.get_jira_ticket_details')
def test_get_tickets_with_filters(mock_get_details, mock_create, test_client, temp_dir):
    """Test retrieving tickets with fsp_name and path filters"""
    # Create a ticket
    mock_create.return_value = {'key': 'TEST-789'}
    mock_get_details.return_value = {
        'key': 'TEST-789',
        'created': datetime.now(timezone.utc),
        'updated': datetime.now(timezone.utc),
        'status': 'Resolved',
        'resolution': 'Fixed',
        'description': 'Filtered ticket',
        'link': HttpUrl('https://jira.example.com/browse/TEST-789'),
        'comments': []
    }

    test_path = os.path.join(temp_dir, "filtered_path")
    os.makedirs(test_path, exist_ok=True)

    ticket_data = {
        "fsp_name": "tempdir",
        "path": "filtered_path",
        "project_key": "TEST",
        "issue_type": "Task",
        "summary": "Filtered ticket",
        "description": "Test filtering"
    }

    response = test_client.post("/api/ticket", json=ticket_data)
    assert response.status_code == 200

    # Retrieve with filters
    response = test_client.get("/api/ticket?fsp_name=tempdir&path=filtered_path")
    assert response.status_code == 200
    data = response.json()
    assert len(data["tickets"]) > 0
    assert data["tickets"][0]["path"] == "filtered_path"


@patch('fileglancer.server.get_jira_ticket_details')
def test_get_tickets_jira_unavailable(mock_get_details, test_client):
    """Test retrieving tickets when JIRA details are unavailable"""
    # Mock JIRA to raise an exception
    mock_get_details.side_effect = Exception("JIRA unavailable")

    # This should still return tickets, but with 'Deleted' status
    response = test_client.get("/api/ticket")
    # Should return 404 if no tickets exist, which is expected for clean test
    assert response.status_code == 404


@patch('fileglancer.server.delete_jira_ticket')
def test_delete_ticket(mock_delete, test_client):
    """Test deleting a ticket"""
    # Mock successful deletion
    mock_delete.return_value = None

    response = test_client.delete("/api/ticket/TEST-999")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "TEST-999" in data["message"]

    mock_delete.assert_called_once_with("TEST-999")


@patch('fileglancer.server.delete_jira_ticket')
def test_delete_ticket_not_found(mock_delete, test_client):
    """Test deleting a non-existent ticket"""
    # Mock JIRA to raise "Issue Does Not Exist" exception
    mock_delete.side_effect = Exception("Issue Does Not Exist")

    response = test_client.delete("/api/ticket/NONEXISTENT-123")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data


# Symlink tests for /api/files and /api/content endpoints

@requires_symlinks
def test_get_files_with_symlink_to_same_fsp(test_client, temp_dir):
    """Test /api/files endpoint with a symlink pointing within the same FSP"""
    # Create a target directory within the FSP
    target_dir = os.path.join(temp_dir, "target_directory")
    os.makedirs(target_dir, exist_ok=True)

    # Create a file in the target directory
    target_file = os.path.join(target_dir, "target_file.txt")
    with open(target_file, "w") as f:
        f.write("content in target")

    # Create a symlink within the FSP pointing to the target directory
    symlink_path = os.path.join(temp_dir, "link_to_target")
    os.symlink(target_dir, symlink_path)

    # Request files through the symlink
    response = test_client.get("/api/files/tempdir?subpath=link_to_target")
    assert response.status_code == 200
    data = response.json()
    assert "files" in data

    # Verify we can see the target file through the symlink
    file_names = [f["name"] for f in data["files"]]
    assert "target_file.txt" in file_names


@requires_symlinks
def test_get_files_with_symlink_outside_fsp(test_client, temp_dir):
    """Test /api/files endpoint with a symlink pointing outside the FSP"""
    # Create a separate directory outside the temp_dir (FSP root)
    external_dir = tempfile.mkdtemp()

    try:
        # Create a file in the external directory
        external_file = os.path.join(external_dir, "external_file.txt")
        with open(external_file, "w") as f:
            f.write("external content")

        # Create another FSP for the external directory
        from fileglancer.database import FileSharePathDB, get_db_session
        from fileglancer.settings import get_settings
        settings = get_settings()

        with get_db_session(settings.db_url) as session:
            external_fsp = FileSharePathDB(
                name="external",
                zone="testzone",
                group="testgroup",
                storage="local",
                mount_path=external_dir,
                mac_path=external_dir,
                windows_path=external_dir,
                linux_path=external_dir
            )
            session.add(external_fsp)
            session.commit()

            # Create a symlink in the original FSP pointing to the external directory
            symlink_path = os.path.join(temp_dir, "link_to_external")
            os.symlink(external_dir, symlink_path)

            # Request files through the symlink - should get a redirect (307) that gets followed
            response = test_client.get("/api/files/tempdir?subpath=link_to_external", follow_redirects=False)
            assert response.status_code == 307

            # Verify redirect location
            assert "location" in response.headers
            expected_location = "/api/files/external"
            assert response.headers["location"] == expected_location

            # Follow the redirect and verify we get the external directory listing
            response_followed = test_client.get("/api/files/tempdir?subpath=link_to_external", follow_redirects=True)
            assert response_followed.status_code == 200
            data = response_followed.json()
            assert "files" in data
            file_names = [f["name"] for f in data["files"]]
            assert "external_file.txt" in file_names

    finally:
        # Clean up external directory
        shutil.rmtree(external_dir)


@requires_symlinks
def test_get_files_with_nested_symlink_outside_fsp(test_client, temp_dir):
    """Test /api/files endpoint with a symlink pointing outside FSP to a subdirectory"""
    # Create a separate directory outside the temp_dir (FSP root - created above)
    external_dir = tempfile.mkdtemp()

    try:
        # Create a subdirectory in the external directory
        external_subdir = os.path.join(external_dir, "subdir")
        os.makedirs(external_subdir, exist_ok=True)

        # Create a file in the external subdirectory
        external_file = os.path.join(external_subdir, "external_file.txt")
        with open(external_file, "w") as f:
            f.write("external nested content")

        # Create another FSP for the external directory
        from fileglancer.database import FileSharePathDB, get_db_session
        from fileglancer.settings import get_settings
        settings = get_settings()

        with get_db_session(settings.db_url) as session:
            external_fsp = FileSharePathDB(
                name="external",
                zone="testzone",
                group="testgroup",
                storage="local",
                mount_path=external_dir,
                mac_path=external_dir,
                windows_path=external_dir,
                linux_path=external_dir
            )
            session.add(external_fsp)
            session.commit()

            # Create a symlink in the original FSP pointing to the external subdirectory
            symlink_path = os.path.join(temp_dir, "link_to_external_subdir")
            os.symlink(external_subdir, symlink_path)

            # Request files through the symlink - should get a redirect (307) that gets followed
            response = test_client.get("/api/files/tempdir?subpath=link_to_external_subdir", follow_redirects=False)
            assert response.status_code == 307

            # Verify redirect location
            assert "location" in response.headers
            expected_location = "/api/files/external?subpath=subdir"
            assert response.headers["location"] == expected_location

            # Follow the redirect and verify we get the external subdirectory listing
            response_followed = test_client.get("/api/files/tempdir?subpath=link_to_external_subdir", follow_redirects=True)
            assert response_followed.status_code == 200
            data = response_followed.json()
            assert "files" in data
            file_names = [f["name"] for f in data["files"]]
            assert "external_file.txt" in file_names

    finally:
        # Clean up external directory
        shutil.rmtree(external_dir)


@requires_symlinks
def test_get_files_with_symlink_no_matching_fsp(test_client, temp_dir):
    """Test /api/files endpoint with a symlink pointing to a path with no matching FSP"""
    # Create a separate directory outside the temp_dir
    external_dir = tempfile.mkdtemp()

    try:
        # Create a file in the external directory
        external_file = os.path.join(external_dir, "orphan_file.txt")
        with open(external_file, "w") as f:
            f.write("orphan content")

        # Create a symlink in the original FSP pointing to the external directory
        # But DON'T create an FSP for it
        symlink_path = os.path.join(temp_dir, "link_to_orphan")
        os.symlink(external_dir, symlink_path)

        # Request files through the symlink - should get a 400 error (path escapes root)
        response = test_client.get("/api/files/tempdir?subpath=link_to_orphan")
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        # The error message comes from RootCheckError
        assert "path" in data["error"].lower()

    finally:
        # Clean up external directory
        shutil.rmtree(external_dir)


@requires_symlinks
def test_get_content_with_symlink_to_same_fsp(test_client, temp_dir):
    """Test /api/content endpoint with a symlink pointing within the same FSP"""
    # Create a target file within the FSP
    target_file = os.path.join(temp_dir, "target_content.txt")
    target_content = "This is the target file content"
    with open(target_file, "w") as f:
        f.write(target_content)

    # Create a symlink within the FSP pointing to the target file
    symlink_path = os.path.join(temp_dir, "link_to_content")
    os.symlink(target_file, symlink_path)

    # Request content through the symlink
    response = test_client.get("/api/content/tempdir?subpath=link_to_content")
    assert response.status_code == 200
    assert response.text == target_content


@requires_symlinks
def test_get_content_with_symlink_outside_fsp(test_client, temp_dir):
    """Test /api/content endpoint with a symlink pointing outside the FSP"""
    # Create a separate directory outside the temp_dir (FSP root)
    external_dir = tempfile.mkdtemp()

    try:
        # Create a file in the external directory
        external_file = os.path.join(external_dir, "external_content.txt")
        external_content = "This is external content"
        with open(external_file, "w") as f:
            f.write(external_content)

        # Create another FSP for the external directory
        from fileglancer.database import FileSharePathDB, get_db_session
        from fileglancer.settings import get_settings
        settings = get_settings()

        with get_db_session(settings.db_url) as session:
            external_fsp = FileSharePathDB(
                name="external",
                zone="testzone",
                group="testgroup",
                storage="local",
                mount_path=external_dir,
                mac_path=external_dir,
                windows_path=external_dir,
                linux_path=external_dir
            )
            session.add(external_fsp)
            session.commit()

            # Create a symlink in the original FSP pointing to the external file
            symlink_path = os.path.join(temp_dir, "link_to_external_content")
            os.symlink(external_file, symlink_path)

            # Request content through the symlink - should get a redirect (307) that gets followed
            response = test_client.get("/api/content/tempdir?subpath=link_to_external_content", follow_redirects=False)
            assert response.status_code == 307

            # Verify redirect location
            assert "location" in response.headers
            expected_location = "/api/content/external?subpath=external_content.txt"
            assert response.headers["location"] == expected_location

            # Follow the redirect and verify we get the external file content
            response_followed = test_client.get("/api/content/tempdir?subpath=link_to_external_content", follow_redirects=True)
            assert response_followed.status_code == 200
            assert response_followed.text == external_content

    finally:
        # Clean up external directory
        shutil.rmtree(external_dir)


@requires_symlinks
def test_get_content_with_symlink_no_matching_fsp(test_client, temp_dir):
    """Test /api/content endpoint with a symlink pointing to a path with no matching FSP"""
    # Create a separate directory outside the temp_dir
    external_dir = tempfile.mkdtemp()

    try:
        # Create a file in the external directory
        external_file = os.path.join(external_dir, "orphan_content.txt")
        with open(external_file, "w") as f:
            f.write("orphan content")

        # Create a symlink in the original FSP pointing to the external file
        # But DON'T create an FSP for it
        symlink_path = os.path.join(temp_dir, "link_to_orphan_content")
        os.symlink(external_file, symlink_path)

        # Request content through the symlink - should get a 400 error (path escapes root)
        response = test_client.get("/api/content/tempdir?subpath=link_to_orphan_content")
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        # The error message comes from RootCheckError
        assert "path" in data["error"].lower()

    finally:
        # Clean up external directory
        shutil.rmtree(external_dir)


@requires_symlinks
def test_get_content_traversal_through_directory_symlink(test_client, temp_dir):
    """Test that accessing a file through a directory symlink pointing outside the FSP is blocked"""
    external_dir = tempfile.mkdtemp()

    try:
        # Create a file in the external directory
        external_file = os.path.join(external_dir, "secret.txt")
        with open(external_file, "w") as f:
            f.write("sensitive data")

        # Create a directory symlink in the FSP pointing to the external directory
        symlink_path = os.path.join(temp_dir, "link_to_external_dir")
        os.symlink(external_dir, symlink_path)

        # Try to access a file *through* the directory symlink
        response = test_client.get(
            "/api/content/tempdir?subpath=link_to_external_dir/secret.txt"
        )
        # Should be blocked — the resolved path escapes the FSP root
        assert response.status_code == 400

    finally:
        shutil.rmtree(external_dir)


@requires_symlinks
def test_get_content_double_hop_symlink(test_client, temp_dir):
    """Test that accessing a file through a chain of symlinks pointing outside the FSP is blocked"""
    external_dir = tempfile.mkdtemp()
    hop_dir = tempfile.mkdtemp()

    try:
        # Create a file in the external directory
        external_file = os.path.join(external_dir, "secret.txt")
        with open(external_file, "w") as f:
            f.write("sensitive data")

        # Create first hop: hop_dir/hop2 -> external_dir
        hop2_path = os.path.join(hop_dir, "hop2")
        os.symlink(external_dir, hop2_path)

        # Create second hop in the FSP: double_hop -> hop_dir/hop2
        symlink_path = os.path.join(temp_dir, "double_hop")
        os.symlink(hop2_path, symlink_path)

        # Try to access a file through the double-hop symlink
        response = test_client.get(
            "/api/content/tempdir?subpath=double_hop/secret.txt"
        )
        # Should be blocked — the resolved path escapes the FSP root
        assert response.status_code == 400

    finally:
        shutil.rmtree(external_dir)
        shutil.rmtree(hop_dir)


@requires_symlinks
def test_head_content_with_symlink(test_client, temp_dir):
    """Test HEAD request to /api/content endpoint with a symlink"""
    # Create a target file within the FSP
    target_file = os.path.join(temp_dir, "target_head.txt")
    target_content = "Content for HEAD request"
    with open(target_file, "w") as f:
        f.write(target_content)

    # Create a symlink within the FSP pointing to the target file
    symlink_path = os.path.join(temp_dir, "link_to_head")
    os.symlink(target_file, symlink_path)

    # HEAD request through the symlink
    response = test_client.head("/api/content/tempdir?subpath=link_to_head")
    assert response.status_code == 200
    assert "Accept-Ranges" in response.headers
    assert response.headers["Accept-Ranges"] == "bytes"
    assert "Content-Length" in response.headers
    assert int(response.headers["Content-Length"]) == len(target_content)


def test_create_non_transparent_proxied_path(test_client, temp_dir):
    """Test creating a non-transparent link uses basename in URL"""
    path = "test_proxied_path"

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    # URL should use basename (last path component)
    assert data["url"].endswith(f"/{data['sharing_key']}/test_proxied_path")


def test_create_proxied_path_with_custom_url_prefix(test_client, temp_dir):
    """Test creating a link with a custom url_prefix"""
    # Create nested dirs for a multi-segment path
    nested_path = os.path.join(temp_dir, "a", "b", "c")
    os.makedirs(nested_path, exist_ok=True)
    path = "a/b/c"

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}&url_prefix=custom/prefix")
    assert response.status_code == 200
    data = response.json()
    # URL should use the custom url_prefix
    assert data["url"].endswith(f"/{data['sharing_key']}/custom/prefix")
    assert data["url_prefix"] == "custom/prefix"


def test_proxy_resolve_non_transparent(test_client, temp_dir):
    """Test that a non-transparent link resolves correctly via basename prefix match"""
    # Create a file inside the proxied directory
    proxied_dir = os.path.join(temp_dir, "test_proxied_path")
    test_file = os.path.join(proxied_dir, "data.txt")
    with open(test_file, "w") as f:
        f.write("hello")

    # Create the non-transparent link
    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path=test_proxied_path")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    # Access through the proxy using basename prefix
    response = test_client.get(f"/files/{sharing_key}/test_proxied_path/data.txt")
    assert response.status_code == 200
    assert response.text == "hello"


def test_proxy_resolve_custom_url_prefix(test_client, temp_dir):
    """Test that a link with custom url_prefix resolves correctly"""
    nested_dir = os.path.join(temp_dir, "a", "b")
    os.makedirs(nested_dir, exist_ok=True)
    test_file = os.path.join(nested_dir, "data.txt")
    with open(test_file, "w") as f:
        f.write("custom prefix hello")

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path=a/b&url_prefix=my/custom/prefix")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    # Access through the proxy using the custom url_prefix
    response = test_client.get(f"/files/{sharing_key}/my/custom/prefix/data.txt")
    assert response.status_code == 200
    assert response.text == "custom prefix hello"


def test_proxy_path_boundary_guard(test_client, temp_dir):
    """Test that prefix 'foo' does NOT match 'foobar/file' (path boundary enforcement)"""
    # Create two directories: "foo" and "foobar"
    foo_dir = os.path.join(temp_dir, "foo")
    foobar_dir = os.path.join(temp_dir, "foobar")
    os.makedirs(foo_dir, exist_ok=True)
    os.makedirs(foobar_dir, exist_ok=True)
    with open(os.path.join(foobar_dir, "secret.txt"), "w") as f:
        f.write("secret")

    # Create a non-transparent link for "foo"
    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path=foo")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    # Try to access "foobar/secret.txt" via the "foo" sharing key - should fail
    response = test_client.get(f"/files/{sharing_key}/foobar/secret.txt")
    assert response.status_code == 404


def test_proxy_resolve_url_encoded_path_non_transparent(test_client, temp_dir):
    """Test that a non-transparent link resolves when the basename contains URL-encoded characters"""
    dir_name = "my data set"
    proxied_dir = os.path.join(temp_dir, dir_name)
    os.makedirs(proxied_dir, exist_ok=True)
    with open(os.path.join(proxied_dir, "file.txt"), "w") as f:
        f.write("encoded hello")

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={dir_name}")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    # Request with URL-encoded space (%20) in the basename
    response = test_client.get(f"/files/{sharing_key}/my%20data%20set/file.txt")
    assert response.status_code == 200
    assert response.text == "encoded hello"


def test_proxy_resolve_url_encoded_path_custom_prefix(test_client, temp_dir):
    """Test that a link with URL-encoded characters in url_prefix resolves correctly"""
    nested_dir = os.path.join(temp_dir, "my folder", "sub dir")
    os.makedirs(nested_dir, exist_ok=True)
    with open(os.path.join(nested_dir, "file.txt"), "w") as f:
        f.write("encoded custom prefix hello")

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path=my folder/sub dir&url_prefix=my folder/sub dir")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    # Request with URL-encoded spaces in the url_prefix
    response = test_client.get(f"/files/{sharing_key}/my%20folder/sub%20dir/file.txt")
    assert response.status_code == 200
    assert response.text == "encoded custom prefix hello"


def test_proxy_resolve_special_characters_in_path(test_client, temp_dir):
    """Test that paths with special characters (parentheses, brackets, etc.) resolve correctly"""
    dir_name = "experiment (2) [final]"
    proxied_dir = os.path.join(temp_dir, dir_name)
    os.makedirs(proxied_dir, exist_ok=True)
    with open(os.path.join(proxied_dir, "result.txt"), "w") as f:
        f.write("special chars")

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={dir_name}")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    response = test_client.get(f"/files/{sharing_key}/experiment%20%282%29%20%5Bfinal%5D/result.txt")
    assert response.status_code == 200
    assert response.text == "special chars"


def test_proxy_reject_mismatched_url_prefix(test_client, temp_dir):
    """Test that a link rejects requests with a different prefix than url_prefix"""
    nested_dir = os.path.join(temp_dir, "a", "b")
    os.makedirs(nested_dir, exist_ok=True)
    with open(os.path.join(nested_dir, "file.txt"), "w") as f:
        f.write("should not be accessible")

    # Create link for "a/b" with default url_prefix (basename "b")
    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path=a/b")
    assert response.status_code == 200
    sharing_key = response.json()["sharing_key"]

    # Attempt to access via full path "a/b" — should be rejected since url_prefix is just "b"
    response = test_client.get(f"/files/{sharing_key}/a/b/file.txt")
    assert response.status_code == 404


@requires_symlinks
def test_broken_symlink_in_file_listing(test_client, temp_dir):
    """Test that broken symlinks appear in /api/files response with correct properties"""
    # Create a broken symlink pointing to a nonexistent path
    broken_link_path = os.path.join(temp_dir, "broken_link")
    os.symlink("/nonexistent/path", broken_link_path)

    # Create a regular file for comparison
    regular_file = os.path.join(temp_dir, "regular.txt")
    with open(regular_file, "w") as f:
        f.write("content")

    # Request file listing
    response = test_client.get("/api/files/tempdir")
    assert response.status_code == 200

    data = response.json()
    files = data["files"]

    # Find broken symlink in response
    broken_link_file = next((f for f in files if f["name"] == "broken_link"), None)
    assert broken_link_file is not None, "Broken symlink should be in response"
    assert broken_link_file["is_symlink"] is True, "Should be marked as symlink"
    assert broken_link_file["symlink_target_fsp"] is None, "Target should be None for broken symlink"

    # Regular file should also be present
    regular = next((f for f in files if f["name"] == "regular.txt"), None)
    assert regular is not None, "Regular file should be in response"
    assert regular["is_symlink"] is False, "Regular file should not be marked as symlink"


def test_viewers_config_not_set(test_client):
    """Test that /api/viewers-config returns 404 when viewers_config is not set"""
    response = test_client.get("/api/viewers-config")
    assert response.status_code == 404


def test_viewers_config_file_exists(temp_dir):
    """Test that /api/viewers-config returns file contents as text/yaml when file exists"""
    # Create a test viewers config file
    config_content = "viewers:\n  - manifest_url: 'https://example.com/manifest.yaml'\n"
    config_path = os.path.join(temp_dir, "viewers.config.yaml")
    with open(config_path, 'w') as f:
        f.write(config_content)

    # Create app with viewers_config set
    db_path = os.path.join(temp_dir, "test_vc.db")
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db_session = Session()
    Base.metadata.create_all(engine)

    settings = Settings(db_url=db_url, file_share_mounts=[], viewers_config=config_path)

    import fileglancer.settings
    import fileglancer.database
    original_get_settings = fileglancer.settings.get_settings
    fileglancer.settings.get_settings = lambda: settings
    fileglancer.database.get_settings = lambda: settings

    app = create_app(settings)
    from fileglancer.server import get_current_user
    app.dependency_overrides[get_current_user] = lambda: "testuser"
    client = TestClient(app)

    try:
        response = client.get("/api/viewers-config")
        assert response.status_code == 200
        assert "text/yaml" in response.headers["content-type"]
        assert response.text == config_content
    finally:
        db_session.close()
        engine.dispose()
        from fileglancer.database import dispose_engine
        dispose_engine(db_url)
        fileglancer.settings.get_settings = original_get_settings
        fileglancer.database.get_settings = original_get_settings


def test_viewers_config_file_missing(temp_dir):
    """Test that /api/viewers-config returns 404 when configured file doesn't exist"""
    db_path = os.path.join(temp_dir, "test_vcm.db")
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db_session = Session()
    Base.metadata.create_all(engine)

    settings = Settings(db_url=db_url, file_share_mounts=[], viewers_config="/nonexistent/viewers.config.yaml")

    import fileglancer.settings
    import fileglancer.database
    original_get_settings = fileglancer.settings.get_settings
    fileglancer.settings.get_settings = lambda: settings
    fileglancer.database.get_settings = lambda: settings

    app = create_app(settings)
    from fileglancer.server import get_current_user
    app.dependency_overrides[get_current_user] = lambda: "testuser"
    client = TestClient(app)

    try:
        response = client.get("/api/viewers-config")
        assert response.status_code == 404
    finally:
        db_session.close()
        engine.dispose()
        from fileglancer.database import dispose_engine
        dispose_engine(db_url)
        fileglancer.settings.get_settings = original_get_settings
        fileglancer.database.get_settings = original_get_settings


# --- S3 bucket-root listing of data links -----------------------------------

def _make_data_link(test_client, temp_dir):
    """Create a data link over a small tree, returning (sharing_key, url_prefix)."""
    os.makedirs(os.path.join(temp_dir, "test_proxied_path", "sub"), exist_ok=True)
    with open(os.path.join(temp_dir, "test_proxied_path", "a.txt"), "w") as f:
        f.write("hello link")
    response = test_client.post("/api/proxied-path?fsp_name=tempdir&path=test_proxied_path")
    assert response.status_code == 200
    data = response.json()
    return data["sharing_key"], data["url_prefix"]


def _listing(test_client, url):
    from x2s3.utils import parse_xml
    response = test_client.get(url)
    assert response.status_code == 200, response.text
    root = parse_xml(response.text)
    assert root.tag == "ListBucketResult"
    return root


def _keys(root):
    return ([c.find('Key').text for c in root.findall('Contents')],
            [cp.find('Prefix').text for cp in root.findall('CommonPrefixes')])


def test_bucket_root_lists_data_link(test_client, temp_dir):
    """Browsing a data link means listing the /files bucket under its key prefix.

    That is how Neuroglancer lists a directory over plain https: it reads the
    first path segment of the share URL as the bucket and the rest as a prefix.
    """
    sharing_key, url_prefix = _make_data_link(test_client, temp_dir)
    prefix = f"{sharing_key}/{url_prefix}/"

    root = _listing(test_client, f"/files/?list-type=2&prefix={prefix}&delimiter=/&encoding-type=url")
    assert root.find('Name').text == "files"
    assert root.find('Prefix').text == prefix
    keys, common_prefixes = _keys(root)
    assert keys == [f"{prefix}a.txt"]
    assert common_prefixes == [f"{prefix}sub/"]

    # The keys are relative to the bucket, so they resolve as share URLs
    response = test_client.get(f"/files/{keys[0]}")
    assert response.status_code == 200
    assert response.text == "hello link"


def test_bucket_root_lists_link_name_as_folder(test_client, temp_dir):
    """The link name is not on disk, but it browses like a folder."""
    sharing_key, url_prefix = _make_data_link(test_client, temp_dir)

    # As with a real folder, a prefix is truncated at the next delimiter
    cases = [(f"{sharing_key}", f"{sharing_key}/"),
             (f"{sharing_key}/", f"{sharing_key}/{url_prefix}/"),
             (f"{sharing_key}/{url_prefix[:3]}", f"{sharing_key}/{url_prefix}/")]
    for prefix, expected in cases:
        root = _listing(test_client, f"/files/?list-type=2&prefix={prefix}&delimiter=/")
        keys, common_prefixes = _keys(root)
        assert keys == []
        assert common_prefixes == [expected]


def test_bucket_root_does_not_enumerate_sharing_keys(test_client, temp_dir):
    """Sharing keys are secret: the bucket root never gives one away.

    A missing, partial or unknown key all produce the same empty listing, so
    the endpoint can't be probed for valid keys.
    """
    sharing_key, _ = _make_data_link(test_client, temp_dir)

    for prefix in ["", sharing_key[:6], "zzzzzzzzzzzz", "zzzzzzzzzzzz/data/"]:
        root = _listing(test_client, f"/files/?list-type=2&prefix={prefix}&delimiter=/")
        keys, common_prefixes = _keys(root)
        assert keys == [], f"leaked contents for prefix {prefix!r}"
        assert common_prefixes == [], f"leaked a sharing key for prefix {prefix!r}"
        assert root.find('KeyCount').text == '0'
        assert root.find('IsTruncated').text == 'false'

    # Listing has to stay a valid, successful S3 response even when empty:
    # Neuroglancer caches "this server can't list" per origin on an error,
    # which would turn off browsing for the valid links too.
    assert test_client.get("/files/?list-type=2").status_code == 200
    # Without a trailing slash the request still reaches the bucket root
    assert test_client.get("/files?list-type=2").status_code == 200


def test_bucket_root_is_not_an_object(test_client):
    """The bucket root is only a listing endpoint, never the SPA or a file."""
    from x2s3.utils import parse_xml
    response = test_client.get("/files/")
    assert response.status_code == 404
    assert parse_xml(response.text).find('Code').text == 'NoSuchKey'
    assert test_client.get("/files/?list-type=1").status_code == 400


def test_sharing_key_as_bucket_agrees_with_bucket_root(test_client, temp_dir):
    """A client can also treat the sharing key itself as the bucket.

    Neuroglancer races both readings of a share URL and keeps whichever
    answers first, so the two must resolve to the same files.
    """
    sharing_key, url_prefix = _make_data_link(test_client, temp_dir)

    root = _listing(test_client, f"/files/{sharing_key}/?list-type=2&prefix={url_prefix}/&delimiter=/")
    assert root.find('Name').text == sharing_key
    keys, common_prefixes = _keys(root)
    assert keys == [f"{url_prefix}/a.txt"]
    assert common_prefixes == [f"{url_prefix}/sub/"]

    bucket_root = _listing(
        test_client, f"/files/?list-type=2&prefix={sharing_key}/{url_prefix}/&delimiter=/")
    root_keys, root_common = _keys(bucket_root)
    # Both readings name the same URLs: the sharing key is the bucket in one
    # and the first key segment in the other.
    assert [f"/files/{sharing_key}/{k}" for k in keys] == [f"/files/{k}" for k in root_keys]
    assert [f"/files/{sharing_key}/{p}" for p in common_prefixes] == [f"/files/{p}" for p in root_common]


def test_bucket_root_lists_names_with_spaces(test_client, temp_dir):
    """Names that need encoding have to survive the listing.

    A client reads a key out of the listing and asks for it back, so a space
    has to come back as %20 (which decodes to a space) rather than '+' (which
    does not).
    """
    os.makedirs(os.path.join(temp_dir, "my data", "sub dir"), exist_ok=True)
    with open(os.path.join(temp_dir, "my data", "my file.txt"), "w") as f:
        f.write("spaced")
    response = test_client.post("/api/proxied-path", params={"fsp_name": "tempdir", "path": "my data"})
    assert response.status_code == 200
    data = response.json()
    sharing_key, url_prefix = data["sharing_key"], data["url_prefix"]
    assert url_prefix == "my%20data", "link names are stored percent-encoded"

    # The link name reaches the server either as stored or decoded, depending
    # on how far the client unwound the share URL, and both have to list
    for name in [url_prefix, "my data"]:
        root = _listing(test_client, "/files/?list-type=2&delimiter=/&encoding-type=url"
                                     f"&prefix={quote(f'{sharing_key}/{name}/')}")
        keys, common_prefixes = _keys(root)
        assert len(keys) == 1 and keys[0].endswith("/my%20file.txt"), keys
        assert len(common_prefixes) == 1 and common_prefixes[0].endswith("/sub%20dir/"), common_prefixes

        # Whatever the listing reported, asking for it back reaches the file
        response = test_client.get(f"/files/{keys[0]}")
        assert response.status_code == 200
        assert response.text == "spaced"


def test_views_crud(test_client):
    # create
    resp = test_client.post("/api/neuroglancer/views", json={
        "name": "seed6 overlay",
        "ng_state": {"layers": [{"name": "img"}]},
        "sharing_mode": "read",
        "layers": [{"layer_index": 0, "channel": "Ch0"}],
    })
    assert resp.status_code == 200, resp.text
    created = resp.json()
    assert created["name"] == "seed6 overlay"
    assert created["sharing_mode"] == "read"
    assert created["owner"] == "testuser"
    assert created["read_key"] and created["short_key"]
    assert "edit_key" not in created          # never exposed
    assert len(created["layers"]) == 1 and created["layers"][0]["channel"] == "Ch0"
    short_key = created["short_key"]

    # list
    resp = test_client.get("/api/neuroglancer/views")
    assert resp.status_code == 200
    names = [v["name"] for v in resp.json()["views"]]
    assert "seed6 overlay" in names

    # get one
    resp = test_client.get(f"/api/neuroglancer/views/{short_key}")
    assert resp.status_code == 200
    assert resp.json()["short_key"] == short_key

    # update (rename)
    resp = test_client.put(f"/api/neuroglancer/views/{short_key}", json={"name": "renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed"

    # delete
    resp = test_client.delete(f"/api/neuroglancer/views/{short_key}")
    assert resp.status_code == 200
    assert test_client.get(f"/api/neuroglancer/views/{short_key}").status_code == 404


def test_view_get_and_update_missing_returns_404(test_client):
    assert test_client.get("/api/neuroglancer/views/nope").status_code == 404
    assert test_client.put("/api/neuroglancer/views/nope", json={"name": "x"}).status_code == 404
    assert test_client.delete("/api/neuroglancer/views/nope").status_code == 404


def test_view_create_with_unknown_sharing_key_400(test_client):
    resp = test_client.post("/api/neuroglancer/views", json={
        "name": "bad",
        "ng_state": {},
        "layers": [{"layer_index": 0, "sharing_key": "does-not-exist"}],
    })
    assert resp.status_code == 400
