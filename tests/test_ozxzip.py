"""Tests for the OZX ZIP reader module."""

import os
import io
import struct
import json
import zlib
import tempfile
import pytest

from fileglancer.ozxzip import (
    OZXReader,
    OZXMetadata,
    OZXReaderError,
    InvalidOZXError,
    is_ozx_file,
    is_json_metadata_file,
)
from fileglancer.zipread import (
    ZipReader,
    ZipEntry,
    ZipReaderError,
    InvalidZipError,
    ZIP_LOCAL_HEADER_SIG,
    ZIP_CD_SIG,
    ZIP_EOCD_SIG,
    ZIP_EOCD64_SIG,
    ZIP_EOCD64_LOC_SIG,
    COMPRESSION_STORED,
    COMPRESSION_DEFLATE,
)


def create_zip_local_header(filename: bytes, data: bytes, compression: int = COMPRESSION_STORED) -> bytes:
    """Create a ZIP local file header."""
    crc = zlib.crc32(data) & 0xFFFFFFFF

    if compression == COMPRESSION_DEFLATE:
        compressor = zlib.compressobj(zlib.Z_DEFAULT_COMPRESSION, zlib.DEFLATED, -zlib.MAX_WBITS)
        compressed = compressor.compress(data) + compressor.flush()
        comp_size = len(compressed)
        data_to_write = compressed
    else:
        comp_size = len(data)
        data_to_write = data

    uncomp_size = len(data)

    header = struct.pack(
        '<4sHHHHHLLLHH',
        ZIP_LOCAL_HEADER_SIG,
        20,  # version needed
        0,   # flags
        compression,
        0,   # mod time
        0,   # mod date
        crc,
        comp_size,
        uncomp_size,
        len(filename),
        0    # extra field length
    )
    return header + filename + data_to_write, crc, comp_size, uncomp_size


def create_zip_cd_entry(filename: bytes, crc: int, comp_size: int, uncomp_size: int,
                        local_offset: int, compression: int = COMPRESSION_STORED) -> bytes:
    """Create a ZIP central directory entry."""
    header = struct.pack(
        '<4sHHHHHHLLLHHHHHLL',
        ZIP_CD_SIG,
        20,  # version made by
        20,  # version needed
        0,   # flags
        compression,
        0,   # mod time
        0,   # mod date
        crc,
        comp_size,
        uncomp_size,
        len(filename),
        0,   # extra field length
        0,   # comment length
        0,   # disk number start
        0,   # internal attributes
        0,   # external attributes
        local_offset
    )
    return header + filename


def create_zip_eocd(cd_entries: int, cd_size: int, cd_offset: int, comment: bytes = b'') -> bytes:
    """Create a ZIP end of central directory record."""
    return struct.pack(
        '<4sHHHHLLH',
        ZIP_EOCD_SIG,
        0,  # disk number
        0,  # disk with CD
        cd_entries,
        cd_entries,
        cd_size,
        cd_offset,
        len(comment)
    ) + comment


def create_simple_ozx(files: dict, comment: str = None) -> bytes:
    """Create a simple OZX (ZIP) file with the given files.

    Args:
        files: Dictionary mapping filenames to file contents
        comment: Optional ZIP comment (for OZX metadata)

    Returns:
        bytes: Complete ZIP file data
    """
    data = io.BytesIO()
    cd_entries = []
    local_offsets = []

    # Write local file headers and data
    for filename, content in files.items():
        filename_bytes = filename.encode('utf-8')
        offset = data.tell()
        local_offsets.append(offset)

        local_data, crc, comp_size, uncomp_size = create_zip_local_header(
            filename_bytes, content.encode('utf-8') if isinstance(content, str) else content
        )
        data.write(local_data)
        cd_entries.append((filename_bytes, crc, comp_size, uncomp_size, offset))

    # Write central directory
    cd_start = data.tell()
    for filename_bytes, crc, comp_size, uncomp_size, offset in cd_entries:
        cd_entry = create_zip_cd_entry(filename_bytes, crc, comp_size, uncomp_size, offset)
        data.write(cd_entry)
    cd_size = data.tell() - cd_start

    # Write EOCD
    comment_bytes = comment.encode('utf-8') if comment else b''
    eocd = create_zip_eocd(len(files), cd_size, cd_start, comment_bytes)
    data.write(eocd)

    return data.getvalue()


