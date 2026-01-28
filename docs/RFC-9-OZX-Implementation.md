# RFC-9 Zipped OME-Zarr (.ozx) Implementation

**Date**: 2026-01-28
**RFC Spec**: https://ngff.openmicroscopy.org/rfc/9/index.html
**OME-Zarr v0.5 Spec**: https://ngff.openmicroscopy.org/0.5/index.html

## Overview

This document describes the implementation of RFC-9 support for reading OME-Zarr data from ZIP archives (`.ozx` files) in Fileglancer. The implementation allows users to browse, preview, and access OME-Zarr imaging data stored in compressed ZIP archives without extracting them.

**Important**: RFC-9 is designed specifically for OME-Zarr v0.5, which is built on **Zarr v3 only**. This implementation does not support Zarr v2 within OZX files.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌─────────────────┐    ┌──────────────┐    ┌────────────────┐ │
│  │ ozxDetection.ts │───▶│ OzxFetchStore│───▶│ zarrita/ome-zarr│ │
│  │ (detection)     │    │ (custom store)│    │ (existing)     │ │
│  └─────────────────┘    └──────────────┘    └────────────────┘ │
│                               │                                  │
└───────────────────────────────│──────────────────────────────────┘
                                │ HTTP + Range requests
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│  ┌──────────────────────┐    ┌─────────────────────────────┐   │
│  │ /api/ozx-content/    │    │ OZXReader (ozxzip.py)       │   │
│  │ /api/ozx-metadata/   │───▶│ - OME metadata parsing      │   │
│  │ /api/ozx-list/       │    │ - jsonFirst optimization    │   │
│  └──────────────────────┘    ├─────────────────────────────┤   │
│                              │ ZipReader (zipread.py)      │   │
│                              │ - ZIP64 support             │   │
│                              │ - Partial CD parsing        │   │
│                              │ - Range request streaming   │   │
│                              └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### Backend (Python)

| File                     | Action     | Description                                   |
| ------------------------ | ---------- | --------------------------------------------- |
| `fileglancer/zipread.py` | **CREATE** | Generic ZIP reader with streaming support     |
| `fileglancer/ozxzip.py`  | **CREATE** | RFC-9 OZX layer extending ZipReader           |
| `fileglancer/app.py`     | MODIFY     | Add `/api/ozx-*` endpoints                    |
| `fileglancer/model.py`   | MODIFY     | Add OZX Pydantic models                       |
| `tests/test_zipread.py`  | **CREATE** | Unit tests for generic ZipReader (27 tests)   |
| `tests/test_ozxzip.py`   | **CREATE** | Unit tests for OZXReader (31 tests)           |

### Frontend (TypeScript)

| File                                                    | Action     | Description                            |
| ------------------------------------------------------- | ---------- | -------------------------------------- |
| `frontend/src/utils/ozxDetection.ts`                    | **CREATE** | `.ozx` file detection utilities        |
| `frontend/src/queries/ozxQueries.ts`                    | **CREATE** | TanStack Query hooks and OzxFetchStore |
| `frontend/src/queries/zarrQueries.ts`                   | MODIFY     | OZX detection integration              |
| `frontend/src/__tests__/unitTests/ozxDetection.test.ts` | **CREATE** | Frontend detection tests (20 tests)    |

## Backend Implementation Details

The backend uses a two-layer architecture separating generic ZIP functionality from OZX-specific features.

### ZipReader (`fileglancer/zipread.py`)

Generic ZIP file reader providing:

1. **EOCD Parsing**: Locates End of Central Directory record by scanning backwards from file end
2. **ZIP64 Support**: Handles large archives with ZIP64 extended fields
3. **Compression**: Supports STORE (uncompressed) and DEFLATE compression methods
4. **Range Streaming**: Efficient byte-range streaming for HTTP Range requests
5. **Flexible Parsing**: Supports `stop_condition` callback and `max_entries` limit

Key classes and functions:

- `ZipReader`: Generic ZIP reader with context manager support
- `ZipEntry`: Individual file entry from central directory
- `ZipReaderError`, `InvalidZipError`: Exception classes

#### Central Directory Parsing API

```python
def parse_central_directory(
    self,
    stop_condition: Optional[Callable[[ZipEntry, int], bool]] = None,
    max_entries: Optional[int] = None
) -> Dict[str, ZipEntry]:
    """
    Parse the central directory.

    Args:
        stop_condition: Optional callback receiving (entry, index).
                       Returns True to stop parsing after the current entry.
        max_entries: Optional maximum number of entries to parse.

    Returns:
        Dictionary mapping filenames to ZipEntry objects
    """
```

