import os
import tempfile
import shutil
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from fileglancer.settings import Settings
from fileglancer.app import create_app
from fileglancer.database import *

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

    settings = Settings(db_url=db_url)
    app = create_app(settings)

    yield app

    # Cleanup: close all database connections
    db_session.close()
    engine.dispose()
    # Dispose the cached engine from the database module
    from fileglancer.database import dispose_engine
    dispose_engine(db_url)


@pytest.fixture
def test_client(test_app):
    """Create test client"""
    return TestClient(test_app)


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


def test_root_endpoint(test_client):
    """Test root endpoint - should redirect to /fg/"""
    response = test_client.get("/", follow_redirects=False)
    assert response.status_code == 307  # Temporary redirect
    assert response.headers.get('location') == '/fg/'

def test_fg_endpoint(test_client):
    """Test /fg/ endpoint - should serve SPA index.html"""
    response = test_client.get("/fg/", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')

def test_fg_spa_routing(test_client):
    """Test /fg/browse and other SPA routes - should serve SPA index.html"""
    response = test_client.get("/fg/browse", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')

    response = test_client.get("/fg/browse/some/path", follow_redirects=False)
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


def test_delete_preference(test_client):
    """Test deleting user preference"""
    pref_data = {"test": "value"}
    response = test_client.put("/api/preference/test_key", json=pref_data)

    response = test_client.delete("/api/preference/test_key")
    assert response.status_code == 200

    response = test_client.delete("/api/preference/unknown_key")
    assert response.status_code == 404


def test_create_proxied_path(test_client, temp_dir):
    """Test creating a new proxied path"""
    path = "test_proxied_path"

    response = test_client.post(f"/api/proxied-path?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == os.getenv("USER", "unknown")
    assert data["path"] == path
    assert "sharing_key" in data
    assert "sharing_name" in data


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
    assert response.status_code == 204


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
    assert response.status_code == 204
    assert not os.path.exists(test_file)
    assert os.path.exists(os.path.join(temp_dir, "moved.txt"))


def test_delete_file(test_client, temp_dir):
    """Test deleting a file"""
    # Create a test file
    test_file = os.path.join(temp_dir, "delete_me.txt")
    with open(test_file, "w") as f:
        f.write("test")

    response = test_client.delete("/api/files/tempdir?subpath=delete_me.txt")
    assert response.status_code == 204
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
    data = response.json()
    assert "error" in data
    assert "directory" in data["error"].lower()


def test_get_file_content_not_found(test_client):
    """Test GET request for non-existent file returns 404"""
    response = test_client.get("/api/content/tempdir?subpath=nonexistent.txt")
    assert response.status_code == 404

