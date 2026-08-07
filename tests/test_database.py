import tempfile
import os
import shutil
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest
import pandas as pd
from conftest import requires_symlinks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fileglancer.database import *
from fileglancer.database import _find_best_fsp_match, _fsp_cache
from fileglancer.model import FileSharePath
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


def test_file_share_paths_are_served_from_cache(db_session):
    """Repeat reads come from the cache, so changes lag by up to the TTL."""
    db_session.add(FileSharePathDB(
        name="s1", zone="z", group="g", storage="local", mount_path="/s1"))
    db_session.commit()
    assert [p.name for p in get_file_share_paths(db_session)] == ["s1"]

    # Row deleted underneath: still served from the cache until it expires.
    db_session.query(FileSharePathDB).delete()
    db_session.commit()
    assert [p.name for p in get_file_share_paths(db_session)] == ["s1"]

    _fsp_cache.clear()
    assert get_file_share_paths(db_session) == []


def test_file_share_path_cache_is_keyed_by_database(db_session, temp_dir):
    """A second database in the same process must not see the first's shares."""
    db_session.add(FileSharePathDB(
        name="first", zone="z", group="g", storage="local", mount_path="/first"))
    db_session.commit()
    assert [p.name for p in get_file_share_paths(db_session)] == ["first"]

    other_engine = create_engine(f"sqlite:///{os.path.join(temp_dir, 'other.db')}")
    Base.metadata.create_all(other_engine)
    other_session = sessionmaker(bind=other_engine)()
    try:
        other_session.add(FileSharePathDB(
            name="second", zone="z", group="g", storage="local", mount_path="/second"))
        other_session.commit()
        assert [p.name for p in get_file_share_paths(other_session)] == ["second"]
        assert [p.name for p in get_file_share_paths(db_session)] == ["first"]
    finally:
        other_session.close()
        other_engine.dispose()


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


def test_get_active_jobs_treats_non_terminal_statuses_as_active(db_session):
    job_ids_by_status = {}
    for status in [
        "PENDING",
        "RUNNING",
        "UNKNOWN",
        "SUSPENDED",
        "DONE",
        "FAILED",
        "KILLED",
    ]:
        job = create_job(
            db_session,
            "testuser",
            "https://github.com/owner/repo",
            "App",
            "run",
            "Run",
            {},
        )
        update_job_status(db_session, job.id, status)
        job_ids_by_status[status] = job.id

    active = get_active_jobs(db_session)

    assert {job.id for job in active} == {
        job_ids_by_status["PENDING"],
        job_ids_by_status["RUNNING"],
        job_ids_by_status["UNKNOWN"],
        job_ids_by_status["SUSPENDED"],
    }


def test_status_updated_at_tracks_status_changes(db_session):
    job = create_job(
        db_session, "testuser", "https://github.com/owner/repo",
        "App", "run", "Run", {},
    )
    # Set on create.
    assert job.status_updated_at is not None
    created_stamp = job.status_updated_at

    # A real status change advances the timestamp.
    update_job_status(db_session, job.id, "RUNNING")
    db_session.refresh(job)
    running_stamp = job.status_updated_at
    assert running_stamp >= created_stamp

    # A no-op update (same status) leaves it untouched, so it marks entry into
    # the current state rather than the most recent poll.
    update_job_status(db_session, job.id, "RUNNING")
    db_session.refresh(job)
    assert job.status_updated_at == running_stamp


def test_create_job_defaults_name_from_app_and_entry_point(db_session):
    job = create_job(
        db_session, "testuser", "https://github.com/owner/repo",
        "My App", "run", "Run Thing", {},
    )
    assert job.name == "My App - Run Thing"


def test_create_job_keeps_explicit_name(db_session):
    job = create_job(
        db_session, "testuser", "https://github.com/owner/repo",
        "My App", "run", "Run Thing", {}, name="Custom Name",
    )
    assert job.name == "Custom Name"


