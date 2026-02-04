import os
import stat
import pytest
import tempfile
import shutil
from fileglancer.filestore import Filestore, FileInfo
from fileglancer.model import FileSharePath

@pytest.fixture
def test_dir():
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()

    # Create chroot directory for test files
    chroot = os.path.join(temp_dir, "chroot")
    os.makedirs(chroot)

    # Create test files inside chroot
    os.makedirs(os.path.join(chroot, "subdir"))
    with open(os.path.join(chroot, "test.txt"), "w") as f:
        f.write("test content")
    with open(os.path.join(chroot, "subdir", "test2.txt"), "w") as f:
        f.write("test content 2")

    # Create file outside chroot that we'll try to access
    with open(os.path.join(temp_dir, "outside.txt"), "w") as f:
        f.write("outside content")

    yield chroot

    # Cleanup after tests
    shutil.rmtree(temp_dir)


@pytest.fixture
def filestore(test_dir):
    file_share_path = FileSharePath(zone="test", name="test", mount_path=test_dir)
    return Filestore(file_share_path)


def test_unmounted_filestore():
    test_dir = "/not/a/real/path"
    file_share_path = FileSharePath(zone="test", name="test", mount_path=test_dir)
    filestore = Filestore(file_share_path)
    with pytest.raises(FileNotFoundError):
        filestore.get_file_info(None)


def test_get_root_path(filestore, test_dir):
    # Root path should be the canonicalized/resolved version of test_dir
    assert filestore.get_root_path() == os.path.realpath(test_dir)


def test_get_root_info(filestore, test_dir):
    file_info = filestore.get_file_info(None)
    assert file_info is not None
    assert file_info.name == ''
    assert file_info.path == '.'
    assert file_info.size == 0
    assert file_info.is_dir


def test_yield_file_and_dir_infos(filestore):
    fs_iterator = filestore.yield_file_infos(None)

    # Test directory info
    dir_info = next(fs_iterator)
    assert dir_info.name == "subdir"
    assert dir_info.is_dir

    # Test file info
    file_info = next(fs_iterator)
    assert isinstance(file_info, FileInfo)
    assert file_info.name == "test.txt"
    assert file_info.path == "test.txt"
    assert file_info.size == len("test content")
    assert not file_info.is_dir


def test_yield_file_infos(filestore):
    files = list(filestore.yield_file_infos(""))
    assert len(files) == 2

    # Test subdir listing
    subdir_files = list(filestore.yield_file_infos("subdir"))
    assert len(subdir_files) == 1
    assert subdir_files[0].name == "test2.txt"

    # Test nonexistent directory
    with pytest.raises((FileNotFoundError, PermissionError)):
        list(filestore.yield_file_infos("nonexistent"))


def test_stream_file_contents(filestore):
    content = b"".join(filestore.stream_file_contents("test.txt"))
    assert content == b"test content"

    # Test subdir file
    content = b"".join(filestore.stream_file_contents("subdir/test2.txt"))
    assert content == b"test content 2"


def test_rename_file(filestore, test_dir):
    filestore.rename_file_or_dir("test.txt", "renamed.txt")
    assert not os.path.exists(os.path.join(test_dir, "test.txt"))
    assert os.path.exists(os.path.join(test_dir, "renamed.txt"))


def test_rename_file_or_dir_invalid_path(filestore):
    with pytest.raises(FileNotFoundError):
        filestore.rename_file_or_dir("nonexistent.txt", "new.txt")


def test_rename_file_or_dir_invalid_new_path(filestore):
    with pytest.raises(NotADirectoryError):
        filestore.rename_file_or_dir("test.txt", "test.txt/subdir")


def test_remove_file_or_dir(filestore, test_dir):
    # Test file deletion
    filestore.remove_file_or_dir("test.txt")
    assert not os.path.exists(os.path.join(test_dir, "test.txt"))

    # Create empty dir and test directory deletion
    os.makedirs(os.path.join(test_dir, "empty_dir"))
    filestore.remove_file_or_dir("empty_dir")
    assert not os.path.exists(os.path.join(test_dir, "empty_dir"))


def test_prevent_chroot_escape(filestore):
    # Try to access file outside root using ..
    with pytest.raises(ValueError):
        filestore.get_file_info("../outside.txt")

    with pytest.raises(ValueError):
        next(filestore.yield_file_infos("../"))

    with pytest.raises(ValueError):
        next(filestore.stream_file_contents("../outside.txt"))

    with pytest.raises(ValueError):
        filestore.rename_file_or_dir("../outside.txt", "inside.txt")

    with pytest.raises(ValueError):
        filestore.rename_file_or_dir("test.txt", "../outside.txt")

    with pytest.raises(ValueError):
        filestore.remove_file_or_dir("../outside.txt")