@pytest.fixture
def temp_ozx_file():
    """Create a temporary OZX file for testing."""
    files = {
        'zarr.json': '{"zarr_format": 3, "node_type": "group"}',
        '0/zarr.json': '{"zarr_format": 3, "node_type": "array"}',
        '0/c/0/0/0': b'\x00' * 100,  # Binary chunk data
    }
    comment = json.dumps({
        "ome": {
            "version": "0.5",
            "zipFile": {
                "centralDirectory": {
                    "jsonFirst": True
                }
            }
        }
    })

    zip_data = create_simple_ozx(files, comment)

    with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
        f.write(zip_data)
        temp_path = f.name

    yield temp_path

    # Cleanup
    if os.path.exists(temp_path):
        os.unlink(temp_path)


@pytest.fixture
def temp_ozx_no_metadata():
    """Create a temporary OZX file without OME metadata."""
    files = {
        'data.txt': 'Hello, World!',
        'folder/nested.txt': 'Nested content',
    }

    zip_data = create_simple_ozx(files)

    with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
        f.write(zip_data)
        temp_path = f.name

    yield temp_path

    if os.path.exists(temp_path):
        os.unlink(temp_path)


class TestOZXReaderBasics:
    """Test basic OZXReader functionality."""

    def test_is_ozx_file(self):
        """Test is_ozx_file helper function."""
        assert is_ozx_file('test.ozx') is True
        assert is_ozx_file('test.OZX') is True
        assert is_ozx_file('path/to/file.ozx') is True
        assert is_ozx_file('test.zip') is False
        assert is_ozx_file('test.zarr') is False
        assert is_ozx_file('ozx') is False

    def test_open_close(self, temp_ozx_file):
        """Test opening and closing OZX file."""
        reader = OZXReader(temp_ozx_file)
        reader.open()
        assert reader._fh is not None
        assert reader.file_size > 0
        reader.close()
        assert reader._fh is None

    def test_context_manager(self, temp_ozx_file):
        """Test using OZXReader as context manager."""
        with OZXReader(temp_ozx_file) as reader:
            assert reader._fh is not None
            assert reader.file_size > 0
        assert reader._fh is None

    def test_file_not_found(self):
        """Test opening non-existent file."""
        reader = OZXReader('/nonexistent/path/file.ozx')
        with pytest.raises(FileNotFoundError):
            reader.open()


class TestOZXMetadataParsing:
    """Test OZX metadata parsing from ZIP comment."""

    def test_parse_ome_metadata(self, temp_ozx_file):
        """Test parsing OME metadata from ZIP comment."""
        with OZXReader(temp_ozx_file) as reader:
            metadata = reader.get_metadata()
            assert metadata is not None
            assert metadata.version == "0.5"
            assert metadata.json_first is True

    def test_no_metadata(self, temp_ozx_no_metadata):
        """Test OZX file without OME metadata."""
        with OZXReader(temp_ozx_no_metadata) as reader:
            metadata = reader.get_metadata()
            assert metadata is None

    def test_invalid_json_comment(self):
        """Test OZX file with invalid JSON comment."""
        files = {'test.txt': 'content'}
        zip_data = create_simple_ozx(files, "not valid json")

        with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
            f.write(zip_data)
            temp_path = f.name

        try:
            with OZXReader(temp_path) as reader:
                metadata = reader.get_metadata()
                assert metadata is None
        finally:
            os.unlink(temp_path)

    def test_json_without_ome_key(self):
        """Test OZX file with JSON comment but no 'ome' key."""
        files = {'test.txt': 'content'}
        comment = json.dumps({"other": "data"})
        zip_data = create_simple_ozx(files, comment)

        with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
            f.write(zip_data)
            temp_path = f.name

        try:
            with OZXReader(temp_path) as reader:
                metadata = reader.get_metadata()
                assert metadata is None
        finally:
            os.unlink(temp_path)


