"""Tests for the generic ZIP reader module."""

import os
import io
import struct
import zlib
import tempfile
import pytest

from fileglancer.zipread import (
    ZipReader,
    ZipEntry,
    ZipReaderError,
    InvalidZipError,
    ZIP_LOCAL_HEADER_SIG,
    ZIP_CD_SIG,
    ZIP_EOCD_SIG,
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


def create_simple_zip(files: dict, comment: str = None) -> bytes:
    """Create a simple ZIP file with the given files.

    Args:
        files: Dictionary mapping filenames to file contents
        comment: Optional ZIP comment

    Returns:
        bytes: Complete ZIP file data
    """
    data = io.BytesIO()
    cd_entries = []

    # Write local file headers and data
    for filename, content in files.items():
        filename_bytes = filename.encode('utf-8')
        offset = data.tell()

        content_bytes = content.encode('utf-8') if isinstance(content, str) else content
        local_data, crc, comp_size, uncomp_size = create_zip_local_header(
            filename_bytes, content_bytes
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
def temp_zip_file():
    """Create a temporary ZIP file for testing."""
    files = {
        'readme.txt': 'This is a test file.',
        'data/file1.txt': 'File 1 content',
        'data/file2.txt': 'File 2 content',
    }
    comment = "Test ZIP archive"

    zip_data = create_simple_zip(files, comment)

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
        f.write(zip_data)
        temp_path = f.name

    yield temp_path

    if os.path.exists(temp_path):
        os.unlink(temp_path)


class TestZipReaderBasics:
    """Test basic ZipReader functionality."""

    def test_open_close(self, temp_zip_file):
        """Test opening and closing ZIP file."""
        reader = ZipReader(temp_zip_file)
        reader.open()
        assert reader._fh is not None
        assert reader.file_size > 0
        reader.close()
        assert reader._fh is None

    def test_context_manager(self, temp_zip_file):
        """Test using ZipReader as context manager."""
        with ZipReader(temp_zip_file) as reader:
            assert reader._fh is not None
            assert reader.file_size > 0
        assert reader._fh is None

    def test_file_not_found(self):
        """Test opening non-existent file."""
        reader = ZipReader('/nonexistent/path/file.zip')
        with pytest.raises(FileNotFoundError):
            reader.open()

    def test_comment_property(self, temp_zip_file):
        """Test accessing ZIP comment."""
        with ZipReader(temp_zip_file) as reader:
            assert reader.comment == "Test ZIP archive"


class TestCentralDirectory:
    """Test central directory parsing."""

    def test_parse_central_directory(self, temp_zip_file):
        """Test parsing central directory."""
        with ZipReader(temp_zip_file) as reader:
            entries = reader.parse_central_directory()
            assert 'readme.txt' in entries
            assert 'data/file1.txt' in entries
            assert 'data/file2.txt' in entries

    def test_entry_properties(self, temp_zip_file):
        """Test ZipEntry properties."""
        with ZipReader(temp_zip_file) as reader:
            entries = reader.parse_central_directory()

            readme = entries['readme.txt']
            assert readme.is_directory is False
            assert readme.uncompressed_size == len('This is a test file.')

    def test_list_files(self, temp_zip_file):
        """Test listing files in archive."""
        with ZipReader(temp_zip_file) as reader:
            files = reader.list_files()
            assert 'readme.txt' in files
            assert 'data/file1.txt' in files
            assert 'data/file2.txt' in files

    def test_list_files_with_prefix(self, temp_zip_file):
        """Test listing files with prefix filter."""
        with ZipReader(temp_zip_file) as reader:
            files = reader.list_files(prefix='data/')
            assert 'data/file1.txt' in files
            assert 'data/file2.txt' in files
            assert 'readme.txt' not in files

    def test_get_entry(self, temp_zip_file):
        """Test getting specific entry."""
        with ZipReader(temp_zip_file) as reader:
            entry = reader.get_entry('readme.txt')
            assert entry is not None
            assert entry.filename == 'readme.txt'

            missing = reader.get_entry('nonexistent.txt')
            assert missing is None

    def test_stop_condition(self, temp_zip_file):
        """Test parsing with stop condition."""
        with ZipReader(temp_zip_file) as reader:
            # Stop after first file using index
            # Note: stop condition is checked AFTER adding the entry,
            # so returning True at index 0 stops after the first entry
            def stop_after_one(entry, index):
                return index >= 0  # Stop after processing first entry (index 0)

            entries = reader.parse_central_directory(stop_condition=stop_after_one)
            # Should have stopped after first entry
            assert len(entries) == 1

    def test_stop_condition_with_index(self, temp_zip_file):
        """Test that stop condition receives correct index."""
        with ZipReader(temp_zip_file) as reader:
            indices_seen = []

            def track_indices(entry, index):
                indices_seen.append(index)
                return False  # Don't stop

            reader.parse_central_directory(stop_condition=track_indices)
            assert indices_seen == [0, 1, 2]  # 3 files in temp_zip_file

    def test_max_entries(self, temp_zip_file):
        """Test limiting entries with max_entries parameter."""
        with ZipReader(temp_zip_file) as reader:
            entries = reader.parse_central_directory(max_entries=2)
            assert len(entries) == 2

    def test_max_entries_zero(self, temp_zip_file):
        """Test max_entries=0 returns no entries."""
        with ZipReader(temp_zip_file) as reader:
            entries = reader.parse_central_directory(max_entries=0)
            assert len(entries) == 0

    def test_max_entries_exceeds_total(self, temp_zip_file):
        """Test max_entries larger than total entries."""
        with ZipReader(temp_zip_file) as reader:
            # Archive has 3 files, requesting 100
            entries = reader.parse_central_directory(max_entries=100)
            assert len(entries) == 3

    def test_max_entries_with_stop_condition(self, temp_zip_file):
        """Test that stop_condition and max_entries work together."""
        with ZipReader(temp_zip_file) as reader:
            # Stop condition would stop at index 2, but max_entries=1 should stop first
            def stop_at_two(entry, index):
                return index >= 2

            entries = reader.parse_central_directory(
                stop_condition=stop_at_two,
                max_entries=1
            )
            assert len(entries) == 1


class TestFileReading:
    """Test reading files from archive."""

    def test_read_file(self, temp_zip_file):
        """Test reading entire file."""
        with ZipReader(temp_zip_file) as reader:
            content = reader.read_file('readme.txt')
            assert content == b'This is a test file.'

    def test_read_nonexistent_file(self, temp_zip_file):
        """Test reading nonexistent file."""
        with ZipReader(temp_zip_file) as reader:
            with pytest.raises(FileNotFoundError):
                reader.read_file('nonexistent.txt')

    def test_stream_file(self, temp_zip_file):
        """Test streaming file content."""
        with ZipReader(temp_zip_file) as reader:
            chunks = list(reader.stream_file('readme.txt', buffer_size=5))
            content = b''.join(chunks)
            assert content == b'This is a test file.'


class TestRangeRequests:
    """Test range request functionality."""

    def test_stream_file_range(self, temp_zip_file):
        """Test streaming a range of file content."""
        with ZipReader(temp_zip_file) as reader:
            # "This is a test file." - get bytes 0-3 = "This"
            content = b''.join(reader.stream_file_range('readme.txt', 0, 3))
            assert content == b'This'

    def test_stream_file_range_middle(self, temp_zip_file):
        """Test streaming from middle of file."""
        with ZipReader(temp_zip_file) as reader:
            # Get "test"
            content = b''.join(reader.stream_file_range('readme.txt', 10, 13))
            assert content == b'test'

    def test_stream_file_range_invalid(self, temp_zip_file):
        """Test invalid range requests."""
        with ZipReader(temp_zip_file) as reader:
            with pytest.raises(ValueError):
                list(reader.stream_file_range('readme.txt', -1, 5))

            with pytest.raises(ValueError):
                list(reader.stream_file_range('readme.txt', 10, 5))


class TestCompression:
    """Test handling of compressed files."""

    def test_deflate_compression(self):
        """Test reading DEFLATE compressed files."""
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

        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
            f.write(data.getvalue())
            temp_path = f.name

        try:
            with ZipReader(temp_path) as reader:
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


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_archive(self):
        """Test handling of empty archive."""
        files = {}
        zip_data = create_simple_zip(files)

        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as f:
            f.write(zip_data)
            temp_path = f.name

        try:
            with ZipReader(temp_path) as reader:
                entries = reader.parse_central_directory()
                assert len(entries) == 0
                files = reader.list_files()
                assert len(files) == 0
        finally:
            os.unlink(temp_path)

    def test_reader_not_opened(self):
        """Test error when reader not opened."""
        reader = ZipReader('/some/path.zip')
        with pytest.raises(ZipReaderError):
            reader.parse_central_directory()

    def test_entries_property(self, temp_zip_file):
        """Test entries property."""
        with ZipReader(temp_zip_file) as reader:
            # Before parsing
            assert reader.entries == {}

            # After parsing
            reader.parse_central_directory()
            assert len(reader.entries) == 3

    def test_cd_entries_count(self, temp_zip_file):
        """Test cd_entries_count property."""
        with ZipReader(temp_zip_file) as reader:
            assert reader.cd_entries_count == 3
