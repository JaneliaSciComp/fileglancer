import { describe, it, expect, vi, beforeEach } from 'vitest';

// `getOmeZarrChannels` calls `getOmeZarrMetadata`, which is defined in the
// same module and can't be intercepted by mocking '@/omezarr-helper' itself
// (same-module function calls resolve to local bindings, not the mocked
// export). Instead, mock the external `ome-zarr.js` dependency that
// `getOmeZarrMetadata` uses to fetch metadata, so the real
// getOmeZarrMetadata -> getOmeZarrChannels pipeline runs end to end.
vi.mock('ome-zarr.js', async importOriginal => {
  const actual = await importOriginal<typeof import('ome-zarr.js')>();
  return { ...actual, NgffImage: { load: vi.fn() } };
});

import { NgffImage } from 'ome-zarr.js';

import { getOmeZarrChannels } from '@/omezarr-helper';

const asMock = NgffImage.load as unknown as ReturnType<typeof vi.fn>;
// Build the `NgffImage` that `NgffImage.load` resolves to from a flat fixture
// { arr, shapes, multiscale, omero, scales, zarr_version }. `omero` lands on
// `imgAttrs`, the dataset's own attrs, which is where the helper reads it.
const asImage = (f: {
  arr: unknown;
  shapes: number[][];
  multiscale: unknown;
  omero: unknown;
  scales: number[][];
  zarr_version: number;
}) => ({
  openArray: vi.fn().mockResolvedValue(f.arr),
  calcShapes: vi.fn().mockResolvedValue(f.shapes),
  multiscales: [f.multiscale],
  imgAttrs: { omero: f.omero },
  scales: f.scales,
  zarr_version: f.zarr_version
});

const withOmero = {
  arr: { shape: [2, 10, 10] },
  shapes: [[2, 10, 10]],
  multiscale: { axes: [{ name: 'c' }, { name: 'y' }, { name: 'x' }] },
  omero: { channels: [{ label: 'DAPI' }, { label: 'GFP' }] },
  scales: [[1, 1, 1]],
  zarr_version: 2
};
const cAxisNoOmero = {
  arr: { shape: [3, 10, 10] },
  shapes: [[3, 10, 10]],
  multiscale: { axes: [{ name: 'c' }, { name: 'y' }, { name: 'x' }] },
  omero: undefined,
  scales: [[1, 1, 1]],
  zarr_version: 2
};
const noChannelAxis = {
  arr: { shape: [10, 10] },
  shapes: [[10, 10]],
  multiscale: { axes: [{ name: 'y' }, { name: 'x' }] },
  omero: undefined,
  scales: [[1, 1]],
  zarr_version: 2
};

describe('getOmeZarrChannels', () => {
  beforeEach(() => asMock.mockReset());

  it('reads omero channel labels', async () => {
    asMock.mockResolvedValue(asImage(withOmero));
    expect(await getOmeZarrChannels('u')).toEqual(['DAPI', 'GFP']);
  });
  it('synthesizes channel names from the c-axis length when omero is absent', async () => {
    asMock.mockResolvedValue(asImage(cAxisNoOmero));
    expect(await getOmeZarrChannels('u')).toEqual([
      'Channel 0',
      'Channel 1',
      'Channel 2'
    ]);
  });
  it('returns [] when there is no channel axis', async () => {
    asMock.mockResolvedValue(asImage(noChannelAxis));
    expect(await getOmeZarrChannels('u')).toEqual([]);
  });
});
