import { describe, it, expect } from 'vitest';
import {
  generateNeuroglancerStateForOmeZarr,
  getNeuroglancerSource
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

describe('generateNeuroglancerStateForOmeZarr per-channel layers', () => {
  it('gives repeated channel labels unique layer names', () => {
    const multiscale = {
      axes: [
        { name: 'c', type: 'channel' },
        { name: 'y', type: 'space' },
        { name: 'x', type: 'space' }
      ],
      datasets: [
        {
          path: '0',
          coordinateTransformations: [{ type: 'scale', scale: [1, 1, 1] }]
        }
      ]
    };
    const omero = {
      channels: [{ label: 'Gpb5' }, { label: 'Pale' }, { label: 'Gpb5' }]
    };
    const encoded = generateNeuroglancerStateForOmeZarr(
      'https://example.com/data.zarr',
      3,
      'image',
      multiscale as any,
      { shape: [3, 10, 10], dtype: 'uint16' } as any,
      undefined,
      omero as any,
      true
    );
    const state = JSON.parse(decodeURIComponent(encoded!));
    expect(state.layers.map((l: any) => l.name)).toEqual([
      'Gpb5',
      'Pale',
      'Gpb5 (2)'
    ]);
  });
});