def test_create_job_blank_name_falls_back_to_default(db_session):
    job = create_job(
        db_session, "testuser", "https://github.com/owner/repo",
        "My App", "run", "Run Thing", {}, name="   ",
    )
    assert job.name == "My App - Run Thing"


def test_update_job_sets_name(db_session):
    job = create_job(
        db_session, "testuser", "https://github.com/owner/repo",
        "My App", "run", "Run Thing", {},
    )
    updated = update_job(db_session, job.id, "testuser", "Renamed")
    assert updated is not None
    assert updated.name == "Renamed"
    assert get_job(db_session, job.id, "testuser").name == "Renamed"


def test_update_job_wrong_user_returns_none(db_session):
    job = create_job(
        db_session, "testuser", "https://github.com/owner/repo",
        "My App", "run", "Run Thing", {},
    )
    assert update_job(db_session, job.id, "someone_else", "Renamed") is None


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


def test_create_and_get_view(db_session):
    layers = [
        {"data_link_id": None, "layer_index": 0, "channel": "Ch0", "opts": {"color": "red"}},
        {"data_link_id": None, "layer_index": 1, "channel": None, "opts": None},
    ]
    view = create_view(
        db_session,
        username="testuser",
        name="seed6 overlay",
        ng_state={"layers": []},
        layers=layers,
        sharing_mode="read",
    )
    assert view.short_key is not None
    assert view.read_key is not None
    assert view.edit_key is not None
    assert view.short_key != view.read_key != view.edit_key
    assert view.owner == "testuser"
    assert view.sharing_mode == "read"

    fetched = get_view_by_short_key(db_session, view.short_key)
    assert fetched is not None
    assert fetched.name == "seed6 overlay"
    assert len(fetched.layers) == 2
    assert {l.layer_index for l in fetched.layers} == {0, 1}
    assert fetched.layers[0].channel == "Ch0"
    assert fetched.layers[0].broken is False


def test_get_views_and_read_key(db_session):
    v1 = create_view(db_session, "u", "one", {"layers": []}, [], "read")
    v2 = create_view(db_session, "u", "two", {"layers": []}, [], "private")
    create_view(db_session, "other", "three", {"layers": []}, [], "read")

    mine = get_views(db_session, "u")
    assert [v.name for v in mine] == ["two", "one"]  # newest first

    assert get_view_by_read_key(db_session, v1.read_key).short_key == v1.short_key
    assert get_view_by_read_key(db_session, "nope") is None
    assert v2.sharing_mode == "private"


def test_update_and_delete_view(db_session):
    layers = [{"data_link_id": None, "layer_index": 0, "channel": None, "opts": None}]
    v = create_view(db_session, "u", "before", {"layers": [1]}, layers, "read")
    view_id = v.id
    updated = update_view(db_session, "u", v.short_key, name="after", ng_state={"layers": [2]})
    assert updated.name == "after"
    assert updated.ng_state == {"layers": [2]}
    assert update_view(db_session, "wronguser", v.short_key, name="x") is None

    assert db_session.query(ViewLayerDB).filter_by(view_id=view_id).count() == 1  # layer exists pre-delete
    assert delete_view(db_session, "u", v.short_key) == 1
    assert get_view_by_short_key(db_session, v.short_key) is None
    assert db_session.query(ViewLayerDB).filter_by(view_id=view_id).count() == 0  # cascade removed the join row


def test_get_views_for_data_link(db_session):
    layers = [
        {"data_link_id": 42, "layer_index": 0, "channel": None, "opts": None},
        {"data_link_id": 42, "layer_index": 1, "channel": "Ch1", "opts": None},
    ]
    v = create_view(db_session, "u", "linked", {"layers": []}, layers, "read")
    create_view(db_session, "u", "unlinked", {"layers": []}, [], "read")

    dependents = get_views_for_data_link(db_session, 42)
    assert [d.short_key for d in dependents] == [v.short_key]  # distinct: one entry despite two matching layers
    assert get_views_for_data_link(db_session, 999) == []


