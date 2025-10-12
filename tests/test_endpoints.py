import os
import tempfile
import shutil

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
    return app


@pytest.fixture
def test_client(test_app):
    """Create test client"""
    return TestClient(test_app)


def test_root_endpoint(test_client):
    """Test root endpoint - should serve SPA index.html"""
    response = test_client.get("/", follow_redirects=False)
    assert response.status_code == 200
    assert 'text/html' in response.headers.get('content-type', '')


def test_get_preferences(test_client):
    """Test getting user preferences"""
    response = test_client.get("/api/preference/testuser")
    assert response.status_code == 200
    value = response.json()
    assert isinstance(value, dict)
    assert value == {}


def test_get_specific_preference(test_client):
    """Test getting specific user preference"""
    response = test_client.get("/api/preference/testuser/unknown_key")
    assert response.status_code == 404


def test_set_preference(test_client):
    """Test setting user preference"""
    pref_data = {"test": "value"}
    response = test_client.put("/api/preference/testuser/test_key", json=pref_data)
    assert response.status_code == 200

    response = test_client.get("/api/preference/testuser/test_key")
    assert response.status_code == 200
    assert response.json() == pref_data


def test_delete_preference(test_client):
    """Test deleting user preference"""
    pref_data = {"test": "value"}
    response = test_client.put("/api/preference/testuser/test_key", json=pref_data)

    response = test_client.delete("/api/preference/testuser/test_key")
    assert response.status_code == 200

    response = test_client.delete("/api/preference/testuser/unknown_key")
    assert response.status_code == 404


def test_create_proxied_path(test_client, temp_dir):
    """Test creating a new proxied path"""
    path = "test_proxied_path"

    response = test_client.post(f"/api/proxied-path/testuser?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["path"] == path
    assert "sharing_key" in data
    assert "sharing_name" in data


def test_get_proxied_paths(test_client):
    """Test retrieving proxied paths for a user"""
    path = "test_proxied_path"
    response = test_client.post(f"/api/proxied-path/testuser?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    response = test_client.get(f"/api/proxied-path/testuser")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "paths" in data
    assert isinstance(data["paths"], list)


def test_update_proxied_path(test_client):
    """Test updating a proxied path"""
    # First, create a proxied path to update
    path = "test_proxied_path"
    response = test_client.post(f"/api/proxied-path/testuser?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    sharing_key = data["sharing_key"]

    # Update the proxied path
    new_path = "new_test_proxied_path"

    response = test_client.put(f"/api/proxied-path/testuser/{sharing_key}?fsp_name=tempdir&path={new_path}")
    assert response.status_code == 200
    updated_data = response.json()
    assert updated_data["path"] == new_path


def test_delete_proxied_path(test_client):
    """Test deleting a proxied path"""
    # First, create a proxied path to delete
    path = "test_proxied_path"
    response = test_client.post(f"/api/proxied-path/testuser?fsp_name=tempdir&path={path}")
    assert response.status_code == 200
    data = response.json()
    sharing_key = data["sharing_key"]

    # Delete the proxied path
    response = test_client.delete(f"/api/proxied-path/testuser/{sharing_key}")
    assert response.status_code == 200

    # Verify deletion
    response = test_client.get(f"/api/proxied-path/testuser/{sharing_key}")
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

