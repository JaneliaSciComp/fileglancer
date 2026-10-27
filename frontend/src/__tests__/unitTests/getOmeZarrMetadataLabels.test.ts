import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the external `ome-zarr.js` calls that `getOmeZarrMetadata` makes, so
// the real function runs end to end (same-module calls can't be intercepted
// by mocking '@/omezarr-helper' itself).
vi.mock('ome-zarr.js', async importOriginal => {
  const actual = await importOriginal<typeof import('ome-zarr.js')>();
  return {
    ...actual,
    getMultiscaleWithArray: vi.fn(),
    openGroup: vi.fn()
  };
});

import { getMultiscaleWithArray, openGroup } from 'ome-zarr.js';

import { getOmeZarrMetadata } from '@/omezarr-helper';

const multiscaleMock = getMultiscaleWithArray as unknown as ReturnType<
  typeof vi.fn
>;
const openGroupMock = openGroup as unknown as ReturnType<typeof vi.fn>;

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
    openGroupMock.mockReset();
  });

  it('reads v3 labels from the labels group attributes', async () => {
    openGroupMock.mockResolvedValue({
      attrs: { ome: { version: '0.5', labels: ['nuclei', 'mito'] } }
    });
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(openGroupMock).toHaveBeenCalledWith(expect.anything(), 'labels', 3);
    expect(metadata.labels).toEqual(['nuclei', 'mito']);
  });

  it('reads v2 labels from .zattrs', async () => {
    multiscaleMock.mockResolvedValue({ ...zyx, zarr_version: 2 });
    openGroupMock.mockResolvedValue({ attrs: { labels: ['cells'] } });
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(metadata.labels).toEqual(['cells']);
  });

  it('leaves labels undefined when there is no labels group', async () => {
    openGroupMock.mockRejectedValue(new Error('404'));
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(metadata.labels).toBeUndefined();
  });

  it('leaves labels undefined when the labels list is empty', async () => {
    openGroupMock.mockResolvedValue({ attrs: { ome: { labels: [] } } });
    const metadata = await getOmeZarrMetadata('https://example.com/a.zarr');
    expect(metadata.labels).toBeUndefined();
  });
});