**Examples**:

```python
# Parse all entries
entries = reader.parse_central_directory()

# Stop after 100 entries
entries = reader.parse_central_directory(max_entries=100)

# Stop when finding a specific file
def stop_at_target(entry, index):
    return entry.filename == "target.json"
entries = reader.parse_central_directory(stop_condition=stop_at_target)

# Stop after processing 5 JSON files
json_count = [0]
def stop_after_5_json(entry, index):
    if entry.filename.endswith('.json'):
        json_count[0] += 1
    return json_count[0] >= 5
entries = reader.parse_central_directory(stop_condition=stop_after_5_json)
```

### OZXReader (`fileglancer/ozxzip.py`)

Extends `ZipReader` with RFC-9 OZX-specific functionality:

1. **OME Metadata**: Parses ZIP comment for RFC-9 OME metadata JSON
2. **jsonFirst Optimization**: When `jsonFirst=true` in metadata, stops parsing central directory after last JSON metadata file
3. **Metadata File Detection**: Identifies `.json`, `.zattrs`, `.zarray`, `.zgroup` files

Key classes and functions:

- `OZXReader`: Extends ZipReader with OZX-specific methods
- `OZXMetadata`: Parsed OME metadata from ZIP comment
- `is_json_metadata_file()`: Check if filename is a JSON metadata file
- `is_ozx_file()`: Check if filename has `.ozx` extension

#### jsonFirst Optimization

```python
with OZXReader(path) as reader:
    metadata = reader.get_ome_metadata()

    # Parse only JSON metadata files (efficient for large archives)
    if metadata and metadata.json_first:
        entries = reader.parse_central_directory(json_only=True)
    else:
        entries = reader.parse_central_directory()
```

### API Endpoints

#### `GET /api/ozx-content/{path_name:path}?subpath={internal_path}`

Streams file content from within an OZX archive. Supports HTTP Range requests for efficient chunk access.

**Response Headers**:

- `Accept-Ranges: bytes`
- `Content-Length: {size}`
- `Content-Range: bytes {start}-{end}/{total}` (for 206 responses)

#### `HEAD /api/ozx-content/{path_name:path}?subpath={internal_path}`

Returns file metadata without content body.

#### `GET /api/ozx-metadata/{path_name:path}`

Returns OZX archive metadata:

```json
{
  "version": "0.5",
  "json_first": true,
  "file_count": 42,
  "is_zip64": false
}
```

#### `GET /api/ozx-list/{path_name:path}?prefix={optional_prefix}`

Lists files in the OZX archive:

```json
{
  "files": ["zarr.json", "0/zarr.json", "0/c/0/0/0", ...]
}
```

## Frontend Implementation Details

### Detection Utilities (`ozxDetection.ts`)

```typescript
// Check if a file is an OZX file
isOzxFile(file: FileOrFolder): boolean

// Check filename extension
isOzxFilename(filename: string): boolean

// Check if array contains OZX files
hasOzxFiles(files: FileOrFolder[]): boolean

// Filter to get only OZX files
getOzxFiles(files: FileOrFolder[]): FileOrFolder[]
```

### OzxFetchStore (`ozxQueries.ts`)

A zarrita-compatible store that reads from OZX archives via the API:

```typescript
class OzxFetchStore {
  constructor(fspName: string, ozxPath: string);

  // Get full file content
  async get(key: string): Promise<Uint8Array | undefined>;

  // Get byte range (for efficient chunk access)
  async getRange(
    key: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | undefined>;

  // Check if file exists
  async has(key: string): Promise<boolean>;

  // List files with optional prefix
  async list(prefix?: string): Promise<string[]>;
}
```

### Query Hooks

```typescript
// Fetch OZX archive metadata
useOzxMetadataQuery(fspName, ozxFilePath, enabled?)

// Fetch list of files in OZX
useOzxFileListQuery(fspName, ozxFilePath, prefix?, enabled?)

// Fetch Zarr v3 metadata from OZX file (RFC-9 requires Zarr v3)
useOzxZarrMetadataQuery({ fspName, ozxFile })
```

### Zarr Version Detection

```typescript
// Detects Zarr v3 in OZX archives (RFC-9 requires Zarr v3 only)
detectOzxZarrVersions(files: string[]): ('v3')[]
```

