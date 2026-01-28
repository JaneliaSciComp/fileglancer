"""Generic ZIP file reader with streaming support.

This module provides functionality to read ZIP archives with support for:
- ZIP64 format for large files
- STORE and DEFLATE compression methods
- Range request streaming for efficient chunk access
"""

import struct
import zlib
from dataclasses import dataclass, field
from typing import Optional, Dict, Generator, BinaryIO, List, Callable
from io import BytesIO

from loguru import logger

# ZIP signatures
ZIP_LOCAL_HEADER_SIG = b'\x50\x4b\x03\x04'
ZIP_CD_SIG = b'\x50\x4b\x01\x02'
ZIP_EOCD_SIG = b'\x50\x4b\x05\x06'
ZIP_EOCD64_SIG = b'\x50\x4b\x06\x06'
ZIP_EOCD64_LOC_SIG = b'\x50\x4b\x06\x07'

# Compression methods
COMPRESSION_STORED = 0
COMPRESSION_DEFLATE = 8

# ZIP64 marker value
ZIP64_MARKER = 0xFFFFFFFF
ZIP64_MARKER_16 = 0xFFFF

# Extra field header IDs
ZIP64_EXTRA_ID = 0x0001

# Default buffer size for streaming
DEFAULT_BUFFER_SIZE = 8192

# Maximum EOCD search size (65KB comment + 22 byte EOCD header)
MAX_EOCD_SEARCH_SIZE = 65536 + 22


@dataclass
class ZipEntry:
    """A file entry from the ZIP central directory."""
    filename: str
    compressed_size: int
    uncompressed_size: int
    compression_method: int  # 0=STORE, 8=DEFLATE
    local_header_offset: int
    crc32: int
    extra_field: bytes = field(default_factory=bytes, repr=False)

    @property
    def is_directory(self) -> bool:
        """Check if this entry represents a directory."""
        return self.filename.endswith('/')


class ZipReaderError(Exception):
    """Base exception for ZIP reader errors."""
    pass


class InvalidZipError(ZipReaderError):
    """Raised when the ZIP file is invalid or corrupted."""
    pass


