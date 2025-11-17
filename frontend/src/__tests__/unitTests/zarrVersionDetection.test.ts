import { describe, it, expect } from 'vitest';
import { detectZarrVersions } from '@/queries/zarrQueries';

describe('detectZarrVersions', () => {
  it('should detect only zarr v3 when only zarr.json exists', () => {
    const files = ['zarr.json', '0/0'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v3']);
  });

  it('should detect only zarr v2 when only .zattrs exists', () => {
    const files = ['.zgroup', '.zattrs', '0/.zarray', '0/0'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2']);
  });

  it('should detect only zarr v2 when only .zarray exists', () => {
    const files = ['.zgroup', '.zarray', '0/0'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2']);
  });

  it('should detect only zarr v2 when only .zattrs and .zarray exists', () => {
    const files = ['.zattrs', '.zarray', '0'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2']);
  });

  it('should detect both versions when both zarr.json, .zarray, and .zattrs exist', () => {
    const files = ['zarr.json', '.zarray', '.zattrs', '0/0'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2', 'v3']);
  });

  it('should return empty array when neither version files exist', () => {
    const files = ['file.txt', 'other.json'];
    const result = detectZarrVersions(files);
    expect(result).toEqual([]);
  });
});
