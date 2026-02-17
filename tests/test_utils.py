import pytest
from fileglancer.utils import slugify_path, is_likely_binary


def test_slugify_path_simple():
    """Test slugifying a simple path"""
    assert slugify_path("/home/user") == "home_user"


def test_slugify_path_with_multiple_slashes():
    """Test slugifying path with multiple consecutive slashes"""
    assert slugify_path("///home///user///") == "home_user"


def test_slugify_path_with_special_characters():
    """Test slugifying path with various special characters"""
    assert slugify_path("/path/with-special@chars!") == "path_with_special_chars"


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


def test_slugify_path_removes_leading_and_trailing_underscores():
    """Test that both leading and trailing underscores are removed"""
    assert slugify_path("___test___path___") == "test_path"


def test_slugify_path_windows_style():
    """Test slugifying Windows-style paths"""
    assert slugify_path("C:\\Users\\Documents") == "C_Users_Documents"


def test_slugify_path_mixed_separators():
    """Test path with mixed separators (forward and back slashes)"""
    assert slugify_path("/path\\to/mixed\\separators") == "path_to_mixed_separators"


def test_slugify_path_unicode_characters():
    """Test slugifying path with unicode characters (non-ASCII chars become underscores)"""
    assert slugify_path("/path/with/émojis🎉") == "path_with_mojis"


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


# Tests for is_likely_binary


def test_is_likely_binary_plain_text():
    """Test that plain ASCII text is detected as text (not binary)"""
    text = b"Hello, world! This is a text file.\n"
    assert not is_likely_binary(text)


def test_is_likely_binary_utf8_text():
    """Test that UTF-8 text with unicode characters is detected as text"""
    text = "Hello, 世界! This is UTF-8 text with émojis 🎉\n".encode('utf-8')
    assert not is_likely_binary(text)


def test_is_likely_binary_text_with_whitespace():
    """Test that text with tabs and newlines is detected as text"""
    text = b"Line 1\nLine 2\n\tIndented line\r\nWindows line ending"
    assert not is_likely_binary(text)


def test_is_likely_binary_json():
    """Test that JSON data is detected as text"""
    json_data = b'{"key": "value", "number": 123, "nested": {"array": [1, 2, 3]}}'
    assert not is_likely_binary(json_data)


def test_is_likely_binary_xml():
    """Test that XML data is detected as text"""
    xml_data = b'<?xml version="1.0"?>\n<root><element>value</element></root>'
    assert not is_likely_binary(xml_data)


def test_is_likely_binary_python_code():
    """Test that Python source code is detected as text"""
    code = b"def hello():\n    print('Hello, world!')\n    return 42\n"
    assert not is_likely_binary(code)


def test_is_likely_binary_empty_data():
    """Test that empty data is detected as text (not binary)"""
    assert not is_likely_binary(b"")


def test_is_likely_binary_null_bytes():
    """Test that data with null bytes is detected as binary"""
    binary_data = b"Some text\x00with null bytes\x00\x00"
    assert is_likely_binary(binary_data)


def test_is_likely_binary_png_header():
    """Test that PNG file header is detected as binary"""
    png_header = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    assert is_likely_binary(png_header)


def test_is_likely_binary_jpeg_header():
    """Test that JPEG file header is detected as binary"""
    jpeg_header = b'\xff\xd8\xff\xe0\x00\x10JFIF'
    assert is_likely_binary(jpeg_header)


def test_is_likely_binary_pdf_header():
    """Test that PDF file data is detected as binary when it contains control chars"""
    # Real PDF data contains binary streams with control characters
    pdf_data = b'%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\n\x00\x01\x02\x03\x04\x05stream\nbinary\x00data\x01here'
    # This should be detected as binary due to control characters (null bytes and other control chars)
    assert is_likely_binary(pdf_data)


def test_is_likely_binary_zip_header():
    """Test that ZIP file header is detected as binary"""
    zip_header = b'PK\x03\x04\x14\x00\x00\x00\x08\x00'
    assert is_likely_binary(zip_header)


def test_is_likely_binary_executable():
    """Test that ELF executable header is detected as binary"""
    elf_header = b'\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    assert is_likely_binary(elf_header)


def test_is_likely_binary_mixed_content():
    """Test data with some control characters but mostly text"""
    # 99% text, 1% control chars - right at the boundary
    text_part = b"a" * 99
    control_part = b"\x01"
    mixed = text_part + control_part
    # This should be right at the 1% threshold
    assert is_likely_binary(mixed)


def test_is_likely_binary_mostly_text_with_few_control():
    """Test data with control chars below the 1% threshold"""
    # 99.5% text, 0.5% control chars - should be detected as text
    text_part = b"a" * 199
    control_part = b"\x01"
    mixed = text_part + control_part
    assert not is_likely_binary(mixed)


def test_is_likely_binary_csv_data():
    """Test that CSV data is detected as text"""
    csv_data = b"name,age,city\nAlice,30,NYC\nBob,25,LA\n"
    assert not is_likely_binary(csv_data)


def test_is_likely_binary_log_file():
    """Test that log file content is detected as text"""
    log_data = b"[2024-01-01 12:00:00] INFO: Server started\n[2024-01-01 12:00:01] DEBUG: Connection established\n"
    assert not is_likely_binary(log_data)