class ZipReader:
    """
    Generic ZIP file reader with streaming support.

    Supports:
    - ZIP64 format for large files
    - STORE and DEFLATE compression
    - Range requests for streaming chunks
    - Custom comment parsing via callback

    Usage:
        with ZipReader('/path/to/file.zip') as reader:
            entries = reader.parse_central_directory()
            content = reader.read_file('path/in/archive.txt')
    """

    def __init__(self, file_path: str):
        """Initialize the ZIP reader.

        Args:
            file_path: Path to the ZIP file
        """
        self.file_path = file_path
        self._fh: Optional[BinaryIO] = None
        self._file_size: int = 0
        self._comment: str = ""
        self._entries: Dict[str, ZipEntry] = {}
        self._cd_offset: int = 0
        self._cd_size: int = 0
        self._cd_entries_count: int = 0
        self._is_zip64: bool = False
        self._cd_parsed: bool = False

    def open(self) -> 'ZipReader':
        """Open the file and parse EOCD.

        Returns:
            Self for method chaining

        Raises:
            FileNotFoundError: If the file doesn't exist
            InvalidZipError: If the file is not a valid ZIP
        """
        import os
        self._fh = open(self.file_path, 'rb')
        self._file_size = os.fstat(self._fh.fileno()).st_size
        self._parse_eocd()
        return self

    def close(self):
        """Close the file handle."""
        if self._fh:
            self._fh.close()
            self._fh = None

    def __enter__(self) -> 'ZipReader':
        return self.open()

    def __exit__(self, *args):
        self.close()

    @property
    def file_size(self) -> int:
        """Get the size of the ZIP file."""
        return self._file_size

    @property
    def is_zip64(self) -> bool:
        """Check if this is a ZIP64 format archive."""
        return self._is_zip64

    @property
    def comment(self) -> str:
        """Get the ZIP file comment."""
        return self._comment

    @property
    def entries(self) -> Dict[str, ZipEntry]:
        """Get the parsed entries dictionary."""
        return self._entries

    @property
    def cd_entries_count(self) -> int:
        """Get the number of entries in the central directory."""
        return self._cd_entries_count

    def parse_central_directory(
        self,
        stop_condition: Optional[Callable[[ZipEntry, int], bool]] = None,
        max_entries: Optional[int] = None
    ) -> Dict[str, ZipEntry]:
        """
        Parse the central directory.

        Args:
            stop_condition: Optional callback that receives each ZipEntry and its
                           0-based index. If it returns True, parsing stops early.
                           Useful for optimizations like stopping after metadata files.
            max_entries: Optional maximum number of entries to parse. If specified,
                        parsing stops after this many entries are processed.

        Returns:
            Dictionary mapping filenames to ZipEntry objects

        Raises:
            InvalidZipError: If central directory is corrupted
        """
        if self._fh is None:
            raise ZipReaderError("File not opened")

        if self._cd_parsed:
            return self._entries

        self._fh.seek(self._cd_offset)
        entries: Dict[str, ZipEntry] = {}

        # Determine the maximum entries to process
        entries_to_process = self._cd_entries_count
        if max_entries is not None:
            entries_to_process = min(entries_to_process, max_entries)

        for i in range(self._cd_entries_count):
            # Check max_entries limit
            if max_entries is not None and i >= max_entries:
                logger.debug(f"Reached max_entries limit ({max_entries})")
                break

            # Read CD file header (46 bytes minimum)
            header = self._fh.read(46)
            if len(header) < 46 or header[:4] != ZIP_CD_SIG:
                raise InvalidZipError(f"Invalid central directory entry at index {i}")

            # Parse header fields
            (version_made, version_needed, flags, compression,
             mod_time, mod_date, crc32, comp_size, uncomp_size,
             name_len, extra_len, comment_len, disk_start,
             internal_attr, external_attr, local_offset) = struct.unpack(
                '<HHHHHHLLLHHHHHLL', header[4:46])

            # Read filename
            filename = self._fh.read(name_len).decode('utf-8', errors='replace')

            # Read extra field
            extra = self._fh.read(extra_len) if extra_len > 0 else b''

            # Skip comment
            if comment_len > 0:
                self._fh.seek(comment_len, 1)

            # Handle ZIP64 extra field if needed
            if comp_size == ZIP64_MARKER or uncomp_size == ZIP64_MARKER or local_offset == ZIP64_MARKER:
                comp_size, uncomp_size, local_offset = self._parse_zip64_extra(
                    extra, comp_size, uncomp_size, local_offset)

            entry = ZipEntry(
                filename=filename,
                compressed_size=comp_size,
                uncompressed_size=uncomp_size,
                compression_method=compression,
                local_header_offset=local_offset,
                crc32=crc32,
                extra_field=extra
            )

            entries[filename] = entry

            # Check stop condition
            if stop_condition and stop_condition(entry, i):
                logger.debug(f"Stop condition met at index {i}, filename: {filename}")
                break

        self._entries.update(entries)
        if stop_condition is None and max_entries is None:
            self._cd_parsed = True

        return entries

    def list_files(self, prefix: str = "") -> List[str]:
        """List files in archive, optionally filtered by prefix.

        Args:
            prefix: Only return files starting with this prefix

        Returns:
            List of filenames matching the prefix
        """
        if not self._cd_parsed:
            self.parse_central_directory()

        if prefix:
            return [name for name in self._entries.keys()
                    if name.startswith(prefix) and not self._entries[name].is_directory]
        return [name for name in self._entries.keys()
                if not self._entries[name].is_directory]

    def get_entry(self, path: str) -> Optional[ZipEntry]:
        """Get info about a specific file in the archive.

        Args:
            path: Path within the archive

        Returns:
            ZipEntry if found, None otherwise
        """
        if not self._cd_parsed:
            self.parse_central_directory()
        return self._entries.get(path)

    def read_file(self, path: str) -> bytes:
        """Read entire file from archive.

        Args:
            path: Path within the archive

        Returns:
            File contents as bytes

        Raises:
            FileNotFoundError: If path not found in archive
            InvalidZipError: If decompression fails
        """
        return b''.join(self.stream_file(path))

    def stream_file(self, path: str, buffer_size: int = DEFAULT_BUFFER_SIZE) -> Generator[bytes, None, None]:
        """Stream file content from archive.

        Args:
            path: Path within the archive
            buffer_size: Size of chunks to yield

        Yields:
            Chunks of file content

        Raises:
            FileNotFoundError: If path not found in archive
        """
        if self._fh is None:
            raise ZipReaderError("File not opened")

        entry = self.get_entry(path)
        if entry is None:
            raise FileNotFoundError(f"File not found in archive: {path}")

        # Seek to local file header and skip it
        self._fh.seek(entry.local_header_offset)
        local_header = self._fh.read(30)
        if local_header[:4] != ZIP_LOCAL_HEADER_SIG:
            raise InvalidZipError(f"Invalid local header for {path}")

        # Get local header name and extra lengths
        name_len, extra_len = struct.unpack('<HH', local_header[26:30])
        # Skip name and extra fields
        self._fh.seek(name_len + extra_len, 1)

        # Now at file data
        if entry.compression_method == COMPRESSION_STORED:
            # Uncompressed - stream directly
            remaining = entry.uncompressed_size
            while remaining > 0:
                chunk_size = min(buffer_size, remaining)
                chunk = self._fh.read(chunk_size)
                if not chunk:
                    break
                yield chunk
                remaining -= len(chunk)

        elif entry.compression_method == COMPRESSION_DEFLATE:
            # Compressed - need to decompress
            decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
            remaining = entry.compressed_size

            while remaining > 0:
                chunk_size = min(buffer_size, remaining)
                compressed_chunk = self._fh.read(chunk_size)
                if not compressed_chunk:
                    break
                remaining -= len(compressed_chunk)

                decompressed = decompressor.decompress(compressed_chunk)
                if decompressed:
                    yield decompressed

            # Flush any remaining data
            final = decompressor.flush()
            if final:
                yield final
        else:
            raise InvalidZipError(f"Unsupported compression method: {entry.compression_method}")

    def stream_file_range(self, path: str, start: int, end: int,
                          buffer_size: int = DEFAULT_BUFFER_SIZE) -> Generator[bytes, None, None]:
        """Stream a byte range of uncompressed file content.

        Note: For DEFLATE compressed files, this must decompress from the
        beginning to reach the desired offset.

        Args:
            path: Path within the archive
            start: Start byte offset (inclusive)
            end: End byte offset (inclusive)
            buffer_size: Size of chunks to yield

        Yields:
            Chunks of file content within the specified range

        Raises:
            FileNotFoundError: If path not found in archive
            ValueError: If range is invalid
        """
        if self._fh is None:
            raise ZipReaderError("File not opened")

        entry = self.get_entry(path)
        if entry is None:
            raise FileNotFoundError(f"File not found in archive: {path}")

        if start < 0:
            raise ValueError("Start position cannot be negative")
        if end < start:
            raise ValueError("End position cannot be less than start position")
        if start >= entry.uncompressed_size:
            return  # Nothing to return

        # Clamp end to file size
        end = min(end, entry.uncompressed_size - 1)
        range_length = end - start + 1

        # Seek to local file header and skip it
        self._fh.seek(entry.local_header_offset)
        local_header = self._fh.read(30)
        if local_header[:4] != ZIP_LOCAL_HEADER_SIG:
            raise InvalidZipError(f"Invalid local header for {path}")

        name_len, extra_len = struct.unpack('<HH', local_header[26:30])
        self._fh.seek(name_len + extra_len, 1)

        if entry.compression_method == COMPRESSION_STORED:
            # For stored files, we can seek directly
            self._fh.seek(start, 1)  # Relative seek from current position
            remaining = range_length

            while remaining > 0:
                chunk_size = min(buffer_size, remaining)
                chunk = self._fh.read(chunk_size)
                if not chunk:
                    break
                yield chunk
                remaining -= len(chunk)

        elif entry.compression_method == COMPRESSION_DEFLATE:
            # For compressed files, we need to decompress from the start
            # and skip to the desired offset
            decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
            compressed_remaining = entry.compressed_size
            decompressed_pos = 0
            output_remaining = range_length

            while compressed_remaining > 0 and output_remaining > 0:
                chunk_size = min(buffer_size, compressed_remaining)
                compressed_chunk = self._fh.read(chunk_size)
                if not compressed_chunk:
                    break
                compressed_remaining -= len(compressed_chunk)

                decompressed = decompressor.decompress(compressed_chunk)
                if not decompressed:
                    continue

                # Handle the decompressed chunk
                chunk_start = 0
                chunk_len = len(decompressed)

                # Skip data before our range
                if decompressed_pos + chunk_len <= start:
                    decompressed_pos += chunk_len
                    continue

                # Calculate how much of this chunk to skip
                if decompressed_pos < start:
                    chunk_start = start - decompressed_pos

                # Calculate how much of this chunk to output
                output_bytes = min(chunk_len - chunk_start, output_remaining)

                if output_bytes > 0:
                    yield decompressed[chunk_start:chunk_start + output_bytes]
                    output_remaining -= output_bytes

                decompressed_pos += chunk_len

            # Flush and handle remaining
            if output_remaining > 0:
                final = decompressor.flush()
                if final:
                    # Apply same range logic to final chunk
                    chunk_len = len(final)
                    if decompressed_pos + chunk_len > start:
                        chunk_start = max(0, start - decompressed_pos)
                        output_bytes = min(chunk_len - chunk_start, output_remaining)
                        if output_bytes > 0:
                            yield final[chunk_start:chunk_start + output_bytes]
        else:
            raise InvalidZipError(f"Unsupported compression method: {entry.compression_method}")

    def _parse_eocd(self):
        """Parse End of Central Directory record.

        Raises:
            InvalidZipError: If EOCD not found or invalid
        """
        if self._fh is None:
            raise ZipReaderError("File not opened")

        # Search backwards from end of file for EOCD signature
        search_size = min(MAX_EOCD_SEARCH_SIZE, self._file_size)
        self._fh.seek(self._file_size - search_size)
        data = self._fh.read(search_size)

        # Find EOCD signature (searching from end)
        eocd_pos = data.rfind(ZIP_EOCD_SIG)
        if eocd_pos == -1:
            raise InvalidZipError("End of Central Directory not found")

        # Position in file
        eocd_file_pos = self._file_size - search_size + eocd_pos

        # Parse EOCD (22 bytes minimum)
        eocd = data[eocd_pos:eocd_pos + 22]
        if len(eocd) < 22:
            raise InvalidZipError("Truncated EOCD record")

        (disk_num, cd_disk, cd_entries_this_disk, cd_entries_total,
         cd_size, cd_offset, comment_len) = struct.unpack('<HHHHLLH', eocd[4:22])

        # Read comment if present
        if comment_len > 0:
            comment_data = data[eocd_pos + 22:eocd_pos + 22 + comment_len]
            if len(comment_data) == comment_len:
                self._comment = comment_data.decode('utf-8', errors='replace')

        # Check for ZIP64
        if (cd_offset == ZIP64_MARKER or cd_size == ZIP64_MARKER or
            cd_entries_total == ZIP64_MARKER_16):
            self._is_zip64 = True
            self._parse_zip64_eocd(eocd_file_pos)
        else:
            self._cd_offset = cd_offset
            self._cd_size = cd_size
            self._cd_entries_count = cd_entries_total

    def _parse_zip64_eocd(self, eocd_pos: int):
        """Parse ZIP64 End of Central Directory records.

        Args:
            eocd_pos: Position of standard EOCD in file

        Raises:
            InvalidZipError: If ZIP64 records not found or invalid
        """
        if self._fh is None:
            raise ZipReaderError("File not opened")

        # Look for ZIP64 EOCD Locator (20 bytes before EOCD)
        loc_pos = eocd_pos - 20
        if loc_pos < 0:
            raise InvalidZipError("ZIP64 EOCD Locator not found")

        self._fh.seek(loc_pos)
        locator = self._fh.read(20)

        if locator[:4] != ZIP_EOCD64_LOC_SIG:
            raise InvalidZipError("Invalid ZIP64 EOCD Locator")

        # Parse locator to get ZIP64 EOCD offset
        (zip64_disk, zip64_eocd_offset, total_disks) = struct.unpack(
            '<LQL', locator[4:20])

        # Read ZIP64 EOCD
        self._fh.seek(zip64_eocd_offset)
        zip64_eocd = self._fh.read(56)  # Minimum size

        if zip64_eocd[:4] != ZIP_EOCD64_SIG:
            raise InvalidZipError("Invalid ZIP64 EOCD")

        # Parse ZIP64 EOCD
        (eocd64_size, version_made, version_needed, disk_num, cd_disk,
         cd_entries_this_disk, cd_entries_total, cd_size, cd_offset) = struct.unpack(
            '<QHHLLQQQ', zip64_eocd[4:56])

        self._cd_offset = cd_offset
        self._cd_size = cd_size
        self._cd_entries_count = cd_entries_total

    def _parse_zip64_extra(self, extra: bytes, comp_size: int,
                           uncomp_size: int, local_offset: int) -> tuple:
        """Parse ZIP64 extra field to get actual values.

        Args:
            extra: Extra field data
            comp_size: Compressed size from CD (may be 0xFFFFFFFF)
            uncomp_size: Uncompressed size from CD (may be 0xFFFFFFFF)
            local_offset: Local header offset from CD (may be 0xFFFFFFFF)

        Returns:
            Tuple of (actual_comp_size, actual_uncomp_size, actual_local_offset)
        """
        offset = 0
        while offset + 4 <= len(extra):
            header_id, data_size = struct.unpack('<HH', extra[offset:offset + 4])
            offset += 4

            if header_id == ZIP64_EXTRA_ID:
                # ZIP64 extended info
                data = extra[offset:offset + data_size]
                idx = 0

                if uncomp_size == ZIP64_MARKER and idx + 8 <= len(data):
                    uncomp_size = struct.unpack('<Q', data[idx:idx + 8])[0]
                    idx += 8

                if comp_size == ZIP64_MARKER and idx + 8 <= len(data):
                    comp_size = struct.unpack('<Q', data[idx:idx + 8])[0]
                    idx += 8

                if local_offset == ZIP64_MARKER and idx + 8 <= len(data):
                    local_offset = struct.unpack('<Q', data[idx:idx + 8])[0]
                    idx += 8

                break

            offset += data_size

        return comp_size, uncomp_size, local_offset