def test_create_proxied_path_for_file(db_session, fsp):
    """Regression: create_proxied_path should succeed for a file path (not 500 on os.listdir)."""
    username = "testuser"
    sharing_name = "file_link"
    fsp_name = fsp.name
    # Create a real file inside the fsp mount path
    file_path = os.path.join(fsp.mount_path, "testfile.txt")
    with open(file_path, "w") as f:
        f.write("hello")
    proxied_path = create_proxied_path(db_session, username, sharing_name, fsp_name, "testfile.txt")
    assert proxied_path.username == username
    assert proxied_path.sharing_name == sharing_name
    assert proxied_path.sharing_key is not None
    assert proxied_path.path == "testfile.txt"


def test_validate_proxied_path_rejects_unknown_fsp(db_session, fsp):
    """_validate_proxied_path should raise ValueError for an unknown file share path."""
    from fileglancer.database import _validate_proxied_path
    with pytest.raises(ValueError, match="does not exist"):
        _validate_proxied_path(db_session, "no_such_fsp", "some/path")


def test_validate_proxied_path_does_not_check_filesystem(db_session, fsp):
    """_validate_proxied_path must NOT touch the filesystem.

    Per-user filesystem access is validated by the user worker (running as the
    real user), not here in the server process. So validation must succeed even
    for a path that does not exist from the server's point of view; otherwise
    the server's identity (which may lack the user's group memberships) would
    wrongly reject paths the user can legitimately access.
    """
    from fileglancer.database import _validate_proxied_path
    # Path does not exist on disk, but validation only checks the FSP exists.
    _validate_proxied_path(db_session, fsp.name, "no_such_file_or_dir.txt")


@pytest.mark.skipif(
    hasattr(os, "geteuid") and os.geteuid() == 0,
    reason="root bypasses directory read permissions, so the check cannot be exercised",
)
def test_create_proxied_path_for_unreadable_directory(db_session, fsp):
    """Regression: create a data link for a directory the server process cannot read.

    Reproduces the production bug where creating a link to a group-readable but
    not world-readable directory failed with "is not accessible" because the
    server process ran ``os.listdir`` under its own identity. With the
    filesystem check removed from the DB layer, creation must succeed; access is
    validated by the user worker as the real user.

    Here we use a 0o000 directory to make the running (non-root) process unable
    to ``listdir`` it -- the same failure mode the old code raised on.
    """
    unreadable = os.path.join(fsp.mount_path, "unreadable_dir")
    os.makedirs(unreadable, exist_ok=True)
    os.chmod(unreadable, 0o000)
    try:
        proxied_path = create_proxied_path(
            db_session, "testuser", "unreadable_link", fsp.name, "unreadable_dir"
        )
        assert proxied_path.path == "unreadable_dir"
        assert proxied_path.sharing_key is not None
    finally:
        # Restore permissions so the temp dir can be cleaned up.
        os.chmod(unreadable, 0o755)


@requires_symlinks
def test_create_proxied_path_accepts_symlink(db_session, fsp):
    """create_proxied_path should create a data link for a symlink to a valid target."""
    target_path = os.path.join(fsp.mount_path, "real.txt")
    with open(target_path, "w") as f:
        f.write("data")
    symlink_path = os.path.join(fsp.mount_path, "alias.txt")
    os.symlink(target_path, symlink_path)
    proxied_path = create_proxied_path(db_session, "testuser", "alias_link", fsp.name, "alias.txt")
    assert proxied_path.path == "alias.txt"
    assert proxied_path.sharing_key is not None


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


def test_find_fsp_from_absolute_path_exact_match(db_session, temp_dir):
    """Test finding FSP from absolute path with exact match"""
    # Create a file share path
    fsp = FileSharePathDB(
        name="test_mount",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path=temp_dir,
        mac_path=temp_dir,
        windows_path=temp_dir,
        linux_path=temp_dir
    )
    db_session.add(fsp)
    db_session.commit()

    # Test exact match at mount root
    result = find_fsp_from_absolute_path(db_session, temp_dir)
    assert result is not None
    assert result[0].name == "test_mount"
    assert result[1] == ""

    # Test with subdirectory
    subdir = os.path.join(temp_dir, "subdir")
    os.makedirs(subdir, exist_ok=True)
    result = find_fsp_from_absolute_path(db_session, subdir)
    assert result is not None
    assert result[0].name == "test_mount"
    assert result[1] == "subdir"

    # Test with nested subdirectory
    nested_dir = os.path.join(temp_dir, "subdir", "nested")
    os.makedirs(nested_dir, exist_ok=True)
    result = find_fsp_from_absolute_path(db_session, nested_dir)
    assert result is not None
    assert result[0].name == "test_mount"
    assert result[1] == "subdir/nested"


