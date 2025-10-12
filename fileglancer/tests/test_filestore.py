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
    assert filestore.get_root_path() == test_dir


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

