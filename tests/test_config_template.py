import os
import tempfile
import shutil
import yaml
import pytest
from fastapi.testclient import TestClient
from fileglancer.settings import Settings
from fileglancer.app import create_app, get_current_user
from fileglancer.database import create_engine, sessionmaker, Base, FileSharePathDB, dispose_engine

TEST_USERNAME = "testuser"

@pytest.fixture
def temp_dir():
    """Create a temporary directory for test database and files"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)

@pytest.fixture
def template_settings(temp_dir):
    """Load settings from the docs/config.yaml.template file"""
    template_path = os.path.join(os.path.dirname(__file__), "..", "docs", "config.yaml.template")
    with open(template_path, "r") as f:
        config_data = yaml.safe_load(f)

    # We need to provide a valid external_proxy_url if it's required by validation
    # The template has http://localhost:7878/files which should be fine

    # Use a file-based database for testing. In-memory SQLite (sqlite:///:memory:)
    # creates a separate database per create_engine() call, so data added by the
    # test fixture would not be visible to the app which uses _get_engine().
    db_path = os.path.join(temp_dir, "test.db")
    config_data['db_url'] = f"sqlite:///{db_path}"

    # Don't use file_share_mounts from template - we'll add test data to DB instead
    config_data['file_share_mounts'] = []

    # Ensure use_access_flags is False (this is what we are testing is the default)
    # We don't explicitly set it here because we want to see what's in the template.
    # But if the template HAS it, yaml.safe_load will grab it.

    return Settings(**config_data)

@pytest.fixture
def template_app(template_settings, temp_dir):
    """Create a FastAPI app using the template settings"""
    # Initialize the database
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
        mount_path=temp_dir,
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
    dispose_engine(template_settings.db_url)

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
