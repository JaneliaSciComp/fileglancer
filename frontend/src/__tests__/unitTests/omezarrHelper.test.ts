import { describe, it, expect } from 'vitest';
import {
  getNeuroglancerSource,
  toNeuroglancerDimension,
  translateUnitToNeuroglancer
} from '@/omezarr-helper';

describe('getNeuroglancerSource with version selection', () => {
  it('should generate v3 source URL when v3 is selected', () => {
    const url = 'https://example.com/data.zarr';
    const source = getNeuroglancerSource(url, 3);
    expect(source).toBe('https://example.com/data.zarr/|zarr3:');
  });

  it('should generate v2 source URL when v2 is selected', () => {
    const url = 'https://example.com/data.zarr';
    const source = getNeuroglancerSource(url, 2);
    expect(source).toBe('https://example.com/data.zarr/|zarr2:');
  });

  it('should handle URLs without trailing slash', () => {
    const url = 'https://example.com/data.zarr';
    const source = getNeuroglancerSource(url, 3);
    expect(source).toMatch(/\/\|zarr3:$/);
  });

  it('should handle URLs with trailing slash', () => {
    const url = 'https://example.com/data.zarr/';
    const source = getNeuroglancerSource(url, 3);
    expect(source).toMatch(/\/\|zarr3:$/);
    expect(source).not.toContain('//|zarr3:');
  });

  it('should preserve the base URL', () => {
    const url = 'https://different.host/some/deep/path/data.zarr';
    const source = getNeuroglancerSource(url, 2);
    expect(source).toBe(
      'https://different.host/some/deep/path/data.zarr/|zarr2:'
    );
  });
});

describe('toNeuroglancerDimension', () => {
  it('rescales non-SI units to an SI base unit', () => {
    expect(toNeuroglancerDimension(5, 'minute')).toEqual([300, 's']);
    expect(toNeuroglancerDimension(2, 'hour')).toEqual([7200, 's']);
    expect(toNeuroglancerDimension(1, 'day')).toEqual([86400, 's']);
    expect(toNeuroglancerDimension(4, 'angstrom')).toEqual([4e-10, 'm']);
    expect(toNeuroglancerDimension(2, 'foot')).toEqual([0.6096, 'm']);
  });

  it('renames SI-prefixed units without changing the scale', () => {
    expect(toNeuroglancerDimension(0.292, 'micrometer')).toEqual([0.292, 'um']);
    expect(toNeuroglancerDimension(3, 'picometer')).toEqual([3, 'pm']);
    expect(toNeuroglancerDimension(5, 'second')).toEqual([5, 's']);
  });

  it('passes unknown units through', () => {
    expect(toNeuroglancerDimension(1, 'pixel')).toEqual([1, 'pixel']);
  });
});

describe('translateUnitToNeuroglancer', () => {
  it('keeps units that need a rescale unchanged', () => {
    expect(translateUnitToNeuroglancer('minute')).toBe('minute');
    expect(translateUnitToNeuroglancer('angstrom')).toBe('angstrom');
    expect(translateUnitToNeuroglancer('picometer')).toBe('pm');
  });
});