def test_find_fsp_from_absolute_path_no_match(db_session, temp_dir):
    """Test finding FSP from absolute path with no match"""
    # Create a file share path
    fsp = FileSharePathDB(
        name="test_mount",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path=temp_dir,
        mac_path=temp_dir,
        windows_path=temp_dir,
        linux_path=temp_dir
    )
    db_session.add(fsp)
    db_session.commit()

    # Test with path that doesn't match any FSP
    non_matching_path = "/completely/different/path"
    result = find_fsp_from_absolute_path(db_session, non_matching_path)
    assert result is None


def test_find_fsp_from_absolute_path_with_home_dir(db_session):
    """Test finding FSP from absolute path with ~/ mount path"""
    # Create a file share path using ~/ which should expand to current user's home
    home_fsp = FileSharePathDB(
        name="home",
        zone="testzone",
        group="testgroup",
        storage="home",
        mount_path="~/",
        mac_path="~/",
        windows_path="~/",
        linux_path="~/"
    )
    db_session.add(home_fsp)
    db_session.commit()

    # Test with expanded home directory
    home_dir = os.path.expanduser("~/")
    result = find_fsp_from_absolute_path(db_session, home_dir)
    assert result is not None
    assert result[0].name == "home"
    assert result[1] == ""

    # Test with subdirectory in home
    test_subpath = "test_subdir"
    test_path = os.path.join(home_dir, test_subpath)
    result = find_fsp_from_absolute_path(db_session, test_path)
    assert result is not None
    assert result[0].name == "home"
    assert result[1] == test_subpath


def test_find_fsp_from_absolute_path_normalization(db_session, temp_dir):
    """Test that path normalization works correctly"""
    # Create a file share path
    fsp = FileSharePathDB(
        name="test_mount",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path=temp_dir,
        mac_path=temp_dir,
        windows_path=temp_dir,
        linux_path=temp_dir
    )
    db_session.add(fsp)
    db_session.commit()

    # Test with trailing slashes
    path_with_trailing_slash = temp_dir + "/"
    result = find_fsp_from_absolute_path(db_session, path_with_trailing_slash)
    assert result is not None
    assert result[0].name == "test_mount"
    assert result[1] == ""

    # Test with double slashes
    subdir = os.path.join(temp_dir, "subdir")
    os.makedirs(subdir, exist_ok=True)
    path_with_double_slash = temp_dir + "//subdir"
    result = find_fsp_from_absolute_path(db_session, path_with_double_slash)
    assert result is not None
    assert result[0].name == "test_mount"
    assert result[1] == "subdir"


def test_find_fsp_from_absolute_path_boundary_check(db_session, temp_dir):
    """Test that function correctly checks directory boundaries"""
    # Create a file share path
    fsp = FileSharePathDB(
        name="test_mount",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path=temp_dir,
        mac_path=temp_dir,
        windows_path=temp_dir,
        linux_path=temp_dir
    )
    db_session.add(fsp)
    db_session.commit()

    # Test with a path that starts with the mount path but isn't a subdirectory
    # For example, if temp_dir is "/tmp/test", then "/tmp/test2" should NOT match
    parent_dir = os.path.dirname(temp_dir)
    similar_path = temp_dir + "2"  # e.g., /tmp/test2

    # Only test if the similar path actually exists or if we can determine it won't match
    result = find_fsp_from_absolute_path(db_session, similar_path)
    # This should not match because similar_path is not a subdirectory of temp_dir
    assert result is None or result[0].mount_path != temp_dir


