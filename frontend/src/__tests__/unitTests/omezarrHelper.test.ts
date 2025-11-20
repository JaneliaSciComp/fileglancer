import { describe, it, expect } from 'vitest';
import { getNeuroglancerSource } from '@/omezarr-helper';

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
