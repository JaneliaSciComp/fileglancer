import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the external calls that `getOmeZarrMetadata` makes, so the real
// function runs end to end (same-module calls can't be intercepted by mocking
// '@/omezarr-helper' itself).
vi.mock('ome-zarr.js', async importOriginal => {
  const actual = await importOriginal<typeof import('ome-zarr.js')>();
  return { ...actual, getMultiscaleWithArray: vi.fn() };
});
vi.mock('zarrita', async importOriginal => {
  const actual = await importOriginal<typeof import('zarrita')>();
  return { ...actual, open: { v2: vi.fn(), v3: vi.fn() } };
});

import { getMultiscaleWithArray } from 'ome-zarr.js';
import { open } from 'zarrita';

import { getOmeZarrMetadata } from '@/omezarr-helper';

const multiscaleMock = getMultiscaleWithArray as unknown as ReturnType<
  typeof vi.fn
>;
const openV2 = open.v2 as unknown as ReturnType<typeof vi.fn>;
const openV3 = open.v3 as unknown as ReturnType<typeof vi.fn>;

const zyx = {
  arr: { shape: [10, 10, 10] },
  shapes: [[10, 10, 10]],
  multiscale: { axes: [{ name: 'z' }, { name: 'y' }, { name: 'x' }] },
  omero: undefined,
  scales: [[1, 1, 1]],
  zarr_version: 3
};

describe('getOmeZarrMetadata labels', () => {
  beforeEach(() => {
    multiscaleMock.mockReset().mockResolvedValue(zyx);
    openV2.mockReset();
    openV3.mockReset();
  });

  it('reads v3 labels from the labels group attributes', async () => {
    openV3.mockResolvedValue({
      attrs: { ome: { version: '0.5', labels: ['nuclei', 'mito'] } }
    });
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(openV3).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/labels' }),
      { kind: 'group' }
    );
    expect(openV2).not.toHaveBeenCalled();
    expect(metadata.labels).toEqual(['nuclei', 'mito']);
  });

  it('reads v2 labels from .zattrs', async () => {
    multiscaleMock.mockResolvedValue({ ...zyx, zarr_version: 2 });
    openV2.mockResolvedValue({ attrs: { labels: ['cells'] } });
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(openV3).not.toHaveBeenCalled();
    expect(metadata.labels).toEqual(['cells']);
  });

  it('leaves labels undefined when there is no labels group', async () => {
    openV3.mockRejectedValue(new Error('404'));
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(metadata.labels).toBeUndefined();
  });

  it('leaves labels undefined when the labels list is empty', async () => {
    openV3.mockResolvedValue({ attrs: { ome: { labels: [] } } });
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(metadata.labels).toBeUndefined();
  });
});
