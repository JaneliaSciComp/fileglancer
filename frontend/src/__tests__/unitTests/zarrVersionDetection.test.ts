import { describe, it, expect } from 'vitest';
import {
  areZarrMetadataFilesPresent,
  getOmeNgffVersion,
  getEffectiveZarrStorageVersion
} from '@/queries/zarrQueries';
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

describe('areZarrMetadataFilesPresent', () => {
  it('should return true when zarr.json exists', () => {
    const files = [createFile('zarr.json'), createFile('arrays/data/chunk_key_1')];
    expect(areZarrMetadataFilesPresent(files)).toBe(true);
  });

  it('should return true when .zarray exists', () => {
    const files = [createFile('.zarray'), createFile('.zattrs')];
    expect(areZarrMetadataFilesPresent(files)).toBe(true);
  });

  it('should return true when .zattrs exists', () => {
    const files = [createFile('.zattrs')];
    expect(areZarrMetadataFilesPresent(files)).toBe(true);
  });

  it('should return true when both zarr.json and .zarray exist', () => {
    const files = [
      createFile('zarr.json'),
      createFile('.zarray'),
      createFile('.zattrs'),
      createFile('arrays/data/chunk_key_1')
    ];
    expect(areZarrMetadataFilesPresent(files)).toBe(true);
  });

  it('should return false when no zarr metadata files exist', () => {
    const files = [createFile('file.txt'), createFile('other.json')];
    expect(areZarrMetadataFilesPresent(files)).toBe(false);
  });

  it('should return false for empty file list', () => {
    expect(areZarrMetadataFilesPresent([])).toBe(false);
  });
});

describe('getOmeNgffVersion', () => {
  it('should return version from attributes.ome.version', () => {
    const data = { attributes: { ome: { version: '0.5' } } };
    expect(getOmeNgffVersion(data)).toBe('0.5');
  });

  it('should return version from ome.version', () => {
    const data = { ome: { version: '0.5' } };
    expect(getOmeNgffVersion(data)).toBe('0.5');
  });

  it('should return version from top-level version', () => {
    const data = { version: '0.3' };
    expect(getOmeNgffVersion(data)).toBe('0.3');
  });

  it('should return version from multiscales[0].version', () => {
    const data = { multiscales: [{ version: '0.4' }] };
    expect(getOmeNgffVersion(data)).toBe('0.4');
  });

  it('should return version from plate.version', () => {
    const data = { plate: { version: '0.4' } };
    expect(getOmeNgffVersion(data)).toBe('0.4');
  });

  it('should return version from well.version', () => {
    const data = { well: { version: '0.4' } };
    expect(getOmeNgffVersion(data)).toBe('0.4');
  });

  it('should return 0.4 when no version is found anywhere', () => {
    const data = { someOtherField: 'value' };
    expect(getOmeNgffVersion(data)).toBe('0.4');
  });

  it('should strip pre-release suffix from version', () => {
    const data = { attributes: { ome: { version: '0.5-dev2' } } };
    expect(getOmeNgffVersion(data)).toBe('0.5');
  });

  it('should return 0.4 when attributes.ome exists but has no version', () => {
    const data = { attributes: { ome: { multiscales: [] } } };
    expect(getOmeNgffVersion(data)).toBe('0.4');
  });
});

describe('getEffectiveZarrStorageVersion', () => {
  it('should return 3 when only v3 is available', () => {
    expect(getEffectiveZarrStorageVersion([3])).toBe(3);
  });

  it('should return 2 when only v2 is available', () => {
    expect(getEffectiveZarrStorageVersion([2])).toBe(2);
  });

  it('should prefer v3 when both v2 and v3 are available', () => {
    expect(getEffectiveZarrStorageVersion([2, 3])).toBe(3);
  });

  it('should return 2 when no versions are available', () => {
    expect(getEffectiveZarrStorageVersion([])).toBe(2);
  });
});
