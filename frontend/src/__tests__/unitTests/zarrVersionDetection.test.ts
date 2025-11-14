import { describe, it, expect } from 'vitest';
import { detectZarrVersions } from '@/queries/zarrQueries';

describe('detectZarrVersions', () => {
  it('should detect only zarr v3 when only zarr.json exists', () => {
    const files = ['zarr.json', 'arrays/data/chunk_key_1'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v3']);
  });

  it('should detect only zarr v2 when only .zarray exists', () => {
    const files = ['.zarray', '.zattrs'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2']);
  });

  it('should detect both versions when both zarr.json and .zarray exist', () => {
    const files = ['zarr.json', '.zarray', '.zattrs', 'arrays/data/chunk_key_1'];
    const result = detectZarrVersions(files);
    expect(result).toEqual(['v2', 'v3']);
  });

  it('should return empty array when neither version files exist', () => {
    const files = ['file.txt', 'other.json'];
    const result = detectZarrVersions(files);
    expect(result).toEqual([]);
  });
});