def test_create_dir(filestore, test_dir):
    filestore.create_dir("newdir")
    assert os.path.exists(os.path.join(test_dir, "newdir"))


def test_create_empty_file(filestore, test_dir):
    filestore.create_empty_file("newfile.txt")
    assert os.path.exists(os.path.join(test_dir, "newfile.txt"))


def test_change_file_permissions(filestore, test_dir):
    filestore.change_file_permissions("test.txt", "-rw-r--r--")
    fullpath = os.path.join(test_dir, "test.txt")
    assert stat.S_IMODE(os.stat(fullpath).st_mode) == 0o644


def test_change_file_permissions_invalid_permissions(filestore):
    with pytest.raises(ValueError):
        filestore.change_file_permissions("test.txt", "invalid")


def test_change_file_permissions_invalid_path(filestore):
    with pytest.raises(ValueError):
        filestore.change_file_permissions("nonexistent.txt", "rw-r--r--")


# Symlink tests

def test_symlink_detection(test_dir):
    """Test that FileInfo correctly detects symlinks and their properties"""
    # Create a file and a symlink to it
    target_file = os.path.join(test_dir, "target.txt")
    with open(target_file, "w") as f:
        f.write("symlink target content")

    symlink_path = os.path.join(test_dir, "link_to_target")
    os.symlink(target_file, symlink_path)

    # Get FileInfo using stat (follow symlink for stat_result)
    # Note: pass the symlink path as absolute_path so lstat can detect it
    stat_result = os.stat(symlink_path)
    file_info = FileInfo.from_stat("link_to_target", symlink_path, stat_result)

    assert file_info.is_symlink is True
    assert file_info.name == "link_to_target"


def test_same_share_symlink_resolution_via_listing(filestore, test_dir):
    """Test symlink resolution when target is within the same file share via directory listing"""
    # Create target file
    target_file = os.path.join(test_dir, "subdir", "target_same_share.txt")
    with open(target_file, "w") as f:
        f.write("same share target content")

    # Create symlink to target at root of test_dir
    symlink_path = os.path.join(test_dir, "link_to_subdir_file")
    os.symlink(target_file, symlink_path)

    # Get file info via directory listing with session (mock database session)
    from unittest.mock import Mock
    from fileglancer import database

    mock_session = Mock()
    original_find = database.find_fsp_from_absolute_path

    def mock_find(session, path):
        # Normalize paths for comparison
        if os.path.realpath(path) == os.path.realpath(target_file):
            fsp = FileSharePath(zone="test", name="test", mount_path=test_dir)
            return (fsp, "subdir/target_same_share.txt")
        return None

    database.find_fsp_from_absolute_path = mock_find

    try:
        # Use yield_file_infos to list directory - symlinks are detected this way
        files = list(filestore.yield_file_infos("", session=mock_session))
        symlink_info = next((f for f in files if f.name == "link_to_subdir_file"), None)

        assert symlink_info is not None
        assert symlink_info.is_symlink is True
        assert symlink_info.symlink_target_fsp is not None
        assert symlink_info.symlink_target_fsp["fsp_name"] == "test"
        assert symlink_info.symlink_target_fsp["subpath"] == "subdir/target_same_share.txt"
    finally:
        database.find_fsp_from_absolute_path = original_find


def test_cross_share_symlink_resolution_via_listing(test_dir):
    """Test symlink resolution when target is in a different file share via directory listing"""
    # Create two file shares
    share1_dir = os.path.join(test_dir, "share1")
    share2_dir = os.path.join(test_dir, "share2")
    os.makedirs(share1_dir)
    os.makedirs(share2_dir)

    # Create target in share2
    target_file = os.path.join(share2_dir, "target.txt")
    with open(target_file, "w") as f:
        f.write("cross-share target")

    # Create symlink in share1 pointing to share2
    symlink_path = os.path.join(share1_dir, "link_to_share2")
    os.symlink(target_file, symlink_path)

    # Create filestore for share1
    fsp1 = FileSharePath(zone="test", name="share1", mount_path=share1_dir)
    filestore1 = Filestore(fsp1)

    # Mock database session and find function
    from unittest.mock import Mock
    from fileglancer import database

    mock_session = Mock()
    original_find = database.find_fsp_from_absolute_path

    def mock_find(session, path):
        # Normalize paths for comparison
        if os.path.realpath(path) == os.path.realpath(target_file):
            fsp2 = FileSharePath(zone="test", name="share2", mount_path=share2_dir)
            return (fsp2, "target.txt")
        return None

    database.find_fsp_from_absolute_path = mock_find

    try:
        # Use yield_file_infos to list directory - symlinks are detected this way
        files = list(filestore1.yield_file_infos("", session=mock_session))
        symlink_info = next((f for f in files if f.name == "link_to_share2"), None)

        assert symlink_info is not None
        assert symlink_info.is_symlink is True
        assert symlink_info.symlink_target_fsp is not None
        assert symlink_info.symlink_target_fsp["fsp_name"] == "share2"
        assert symlink_info.symlink_target_fsp["subpath"] == "target.txt"
    finally:
        database.find_fsp_from_absolute_path = original_find


