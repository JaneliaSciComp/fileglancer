import os
import yaml
import pytest
from fastapi.testclient import TestClient
from fileglancer.settings import Settings
from fileglancer.app import create_app, get_current_user
from fileglancer.database import create_engine, sessionmaker, Base, FileSharePathDB

TEST_USERNAME = "testuser"

@pytest.fixture
def template_settings():
    """Load settings from the docs/config.yaml.template file"""
    template_path = os.path.join(os.path.dirname(__file__), "..", "docs", "config.yaml.template")
    with open(template_path, "r") as f:
        config_data = yaml.safe_load(f)
    
    # We need to provide a valid external_proxy_url if it's required by validation
    # The template has http://localhost:7878/files which should be fine
    
    # Use a memory database for testing
    config_data['db_url'] = "sqlite:///:memory:"
    
    # Ensure use_access_flags is False (this is what we are testing is the default)
    # We don't explicitly set it here because we want to see what's in the template.
    # But if the template HAS it, yaml.safe_load will grab it.
    
    return Settings(**config_data)

@pytest.fixture
def template_app(template_settings):
    """Create a FastAPI app using the template settings"""
    # Initialize the in-memory database
    engine = create_engine(template_settings.db_url)
    Session = sessionmaker(bind=engine)
    db_session = Session()
    Base.metadata.create_all(engine)
    
    # Add a default file share path so we can test viewing files
    # By default Settings uses ["~/"] which is hard to test deterministically
    # So we'll add one to the DB
    fsp = FileSharePathDB(
        name="test_home",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path="/tmp", # Use /tmp as a safe bet for a directory that exists
        mac_path="smb://tmp",
        windows_path="\\\\tmp",
        linux_path="/tmp"
    )
    db_session.add(fsp)
    db_session.commit()
    
    app = create_app(template_settings)
    
    # Override authentication
    def override_get_current_user():
        return TEST_USERNAME
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    yield app
    
    app.dependency_overrides.clear()
    db_session.close()
    engine.dispose()

@pytest.fixture
def client(template_app):
    return TestClient(template_app)

def test_config_template_defaults(template_settings):
    """
    Verify specifically that use_access_flags is False in the loaded settings.
    This test MUST fail if the template is configured with use_access_flags: True.
    """
    assert template_settings.use_access_flags is False, \
        "The configuration template should have use_access_flags set to False by default."

def test_server_launches_with_template(client):
    """Verify that the server launches and responds to basic API calls"""
    response = client.get("/api/version")
    assert response.status_code == 200
    assert "version" in response.json()

def test_view_home_directory_no_error(client):
    """Verify that we can view the file share paths and files without 500 errors"""
    # 1. Get file share paths
    response = client.get("/api/file-share-paths")
    assert response.status_code == 200
    data = response.json()
    assert len(data["paths"]) > 0
    
    # 2. Get files for the first path
    fsp_name = data["paths"][0]["name"]
    response = client.get(f"/api/files/{fsp_name}")
    assert response.status_code == 200
    files_data = response.json()
    assert "files" in files_data
    assert isinstance(files_data["files"], list)

def test_profile_endpoint_no_error(client):
    """Verify that the profile endpoint (which often triggers user context logic) works"""
    response = client.get("/api/profile")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == TEST_USERNAME
