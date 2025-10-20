import pytest
from fileglancer.utils import slugify_path


def test_slugify_path_simple():
    """Test slugifying a simple path"""
    assert slugify_path("/home/user") == "home_user"


def test_slugify_path_with_multiple_slashes():
    """Test slugifying path with multiple consecutive slashes"""
    assert slugify_path("///home///user///") == "home_user_"


def test_slugify_path_with_special_characters():
    """Test slugifying path with various special characters"""
    assert slugify_path("/path/with-special@chars!") == "path_with_special_chars_"


def test_slugify_path_with_spaces():
    """Test slugifying path with spaces"""
    assert slugify_path("/path with spaces/test") == "path_with_spaces_test"


def test_slugify_path_with_dots():
    """Test slugifying path with dots"""
    assert slugify_path("/home/user/.config") == "home_user_config"


def test_slugify_path_alphanumeric_only():
    """Test that alphanumeric characters are preserved"""
    assert slugify_path("/path123/ABC/test") == "path123_ABC_test"


def test_slugify_path_empty_string():
    """Test slugifying an empty string"""
    assert slugify_path("") == ""


def test_slugify_path_only_special_chars():
    """Test slugifying a string with only special characters"""
    assert slugify_path("/@#$%^&*()") == ""


def test_slugify_path_removes_leading_underscores():
    """Test that leading underscores are removed but trailing are kept"""
    assert slugify_path("___test___path___") == "test_path_"


def test_slugify_path_windows_style():
    """Test slugifying Windows-style paths"""
    assert slugify_path("C:\\Users\\Documents") == "C_Users_Documents"


def test_slugify_path_mixed_separators():
    """Test path with mixed separators (forward and back slashes)"""
    assert slugify_path("/path\\to/mixed\\separators") == "path_to_mixed_separators"


def test_slugify_path_unicode_characters():
    """Test slugifying path with unicode characters (non-ASCII chars become underscores)"""
    assert slugify_path("/path/with/émojis🎉") == "path_with_mojis_"


def test_slugify_path_long_path():
    """Test slugifying a very long path"""
    long_path = "/very/long/path/" * 100
    result = slugify_path(long_path)
    assert result.startswith("very_long_path")
    assert not result.startswith("_")
    # Should have no consecutive underscores
    assert "__" not in result


def test_slugify_path_with_numbers():
    """Test that numbers are preserved"""
    assert slugify_path("/path/123/456/789") == "path_123_456_789"


def test_slugify_path_preserves_case():
    """Test that case is preserved"""
    assert slugify_path("/Path/To/File") == "Path_To_File"


def test_slugify_path_multiple_special_chars_become_single_underscore():
    """Test that multiple consecutive special chars become single underscore"""
    assert slugify_path("/path@@@with###many!!!special") == "path_with_many_special"


def test_slugify_path_typical_unix_path():
    """Test typical Unix absolute path"""
    assert slugify_path("/groups/scicompsoft/home/user") == "groups_scicompsoft_home_user"


def test_slugify_path_typical_network_share():
    """Test typical network share path"""
    assert slugify_path("//server/share/folder") == "server_share_folder"
