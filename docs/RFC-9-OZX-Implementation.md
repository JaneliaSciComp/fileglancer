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
│  │ /api/ozx-content/    │───▶│ OZXReader (ozxzip.py)       │   │
│  │ /api/ozx-metadata/   │    │ - ZIP64 support             │   │
│  │ /api/ozx-list/       │    │ - Partial CD parsing        │   │
│  └──────────────────────┘    │ - Range request streaming   │   │
│                              └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### Backend (Python)

| File                    | Action     | Description                              |
| ----------------------- | ---------- | ---------------------------------------- |
| `fileglancer/ozxzip.py` | **CREATE** | RFC-9 ZIP reader with partial CD parsing |
| `fileglancer/app.py`    | MODIFY     | Add `/api/ozx-*` endpoints               |
| `fileglancer/model.py`  | MODIFY     | Add OZX Pydantic models                  |
| `tests/test_ozxzip.py`  | **CREATE** | Unit tests for OZXReader (31 tests)      |

### Frontend (TypeScript)

| File                                                    | Action     | Description                            |
| ------------------------------------------------------- | ---------- | -------------------------------------- |
| `frontend/src/utils/ozxDetection.ts`                    | **CREATE** | `.ozx` file detection utilities        |
| `frontend/src/queries/ozxQueries.ts`                    | **CREATE** | TanStack Query hooks and OzxFetchStore |
| `frontend/src/queries/zarrQueries.ts`                   | MODIFY     | OZX detection integration              |
| `frontend/src/__tests__/unitTests/ozxDetection.test.ts` | **CREATE** | Frontend detection tests (20 tests)    |

## Backend Implementation Details

### OZXReader (`fileglancer/ozxzip.py`)

The core ZIP reader implements:

1. **EOCD Parsing**: Locates End of Central Directory record by scanning backwards from file end
2. **ZIP64 Support**: Handles large archives with ZIP64 extended fields
3. **OME Metadata**: Parses ZIP comment for RFC-9 OME metadata JSON
4. **jsonFirst Optimization**: When `jsonFirst=true` in metadata, stops parsing central directory after last JSON file
5. **Compression**: Supports STORE (uncompressed) and DEFLATE compression methods
6. **Range Streaming**: Efficient byte-range streaming for HTTP Range requests

Key classes:

- `OZXReader`: Main reader class with context manager support
- `OZXMetadata`: Parsed OME metadata from ZIP comment
- `ZipEntry`: Individual file entry from central directory

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
pixi run -e test pytest tests/test_ozxzip.py -v
```

Tests cover:

- Basic reader operations (open, close, context manager)
- Metadata parsing (valid, missing, invalid JSON)
- Central directory parsing and jsonFirst optimization
- File reading (text, binary, compressed)
- Range request streaming
- ZIP64 handling
- Unicode filenames
- Edge cases (empty archive, unopened reader)

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
