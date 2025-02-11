import os
import pytest
import tempfile
import shutil
from fileglancer_server.filestore import Filestore, FileInfo


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
    return Filestore(test_dir)


def test_get_root_path(filestore, test_dir):
    assert filestore.get_root_path() == test_dir


def test_get_file_info(filestore, test_dir):
    # Test file info
    file_info = filestore.get_file_info("test.txt")
    assert isinstance(file_info, FileInfo)
    assert file_info.name == "test.txt"
    assert file_info.path == os.path.join(test_dir, "test.txt")
    assert file_info.size == len("test content")
    assert not file_info.is_dir
    
    # Test directory info
    dir_info = filestore.get_file_info("subdir")
    assert dir_info.name == "subdir"
    assert dir_info.is_dir


def test_get_file_list(filestore):
    files = filestore.get_file_list("")
    assert len(files) == 2
    
    # Test subdir listing
    subdir_files = filestore.get_file_list("subdir")
    assert len(subdir_files) == 1
    assert subdir_files[0].name == "test2.txt"
    
    # Test nonexistent directory
    assert filestore.get_file_list("nonexistent") == []


def test_stream_file_contents(filestore):
    content = b"".join(filestore.stream_file_contents("test.txt"))
    assert content == b"test content"
    
    # Test subdir file
    content = b"".join(filestore.stream_file_contents("subdir/test2.txt"))
    assert content == b"test content 2"


def test_rename_file(filestore, test_dir):
    filestore.rename_file("test.txt", "renamed.txt")
    assert not os.path.exists(os.path.join(test_dir, "test.txt"))
    assert os.path.exists(os.path.join(test_dir, "renamed.txt"))


def test_delete_file_or_dir(filestore, test_dir):
    # Test file deletion
    filestore.delete_file_or_dir("test.txt")
    assert not os.path.exists(os.path.join(test_dir, "test.txt"))
    
    # Create empty dir and test directory deletion
    os.makedirs(os.path.join(test_dir, "empty_dir"))
    filestore.delete_file_or_dir("empty_dir")
    assert not os.path.exists(os.path.join(test_dir, "empty_dir"))


def test_prevent_chroot_escape(filestore, test_dir):
    # Try to access file outside root using ..
    with pytest.raises(ValueError):
        filestore.get_file_info("../outside.txt")
        
    with pytest.raises(ValueError):
        filestore.get_file_list("../")
        
    with pytest.raises(ValueError):
        next(filestore.stream_file_contents("../outside.txt"))
        
    with pytest.raises(ValueError): 
        filestore.rename_file("../outside.txt", "inside.txt")
        
    with pytest.raises(ValueError):
        filestore.rename_file("test.txt", "../outside.txt")
        
    with pytest.raises(ValueError):
        filestore.delete_file_or_dir("../outside.txt")