@requires_symlinks
def test_find_fsp_from_absolute_path_with_symlink_resolution(db_session, temp_dir):
    """Test that find_fsp_from_absolute_path resolves symlinks correctly. 
    This addresses macOS symlink behavior. E.g., /var -> /private/var."""
    # Create a file share path in temp_dir
    fsp = FileSharePathDB(
        name="test_mount",
        zone="testzone",
        group="testgroup",
        storage="local",
        mount_path=temp_dir,
        mac_path=temp_dir,
        windows_path=temp_dir,
        linux_path=temp_dir
    )
    db_session.add(fsp)
    db_session.commit()

    # Create a subdirectory that we'll link to
    target_dir = os.path.join(temp_dir, "target")
    os.makedirs(target_dir, exist_ok=True)

    # Create another temporary directory to hold the symlink
    symlink_container = tempfile.mkdtemp()
    try:
        # Create a symlink pointing to the target directory
        symlink_path = os.path.join(symlink_container, "link_to_target")
        os.symlink(target_dir, symlink_path)

        # When we resolve the symlink path, it should find the FSP
        # This tests that the function uses realpath() to resolve symlinks
        result = find_fsp_from_absolute_path(db_session, symlink_path)
        assert result is not None, "Should find FSP through symlink resolution"
        assert result[0].name == "test_mount"
        assert result[1] == "target"
    finally:
        shutil.rmtree(symlink_container)


# --- _find_best_fsp_match tests ---

class TestFindBestFspMatch:
    """Unit tests for the shared _find_best_fsp_match helper."""

    @pytest.fixture()
    def fsps(self):
        return [
            FileSharePath(
                zone="z", name="short",
                mount_path="/mnt/short",
                linux_path="/linux/short",
                mac_path="smb://server/short",
            ),
            FileSharePath(
                zone="z", name="long",
                mount_path="/mnt/long",
                linux_path="/linux/short/nested",
                mac_path="smb://server/short/nested",
            ),
        ]

    def test_longest_match_wins(self, fsps):
        result = _find_best_fsp_match(
            fsps, "smb://server/short/nested/file.txt",
            lambda fsp: [fsp.mac_path],
        )
        assert result is not None
        assert result[0].name == "long"
        assert result[1] == "file.txt"

    def test_boundary_safety(self, fsps):
        """A prefix that doesn't end on a separator boundary must not match."""
        result = _find_best_fsp_match(
            fsps, "/linux/shortcut/file.txt",
            lambda fsp: [fsp.linux_path],
        )
        assert result is None

    def test_exact_match_returns_empty_subpath(self, fsps):
        result = _find_best_fsp_match(
            fsps, "/linux/short",
            lambda fsp: [fsp.linux_path],
        )
        assert result is not None
        assert result[0].name == "short"
        assert result[1] == ""

    def test_none_candidates_are_skipped(self):
        fsp = FileSharePath(zone="z", name="test", mount_path="/mnt/test")
        result = _find_best_fsp_match(
            [fsp], "/mnt/test/file",
            lambda f: [None, f.mount_path, None],
        )
        assert result is not None
        assert result[1] == "file"

    def test_custom_separator(self):
        """os.sep separator is respected for boundary checks."""
        fsp = FileSharePath(zone="z", name="test", mount_path="/mnt/test")
        # With "/" separator, this should match
        result_slash = _find_best_fsp_match(
            [fsp], "/mnt/test/sub",
            lambda f: [f.mount_path],
            separator="/",
        )
        assert result_slash is not None
        assert result_slash[1] == "sub"

    def test_no_fsps_returns_none(self):
        result = _find_best_fsp_match([], "/any/path", lambda f: [f.mount_path])
        assert result is None

    def test_no_matching_candidate_returns_none(self):
        fsp = FileSharePath(zone="z", name="test", mount_path="/mnt/test")
        result = _find_best_fsp_match(
            [fsp], "/completely/different",
            lambda f: [f.mount_path],
        )
        assert result is None

