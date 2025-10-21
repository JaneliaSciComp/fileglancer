import tempfile
import os
import shutil
from datetime import datetime

import pytest
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fileglancer.database import *
from fileglancer.utils import slugify_path

def create_file_share_path_dicts(df):
    """Helper function to create file share path dictionaries from DataFrame"""
    return [{
        'name': slugify_path(row.linux_path),
        'zone': row.lab,
        'group': row.group,
        'storage': row.storage,
        'mount_path': row.linux_path,
        'mac_path': row.mac_path,
        'windows_path': row.windows_path,
        'linux_path': row.linux_path,
    } for row in df.itertuples(index=False)]

@pytest.fixture
def temp_dir():
    temp_dir = tempfile.mkdtemp()
    print(f"Created temp directory: {temp_dir}")
    yield temp_dir
    # Clean up the temp directory
    print(f"Cleaning up temp directory: {temp_dir}")
    shutil.rmtree(temp_dir)


@pytest.fixture
def db_session(temp_dir):
    """Create a test database session"""

    # Mock get_settings to return empty file_share_mounts for database tests
    from fileglancer.settings import get_settings, Settings
    import fileglancer.database

    original_get_settings = get_settings

    test_settings = Settings(file_share_mounts=[])
    fileglancer.database.get_settings = lambda: test_settings

    # Create temp directory for test database
    db_path = os.path.join(temp_dir, "test.db")

    engine = create_engine(f"sqlite:///{db_path}")
    Session = sessionmaker(bind=engine)
    session = Session()
    Base.metadata.create_all(engine)
    yield session

    # Clean up after each test
    try:
        session.query(FileSharePathDB).delete()
        session.query(LastRefreshDB).delete()
        session.query(UserPreferenceDB).delete()
        session.commit()
    finally:
        session.close()
        engine.dispose()

    # Restore original get_settings
    fileglancer.database.get_settings = original_get_settings


@pytest.fixture
def fsp(db_session, temp_dir):
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
    yield fsp
    db_session.query(FileSharePathDB).delete()
    db_session.commit()
    db_session.close()


def test_user_preferences(db_session):
    # Test setting preferences
    test_value = {"setting": "test"}
    set_user_preference(db_session, "testuser", "test_key", test_value)
    
    # Test getting preference
    pref = get_user_preference(db_session, "testuser", "test_key")
    assert pref == test_value
    
    # Test getting non-existent preference
    pref = get_user_preference(db_session, "testuser", "nonexistent")
    assert pref is None
    
    # Test updating preference
    new_value = {"setting": "updated"}
    set_user_preference(db_session, "testuser", "test_key", new_value)
    pref = get_user_preference(db_session, "testuser", "test_key")
    assert pref == new_value
    
    # Test getting all preferences
    all_prefs = get_all_user_preferences(db_session, "testuser")
    assert len(all_prefs) == 1
    assert all_prefs["test_key"] == new_value

    # Test deleting preference
    delete_user_preference(db_session, "testuser", "test_key")
    pref = get_user_preference(db_session, "testuser", "test_key")
    assert pref is None


def test_create_proxied_path(db_session, fsp):
    # Test creating a new proxied path
    username = "testuser"
    sharing_name = "path"
    fsp_name = fsp.name
    path = "test/path"
    # Create temp directory in fsp_mouth_path
    test_path = os.path.join(fsp.mount_path, path)
    os.makedirs(test_path, exist_ok=True)
    proxied_path = create_proxied_path(db_session, username, sharing_name, fsp_name, path)
    
    assert proxied_path.username == username
    assert proxied_path.sharing_name == sharing_name
    assert proxied_path.sharing_key is not None


def test_get_proxied_path_by_sharing_key(db_session, fsp):
    # Test retrieving a proxied path by sharing key
    username = "testuser"
    sharing_name = "path"
    fsp_name = fsp.name
    path = "test/path"
    # Create temp directory in fsp_mouth_path
    test_path = os.path.join(fsp.mount_path, path)
    os.makedirs(test_path, exist_ok=True)
    created_path = create_proxied_path(db_session, username, sharing_name, fsp_name, path)
    
    retrieved_path = get_proxied_path_by_sharing_key(db_session, created_path.sharing_key)
    assert retrieved_path is not None
    assert retrieved_path.sharing_key == created_path.sharing_key


def test_update_proxied_path(db_session, fsp):
    # Test updating a proxied path
    username = "testuser"
    sharing_name = "path"
    fsp_name = fsp.name
    path = "test/path"
    # Create temp directory in fsp_mouth_path
    test_path = os.path.join(fsp.mount_path, path)
    os.makedirs(test_path, exist_ok=True)
    created_path = create_proxied_path(db_session, username, sharing_name, fsp_name, path)
    
    new_sharing_name = "/new/test/path"
    updated_path = update_proxied_path(db_session, username, created_path.sharing_key, new_sharing_name=new_sharing_name)
    assert updated_path.sharing_name == new_sharing_name


def test_delete_proxied_path(db_session, fsp):
    # Test deleting a proxied path
    username = "testuser"
    sharing_name = "path"
    fsp_name = fsp.name
    path = "test/path"
    # Create temp directory in fsp_mouth_path
    test_path = os.path.join(fsp.mount_path, path)
    os.makedirs(test_path, exist_ok=True)
    created_path = create_proxied_path(db_session, username, sharing_name, fsp_name, path)
    
    delete_proxied_path(db_session, username, created_path.sharing_key)
    deleted_path = get_proxied_path_by_sharing_key(db_session, created_path.sharing_key)
    assert deleted_path is None


def test_create_proxied_path_with_home_dir(db_session, temp_dir):
    """Test creating a proxied path with ~/ home directory mount path"""
    # Create a file share path using ~/ which should expand to current user's home
    home_fsp = FileSharePathDB(
        name="home",
        zone="testzone",
        group="testgroup",
        storage="home",
        mount_path="~/",  # Use tilde path
        mac_path="~/",
        windows_path="~/",
        linux_path="~/"
    )
    db_session.add(home_fsp)
    db_session.commit()

    # Create a test directory in the actual home directory
    import os
    home_dir = os.path.expanduser("~/")
    test_subpath = "test_fileglancer_proxied_path"
    test_path = os.path.join(home_dir, test_subpath)

    # Clean up if it exists from a previous run
    if os.path.exists(test_path):
        os.rmdir(test_path)

    try:
        os.makedirs(test_path, exist_ok=True)

        # Test creating a proxied path with the ~/ mount point
        username = "testuser"
        sharing_name = "test_home_path"
        proxied_path = create_proxied_path(db_session, username, sharing_name, home_fsp.name, test_subpath)

        assert proxied_path.username == username
        assert proxied_path.sharing_name == sharing_name
        assert proxied_path.sharing_key is not None
        assert proxied_path.fsp_name == "home"
        assert proxied_path.path == test_subpath

    finally:
        # Clean up test directory
        if os.path.exists(test_path):
            os.rmdir(test_path)

