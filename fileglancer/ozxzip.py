"""RFC-9 compliant reader for .ozx (Zipped OME-Zarr) files.

RFC-9 Spec: https://ngff.openmicroscopy.org/rfc/9/index.html
OME-Zarr v0.5 Spec: https://ngff.openmicroscopy.org/0.5/index.html

This module extends the generic ZipReader with OZX-specific functionality:
- OME metadata parsing from ZIP comment
- jsonFirst optimization for partial central directory parsing
"""

import json
from dataclasses import dataclass
from typing import Optional, Dict

from loguru import logger

from .zipread import ZipReader, ZipEntry, ZipReaderError, InvalidZipError


@dataclass
class OZXMetadata:
    """Parsed OME metadata from ZIP comment (RFC-9 format).

    RFC-9 defines the ZIP comment format as:
    {
        "ome": {
            "version": "0.5",
            "zipFile": {
                "centralDirectory": {
                    "jsonFirst": true
                }
            }
        }
    }
    """
    version: str
    json_first: bool = False
    raw_comment: Optional[str] = None


class OZXReaderError(ZipReaderError):
    """Base exception for OZX reader errors."""
    pass


class InvalidOZXError(OZXReaderError):
    """Raised when the file is not a valid OZX file."""
    pass


def is_json_metadata_file(filename: str) -> bool:
    """Check if a filename is a JSON metadata file.

    Used for the jsonFirst optimization - these files are sorted
    first in the central directory when jsonFirst=True.

    Args:
        filename: The filename to check

    Returns:
        True if this is a JSON metadata file
    """
    name = filename.lower()
    return (name.endswith('.json') or
            name.endswith('.zattrs') or
            name.endswith('.zarray') or
            name.endswith('.zgroup'))


class OZXReader(ZipReader):
    """
    RFC-9 compliant reader for .ozx (Zipped OME-Zarr) files.

    Extends ZipReader with OZX-specific functionality:
    - Parses OME metadata from ZIP comment
    - Supports jsonFirst optimization for partial central directory parsing

    Note: RFC-9 is for OME-Zarr v0.5 which requires Zarr v3 only.

    Usage:
        with OZXReader('/path/to/file.ozx') as reader:
            metadata = reader.get_ome_metadata()
            if metadata and metadata.json_first:
                entries = reader.parse_central_directory(json_only=True)
            else:
                entries = reader.parse_central_directory()
            content = reader.read_file('zarr.json')
    """

    def __init__(self, file_path: str):
        """Initialize the OZX reader.

        Args:
            file_path: Path to the .ozx file
        """
        super().__init__(file_path)
        self._ome_metadata: Optional[OZXMetadata] = None

    def open(self) -> 'OZXReader':
        """Open the file, parse EOCD, and extract OME metadata.

        Returns:
            Self for method chaining

        Raises:
            FileNotFoundError: If the file doesn't exist
            InvalidZipError: If the file is not a valid ZIP
        """
        super().open()
        # Parse OME metadata from ZIP comment
        self._ome_metadata = self._parse_ome_comment(self.comment)
        return self

    def get_ome_metadata(self) -> Optional[OZXMetadata]:
        """Get parsed OME metadata from ZIP comment.

        Returns:
            OZXMetadata if valid OME metadata found, None otherwise
        """
        return self._ome_metadata

    # Alias for backward compatibility
    def get_metadata(self) -> Optional[OZXMetadata]:
        """Alias for get_ome_metadata() for backward compatibility."""
        return self.get_ome_metadata()

    def parse_central_directory(
        self,
        json_only: bool = False,
        stop_condition: Optional[Callable[[ZipEntry, int], bool]] = None,
        max_new_entries: Optional[int] = None
    ) -> Dict[str, ZipEntry]:
        """
        Parse the central directory with optional jsonFirst optimization.

        Args:
            json_only: If True and jsonFirst=True in metadata, stop parsing
                      after the last JSON metadata file. This is the RFC-9
                      optimization for efficient metadata discovery.
            stop_condition: Optional callback (passed to parent).
            max_new_entries: Optional maximum number of entries to parse (passed to parent).

        Returns:
            Dictionary mapping filenames to ZipEntry objects

        Raises:
            InvalidZipError: If central directory is corrupted
        """
        if json_only and self._ome_metadata and self._ome_metadata.json_first:
            # Use the stop condition to implement jsonFirst optimization
            def stop_at_non_json(entry: ZipEntry, index: int) -> bool:
                # Check user's stop condition first
                if stop_condition and stop_condition(entry, index):
                    return True

                if entry.is_directory:
                    return False
                return not is_json_metadata_file(entry.filename)

            return super().parse_central_directory(stop_condition=stop_at_non_json, max_new_entries=max_new_entries)
        else:
            return super().parse_central_directory(stop_condition=stop_condition, max_new_entries=max_new_entries)

    def _parse_ome_comment(self, comment: str) -> Optional[OZXMetadata]:
        """Parse ZIP comment for RFC-9 OME metadata.

        RFC-9 comment format:
        {
            "ome": {
                "version": "0.5",
                "zipFile": {
                    "centralDirectory": {
                        "jsonFirst": true
                    }
                }
            }
        }

        Args:
            comment: ZIP file comment string

        Returns:
            OZXMetadata if valid, None otherwise
        """
        if not comment:
            return None

        try:
            data = json.loads(comment)
            if not isinstance(data, dict) or 'ome' not in data:
                logger.debug("ZIP comment is not OME metadata")
                return None

            ome = data['ome']
            if not isinstance(ome, dict) or 'version' not in ome:
                logger.debug("Invalid OME metadata structure")
                return None

            version = str(ome['version'])

            # Check for jsonFirst flag
            json_first = False
            zip_file = ome.get('zipFile', {})
            if isinstance(zip_file, dict):
                cd = zip_file.get('centralDirectory', {})
                if isinstance(cd, dict):
                    json_first = bool(cd.get('jsonFirst', False))

            logger.debug(f"Parsed OZX metadata: version={version}, jsonFirst={json_first}")
            return OZXMetadata(
                version=version,
                json_first=json_first,
                raw_comment=comment
            )

        except json.JSONDecodeError as e:
            logger.debug(f"Failed to parse ZIP comment as JSON: {e}")
            return None


def is_ozx_file(filename: str) -> bool:
    """Check if a filename has the .ozx extension.

    Args:
        filename: Filename to check

    Returns:
        True if the file has a .ozx extension
    """
    return filename.lower().endswith('.ozx')


# Re-export commonly used items from zipread for convenience
__all__ = [
    'OZXReader',
    'OZXMetadata',
    'OZXReaderError',
    'InvalidOZXError',
    'is_ozx_file',
    'is_json_metadata_file',
    # Re-exports from zipread
    'ZipReader',
    'ZipEntry',
    'ZipReaderError',
    'InvalidZipError',
]