Note: Unlike regular Zarr directories which can be v2 or v3, OZX files per RFC-9 only support Zarr v3 (OME-Zarr v0.5). The detection function only looks for `zarr.json` files and ignores Zarr v2 markers (`.zarray`, `.zattrs`, `.zgroup`).

## Modular Architecture

The implementation separates generic ZIP functionality from OZX-specific features:

```
┌──────────────────────────────────────┐
│           OZXReader                   │
│  - OME metadata parsing              │
│  - jsonFirst optimization            │
│  - is_json_metadata_file()           │
├──────────────────────────────────────┤
│           ZipReader                   │
│  - EOCD/ZIP64 parsing                │
│  - Central directory parsing         │
│  - stop_condition & max_entries      │
│  - File streaming & range requests   │
│  - STORE/DEFLATE compression         │
└──────────────────────────────────────┘
```

**Benefits**:

1. **Reusability**: `ZipReader` can be used for any ZIP file, not just OZX
2. **Testability**: Each layer has focused unit tests
3. **Extensibility**: New ZIP-based formats can extend `ZipReader`
4. **Separation of Concerns**: Generic ZIP logic is decoupled from OME-specific features

## RFC-9 ZIP Comment Format

The OZX file's ZIP comment contains OME metadata:

```json
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
```

When `jsonFirst` is true, JSON metadata files (.json, .zattrs, .zarray, .zgroup) are sorted first in the central directory, allowing partial parsing for metadata discovery.

## Testing

### Backend Tests

```bash
# Run all ZIP/OZX tests
pixi run -e test pytest tests/test_zipread.py tests/test_ozxzip.py -v

# Run only generic ZIP tests
pixi run -e test pytest tests/test_zipread.py -v

# Run only OZX-specific tests
pixi run -e test pytest tests/test_ozxzip.py -v
```

#### Generic ZipReader Tests (`test_zipread.py`)

Tests cover:

- Basic reader operations (open, close, context manager)
- Central directory parsing
- `stop_condition` callback with index parameter
- `max_entries` limit parameter
- Combined `stop_condition` and `max_entries`
- File reading and streaming
- Range request streaming
- DEFLATE compression
- Edge cases (empty archive, unopened reader)

#### OZX-Specific Tests (`test_ozxzip.py`)

Tests cover:

- OZX file detection utilities
- OME metadata parsing (valid, missing, invalid JSON)
- jsonFirst optimization
- File reading (text, binary, compressed)
- Range request streaming
- Unicode filenames
- Edge cases

### Frontend Tests

```bash
pixi run test-frontend -- src/__tests__/unitTests/ozxDetection.test.ts
```

Tests cover:

- File detection (extension matching, directories)
- Array filtering functions
- Path handling
- Zarr version detection within OZX

## Usage Example

### Reading OZX in Frontend

```typescript
import { isOzxFile } from '@/utils/ozxDetection';
import { useOzxZarrMetadataQuery } from '@/queries/zarrQueries';

function ZarrViewer({ file, fspName }) {
  // Check if this is an OZX file
  if (isOzxFile(file)) {
    const { data, isLoading } = useOzxZarrMetadataQuery({
      fspName,
      ozxFile: file
    });

    if (data?.metadata) {
      // Use data.metadata for display
      // data.omeZarrUrl can be passed to viewers
      // data.store provides the OzxFetchStore for chunk access
    }
  }
}
```

### Direct API Access

```bash
# Get archive metadata
curl http://localhost:7878/api/ozx-metadata/myFSP/path/to/data.ozx

# List files
curl http://localhost:7878/api/ozx-list/myFSP/path/to/data.ozx

# Get file content
curl http://localhost:7878/api/ozx-content/myFSP/path/to/data.ozx?subpath=zarr.json

# Get range (for chunk access)
curl -H "Range: bytes=0-1023" \
  http://localhost:7878/api/ozx-content/myFSP/path/to/data.ozx?subpath=0/c/0/0/0
```

## Future Enhancements

1. **Write Support**: Currently read-only; could add ability to update OZX files
2. **Caching**: Add server-side caching of central directory for frequently accessed archives
3. **Thumbnail Generation**: Integrate with existing thumbnail generation for OZX OME-Zarr
4. **Neuroglancer Integration**: Generate Neuroglancer URLs pointing to OZX content

## Related Documentation

- [RFC-9 Specification](https://ngff.openmicroscopy.org/rfc/9/index.html)
- [OME-NGFF Specification](https://ngff.openmicroscopy.org/)
- [Zarr v3 Specification](https://zarr-specs.readthedocs.io/en/latest/v3/core/v3.0.html)