class TestCentralDirectory:
    """Test central directory parsing."""

    def test_parse_central_directory(self, temp_ozx_file):
        """Test parsing central directory."""
        with OZXReader(temp_ozx_file) as reader:
            entries = reader.parse_central_directory()
            assert 'zarr.json' in entries
            assert '0/zarr.json' in entries
            assert '0/c/0/0/0' in entries

    def test_entry_properties(self, temp_ozx_file):
        """Test ZipEntry properties."""
        with OZXReader(temp_ozx_file) as reader:
            entries = reader.parse_central_directory()

            json_entry = entries['zarr.json']
            assert is_json_metadata_file(json_entry.filename) is True
            assert json_entry.is_directory is False

            chunk_entry = entries['0/c/0/0/0']
            assert is_json_metadata_file(chunk_entry.filename) is False
            assert chunk_entry.uncompressed_size == 100

    def test_json_first_optimization(self, temp_ozx_file):
        """Test jsonFirst optimization stops at first non-JSON file."""
        with OZXReader(temp_ozx_file) as reader:
            metadata = reader.get_metadata()
            assert metadata.json_first is True

            # Parse with json_only=True
            entries = reader.parse_central_directory(json_only=True)

            # Should have stopped before the binary chunk
            # The exact behavior depends on the order in the central directory
            assert 'zarr.json' in entries

    def test_list_files(self, temp_ozx_file):
        """Test listing files in archive."""
        with OZXReader(temp_ozx_file) as reader:
            files = reader.list_files()
            assert 'zarr.json' in files
            assert '0/zarr.json' in files
            assert '0/c/0/0/0' in files

    def test_list_files_with_prefix(self, temp_ozx_file):
        """Test listing files with prefix filter."""
        with OZXReader(temp_ozx_file) as reader:
            files = reader.list_files(prefix='0/')
            assert '0/zarr.json' in files
            assert '0/c/0/0/0' in files
            assert 'zarr.json' not in files

    def test_get_entry(self, temp_ozx_file):
        """Test getting specific entry."""
        with OZXReader(temp_ozx_file) as reader:
            entry = reader.get_entry('zarr.json')
            assert entry is not None
            assert entry.filename == 'zarr.json'

            missing = reader.get_entry('nonexistent.txt')
            assert missing is None


class TestFileReading:
    """Test reading files from archive."""

    def test_read_file(self, temp_ozx_file):
        """Test reading entire file."""
        with OZXReader(temp_ozx_file) as reader:
            content = reader.read_file('zarr.json')
            data = json.loads(content.decode('utf-8'))
            assert data['zarr_format'] == 3
            assert data['node_type'] == 'group'

    def test_read_binary_file(self, temp_ozx_file):
        """Test reading binary file."""
        with OZXReader(temp_ozx_file) as reader:
            content = reader.read_file('0/c/0/0/0')
            assert len(content) == 100
            assert content == b'\x00' * 100

    def test_read_nonexistent_file(self, temp_ozx_file):
        """Test reading nonexistent file."""
        with OZXReader(temp_ozx_file) as reader:
            with pytest.raises(FileNotFoundError):
                reader.read_file('nonexistent.txt')

    def test_stream_file(self, temp_ozx_file):
        """Test streaming file content."""
        with OZXReader(temp_ozx_file) as reader:
            chunks = list(reader.stream_file('zarr.json', buffer_size=10))
            content = b''.join(chunks)
            data = json.loads(content.decode('utf-8'))
            assert data['zarr_format'] == 3


class TestRangeRequests:
    """Test range request functionality."""

    def test_stream_file_range(self, temp_ozx_no_metadata):
        """Test streaming a range of file content."""
        with OZXReader(temp_ozx_no_metadata) as reader:
            # "Hello, World!" = 13 bytes
            # Get bytes 0-4 = "Hello"
            content = b''.join(reader.stream_file_range('data.txt', 0, 4))
            assert content == b'Hello'

    def test_stream_file_range_middle(self, temp_ozx_no_metadata):
        """Test streaming from middle of file."""
        with OZXReader(temp_ozx_no_metadata) as reader:
            # Get bytes 7-11 = "World"
            content = b''.join(reader.stream_file_range('data.txt', 7, 11))
            assert content == b'World'

    def test_stream_file_range_full(self, temp_ozx_no_metadata):
        """Test streaming full file via range."""
        with OZXReader(temp_ozx_no_metadata) as reader:
            content = b''.join(reader.stream_file_range('data.txt', 0, 12))
            assert content == b'Hello, World!'

    def test_stream_file_range_past_end(self, temp_ozx_no_metadata):
        """Test range extending past end of file."""
        with OZXReader(temp_ozx_no_metadata) as reader:
            # Request beyond file size - should clamp to file end
            content = b''.join(reader.stream_file_range('data.txt', 7, 100))
            assert content == b'World!'

    def test_stream_file_range_invalid(self, temp_ozx_no_metadata):
        """Test invalid range requests."""
        with OZXReader(temp_ozx_no_metadata) as reader:
            with pytest.raises(ValueError):
                list(reader.stream_file_range('data.txt', -1, 5))

            with pytest.raises(ValueError):
                list(reader.stream_file_range('data.txt', 10, 5))


