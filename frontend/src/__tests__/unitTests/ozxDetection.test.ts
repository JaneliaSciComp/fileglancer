import { describe, it, expect } from 'vitest';
import {
  isOzxFile,
  isOzxFilename,
  hasOzxFiles,
  getOzxFiles,
  getZipFilePath
} from '@/utils/ozxDetection';
import { detectOzxZarrVersions } from '@/queries/zarrQueries';
import type { FileOrFolder } from '@/shared.types';

// Helper to create minimal FileOrFolder objects for testing
const createFile = (name: string, path?: string): FileOrFolder => ({
  name,
  path: path ?? `/${name}`,
  size: 1000,
  is_dir: false,
  permissions: 'rw-r--r--',
  owner: 'test',
  group: 'test',
  last_modified: Date.now()
});

const createDir = (name: string, path?: string): FileOrFolder => ({
  name,
  path: path ?? `/${name}`,
  size: 0,
  is_dir: true,
  permissions: 'rwxr-xr-x',
  owner: 'test',
  group: 'test',
  last_modified: Date.now()
});

describe('isOzxFile', () => {
  it('should return true for files with .ozx extension', () => {
    expect(isOzxFile(createFile('image.ozx'))).toBe(true);
    expect(isOzxFile(createFile('data.OZX'))).toBe(true);
    expect(isOzxFile(createFile('sample.Ozx'))).toBe(true);
  });

  it('should return false for non-ozx files', () => {
    expect(isOzxFile(createFile('image.zarr'))).toBe(false);
    expect(isOzxFile(createFile('data.zip'))).toBe(false);
    expect(isOzxFile(createFile('file.txt'))).toBe(false);
    expect(isOzxFile(createFile('ozx'))).toBe(false);
    expect(isOzxFile(createFile('.ozx'))).toBe(true); // Hidden file with .ozx extension
  });

  it('should return false for directories', () => {
    expect(isOzxFile(createDir('folder.ozx'))).toBe(false);
  });
});

describe('isOzxFilename', () => {
  it('should return true for filenames with .ozx extension', () => {
    expect(isOzxFilename('image.ozx')).toBe(true);
    expect(isOzxFilename('data.OZX')).toBe(true);
    expect(isOzxFilename('/path/to/file.ozx')).toBe(true);
  });

  it('should return false for non-ozx filenames', () => {
    expect(isOzxFilename('image.zarr')).toBe(false);
    expect(isOzxFilename('data.zip')).toBe(false);
  });
});

describe('hasOzxFiles', () => {
  it('should return true if any file is an OZX file', () => {
    const files = [
      createFile('image.zarr'),
      createFile('data.ozx'),
      createFile('text.txt')
    ];
    expect(hasOzxFiles(files)).toBe(true);
  });

  it('should return false if no OZX files exist', () => {
    const files = [
      createFile('image.zarr'),
      createFile('data.zip'),
      createFile('text.txt')
    ];
    expect(hasOzxFiles(files)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(hasOzxFiles([])).toBe(false);
  });
});

describe('getOzxFiles', () => {
  it('should return only OZX files', () => {
    const files = [
      createFile('image.zarr'),
      createFile('data1.ozx'),
      createFile('text.txt'),
      createFile('data2.ozx')
    ];
    const result = getOzxFiles(files);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('data1.ozx');
    expect(result[1].name).toBe('data2.ozx');
  });

  it('should return empty array if no OZX files', () => {
    const files = [createFile('image.zarr'), createFile('text.txt')];
    expect(getOzxFiles(files)).toEqual([]);
  });
});

describe('getZipFilePath', () => {
  it('should return path without leading slash', () => {
    const file = createFile('data.ozx', '/path/to/data.ozx');
    expect(getZipFilePath(file)).toBe('path/to/data.ozx');
  });

  it('should return path unchanged if no leading slash', () => {
    const file = createFile('data.ozx', 'path/to/data.ozx');
    expect(getZipFilePath(file)).toBe('path/to/data.ozx');
  });
});

describe('detectOzxZarrVersions', () => {
  // RFC-9 OZX is for OME-Zarr v0.5 which requires Zarr v3 only

  it('should detect zarr v3 when zarr.json exists at root', () => {
    const files = ['zarr.json', '0/zarr.json', '0/c/0/0/0'];
    expect(detectOzxZarrVersions(files)).toEqual(['v3']);
  });

  it('should NOT detect zarr v2 - RFC-9 requires Zarr v3', () => {
    // .zarray and .zattrs are Zarr v2 markers, not supported in RFC-9 OZX
    const files = ['.zarray', '.zattrs', '0/0'];
    expect(detectOzxZarrVersions(files)).toEqual([]);
  });

  it('should only detect v3 even when v2 markers also exist', () => {
    // RFC-9 OZX is Zarr v3 only, so v2 markers are ignored
    const files = ['zarr.json', '.zarray', '0/c/0/0/0'];
    expect(detectOzxZarrVersions(files)).toEqual(['v3']);
  });

  it('should return empty array when no zarr.json files', () => {
    const files = ['data.txt', 'image.png'];
    expect(detectOzxZarrVersions(files)).toEqual([]);
  });

  it('should return empty array for empty file list', () => {
    expect(detectOzxZarrVersions([])).toEqual([]);
  });

  it('should detect zarr.json from nested paths', () => {
    const files = ['folder/zarr.json', 'folder/.zattrs'];
    // Nested zarr.json is detected, .zattrs is ignored (v2 only)
    const result = detectOzxZarrVersions(files);
    expect(result).toEqual(['v3']);
  });

  it('should detect zarr.json from paths ending with /zarr.json', () => {
    const files = ['root/zarr.json', 'root/.zattrs'];
    // Only zarr.json is detected for RFC-9 OZX
    const result = detectOzxZarrVersions(files);
    expect(result).toEqual(['v3']);
  });
});