def test_relative_symlink_resolution(test_dir):
    """Test that relative symlinks are resolved correctly"""
    # Create a fresh directory structure for this test
    nested_dir = os.path.join(test_dir, "rel_test", "nested")
    os.makedirs(nested_dir, exist_ok=True)
    target_file = os.path.join(test_dir, "rel_test", "target.txt")
    with open(target_file, "w") as f:
        f.write("relative target")

    # Create relative symlink from nested directory pointing up
    symlink_path = os.path.join(nested_dir, "link")
    os.symlink("../target.txt", symlink_path)

    # Create filestore for nested_dir so symlink is listed via yield_file_infos
    fsp = FileSharePath(zone="test", name="nested", mount_path=nested_dir)
    nested_filestore = Filestore(fsp)

    from unittest.mock import Mock
    from fileglancer import database

    mock_session = Mock()
    original_find = database.find_fsp_from_absolute_path

    def mock_find(session, path):
        if os.path.realpath(path) == os.path.realpath(target_file):
            # Return fsp for rel_test directory
            fsp_rel = FileSharePath(zone="test", name="rel_test", mount_path=os.path.join(test_dir, "rel_test"))
            return (fsp_rel, "target.txt")
        return None

    database.find_fsp_from_absolute_path = mock_find

    try:
        # List directory to find the symlink
        files = list(nested_filestore.yield_file_infos("", session=mock_session))
        symlink_info = next((f for f in files if f.name == "link"), None)

        assert symlink_info is not None
        assert symlink_info.is_symlink is True
        assert symlink_info.symlink_target_fsp is not None
        assert symlink_info.symlink_target_fsp["subpath"] == "target.txt"
    finally:
        database.find_fsp_from_absolute_path = original_find


def test_yield_file_infos_with_symlinks(filestore, test_dir):
    """Test that yield_file_infos correctly lists symlinks"""
    # Create file and symlink
    with open(os.path.join(test_dir, "file1.txt"), "w") as f:
        f.write("file 1")

    os.symlink(
        os.path.join(test_dir, "file1.txt"),
        os.path.join(test_dir, "link1")
    )

    from unittest.mock import Mock
    from fileglancer import database

    mock_session = Mock()
    original_find = database.find_fsp_from_absolute_path
    database.find_fsp_from_absolute_path = lambda s, p: (
        FileSharePath(zone="test", name="test", mount_path=test_dir),
        "file1.txt"
    )

    try:
        files = list(filestore.yield_file_infos("", session=mock_session))

        # Find the symlink in the list
        symlink_info = next((f for f in files if f.name == "link1"), None)
        assert symlink_info is not None
        assert symlink_info.is_symlink is True
    finally:
        database.find_fsp_from_absolute_path = original_find


def test_broken_symlink_not_listed(filestore, test_dir):
    """Test that broken symlinks are not listed (caught by OSError)"""
    # Create a broken symlink
    broken_link = os.path.join(test_dir, "broken_link")
    os.symlink("/nonexistent/path", broken_link)

    # Create a valid file for comparison
    with open(os.path.join(test_dir, "valid_file.txt"), "w") as f:
        f.write("valid")

    # List directory - broken symlink should not appear
    files = list(filestore.yield_file_infos(""))
    file_names = [f.name for f in files]

    assert "valid_file.txt" in file_names
    assert "broken_link" not in file_names  # Broken symlink should be skipped


def test_symlink_to_directory(filestore, test_dir):
    """Test symlink pointing to a directory is detected via listing"""
    # Create a directory
    target_dir = os.path.join(test_dir, "target_dir")
    os.makedirs(target_dir)

    # Create symlink to directory
    symlink_path = os.path.join(test_dir, "link_to_dir")
    os.symlink(target_dir, symlink_path)

    from unittest.mock import Mock
    from fileglancer import database

    mock_session = Mock()
    original_find = database.find_fsp_from_absolute_path
    database.find_fsp_from_absolute_path = lambda s, p: (
        FileSharePath(zone="test", name="test", mount_path=test_dir),
        "target_dir"
    )

    try:
        # Use yield_file_infos to list directory - symlinks to dirs are detected this way
        files = list(filestore.yield_file_infos("", session=mock_session))
        symlink_info = next((f for f in files if f.name == "link_to_dir"), None)

        assert symlink_info is not None
        assert symlink_info.is_symlink is True
        assert symlink_info.is_dir is True  # Should also be marked as directory
        assert symlink_info.symlink_target_fsp is not None
    finally:
        database.find_fsp_from_absolute_path = original_find