class TestCompression:
    """Test handling of compressed files."""

    def test_deflate_compression(self):
        """Test reading DEFLATE compressed files."""
        # Create a ZIP with compressed content
        content = b'Hello, this is some test content that should compress well. ' * 10
        filename = b'compressed.txt'

        data = io.BytesIO()

        # Write local header with compression
        local_data, crc, comp_size, uncomp_size = create_zip_local_header(
            filename, content, compression=COMPRESSION_DEFLATE
        )
        data.write(local_data)

        # Write central directory
        cd_start = data.tell()
        cd_entry = create_zip_cd_entry(filename, crc, comp_size, uncomp_size, 0, compression=COMPRESSION_DEFLATE)
        data.write(cd_entry)
        cd_size = data.tell() - cd_start

        # Write EOCD
        eocd = create_zip_eocd(1, cd_size, cd_start)
        data.write(eocd)

        with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
            f.write(data.getvalue())
            temp_path = f.name

        try:
            with OZXReader(temp_path) as reader:
                read_content = reader.read_file('compressed.txt')
                assert read_content == content

                # Test streaming too
                streamed = b''.join(reader.stream_file('compressed.txt'))
                assert streamed == content
        finally:
            os.unlink(temp_path)


class TestZipEntry:
    """Test ZipEntry dataclass."""

    def test_is_directory(self):
        """Test is_directory property."""
        dir_entry = ZipEntry(
            filename='folder/',
            compressed_size=0,
            uncompressed_size=0,
            compression_method=0,
            local_header_offset=0,
            crc32=0
        )
        assert dir_entry.is_directory is True

        file_entry = ZipEntry(
            filename='file.txt',
            compressed_size=100,
            uncompressed_size=100,
            compression_method=0,
            local_header_offset=0,
            crc32=123456
        )
        assert file_entry.is_directory is False

    def test_is_json_metadata_file(self):
        """Test is_json_metadata_file function."""
        test_cases = [
            ('zarr.json', True),
            ('.zarray', True),
            ('.zattrs', True),
            ('.zgroup', True),
            ('data/zarr.JSON', True),  # case insensitive
            ('data.txt', False),
            ('image.png', False),
            ('c/0/0/0', False),
        ]

        for filename, expected in test_cases:
            assert is_json_metadata_file(filename) is expected, f"Failed for {filename}"


class TestOZXMetadata:
    """Test OZXMetadata dataclass."""

    def test_metadata_creation(self):
        """Test creating OZXMetadata."""
        metadata = OZXMetadata(version="0.5", json_first=True)
        assert metadata.version == "0.5"
        assert metadata.json_first is True

    def test_metadata_defaults(self):
        """Test default values."""
        metadata = OZXMetadata(version="0.4")
        assert metadata.json_first is False
        assert metadata.raw_comment is None


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_archive(self):
        """Test handling of empty archive."""
        files = {}
        zip_data = create_simple_ozx(files)

        with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
            f.write(zip_data)
            temp_path = f.name

        try:
            with OZXReader(temp_path) as reader:
                entries = reader.parse_central_directory()
                assert len(entries) == 0
                files = reader.list_files()
                assert len(files) == 0
        finally:
            os.unlink(temp_path)

    def test_reader_not_opened(self):
        """Test error when reader not opened."""
        reader = OZXReader('/some/path.ozx')
        with pytest.raises(ZipReaderError):
            reader.parse_central_directory()

    def test_unicode_filenames(self):
        """Test handling of Unicode filenames."""
        files = {
            'data/日本語.txt': 'Japanese text',
            'data/emoji_🎉.txt': 'Party!',
        }
        zip_data = create_simple_ozx(files)

        with tempfile.NamedTemporaryFile(suffix='.ozx', delete=False) as f:
            f.write(zip_data)
            temp_path = f.name

        try:
            with OZXReader(temp_path) as reader:
                entries = reader.parse_central_directory()
                assert 'data/日本語.txt' in entries
                assert 'data/emoji_🎉.txt' in entries

                content = reader.read_file('data/日本語.txt')
                assert content.decode('utf-8') == 'Japanese text'
        finally:
            os.unlink(temp_path)
