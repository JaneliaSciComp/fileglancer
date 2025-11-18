import { describe, it, expect } from 'vitest';
import { detectZarrVersions } from '@/queries/zarrQueries';
import { FileOrFolder } from '@/shared.types';

// Helper to create minimal FileOrFolder objects for testing
const createFile = (name: string): FileOrFolder => ({
  name,
  path: `/${name}`,
  size: 0,
  is_dir: false,
  permissions: 'rw-r--r--',
  owner: 'test',
  group: 'test',
  last_modified: Date.now()
});

describe('detectZarrVersions', () => {
  it('should detect only zarr v3 when only zarr.json exists', () => {
    const files = [createFile('zarr.json'), createFile('arrays/data/chunk_key_1')];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v3']);
  });

  it('should detect only zarr v2 when only .zarray exists', () => {
    const files = [createFile('.zarray'), createFile('.zattrs')];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2']);
  });

  it('should detect both versions when both zarr.json and .zarray exist', () => {
    const files = [
      createFile('zarr.json'),
      createFile('.zarray'),
      createFile('.zattrs'),
      createFile('arrays/data/chunk_key_1')
    ];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2', 'v3']);
  });

  it('should return empty array when neither version files exist', () => {
    const files = [createFile('file.txt'), createFile('other.json')];
    const result = detectZarrVersions(files);
    expect(result).toEqual([]);
  });
});
