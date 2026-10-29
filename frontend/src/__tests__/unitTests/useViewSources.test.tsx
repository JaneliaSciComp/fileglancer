import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { makeFakeBridge } from '@/__tests__/mocks/fakeNeuroglancer';
import {
  channelRows,
  groupLayersBySource,
  useViewSources
} from '@/hooks/useViewSources';
import { dataLinkSegment } from '@/utils/viewCheckout';
import type { ViewLayer } from '@/queries/viewQueries';
import type { ResolvedCheckoutDataset } from '@/utils/viewCheckout';

const BUCKET_URL = 'https://idr.s3.amazonaws.com';
vi.mock('@/queries/zoneAndFileSharePathMapQuery', () => ({
  default: () => ({
    data: {
      fsp_f: { name: 'f', protocol: 'file', mount_path: '/mnt/f' },
      fsp_idr: { name: 'idr', protocol: 's3', mount_path: BUCKET_URL }
    }
  })
}));

const ds = (key: string, path: string) => ({
  fsp_name: 'f',
  path,
  sharing_key: key,
  segment: dataLinkSegment(key, path.split('/').pop()!)
});
const layer = (name: string, key: string, prefix: string) => ({
  name,
  source: `http://x/files/${key}/${prefix}|zarr2:`
});

const row = (
  key: string | null,
  path: string,
  extra: Partial<ViewLayer> = {}
): ViewLayer => ({
  layer_index: 0,
  data_link_id: 1,
  channel: null,
  opts: null,
  broken: false,
  fsp_name: 'f',
  path,
  sharing_key: key,
  url_prefix: key === null ? null : path.split('/').pop()!,
  ...extra
});

/** A Data Link dataset added this session (ResolvedCheckoutDataset shape). */
const added = (key: string, path: string) => ({
  fsp_name: 'f',
  path,
  sharing_key: key,
  url_prefix: path.split('/').pop()!
});

describe('channelRows', () => {
  const channelLayer = (name: string, index: number) => ({
    ...layer(name, 'K1', 'a.zarr'),
    localPosition: [index]
  });

  it('lists every channel of a per-channel dataset, linked to its layer', () => {
    const [source] = groupLayersBySource(
      [channelLayer('Gpb5 (2)', 2), channelLayer('DAPI', 0)],
      [ds('K1', 'data/a.zarr')],
      []
    );
    expect(channelRows(source, ['DAPI', 'Gpb5', 'Gpb5'])).toEqual([
      { key: 'channel:0', label: 'DAPI', layerName: 'DAPI' },
      { key: 'channel:1', label: 'Gpb5', layerName: undefined },
      { key: 'channel:2', label: 'Gpb5', layerName: 'Gpb5 (2)' }
    ]);
  });

  it('falls back to the layer names when a layer is not one channel', () => {
    const [source] = groupLayersBySource(
      [layer('a DAPI', 'K1', 'a.zarr'), layer('a GFP', 'K1', 'a.zarr')],
      [ds('K1', 'data/a.zarr')],
      []
    );
    expect(channelRows(source, ['DAPI', 'GFP'])?.map(r => r.label)).toEqual([
      'a DAPI',
      'a GFP'
    ]);
  });
});

describe('groupLayersBySource', () => {
  it('groups per-channel layers into their dataset, in first-layer order', () => {
    const sources = groupLayersBySource(
      [
        layer('b', 'K2', 'b.zarr'),
        layer('a DAPI', 'K1', 'a.zarr'),
        layer('a GFP', 'K1', 'a.zarr')
      ],
      [ds('K1', 'data/a.zarr'), ds('K2', 'data/b.zarr')],
      []
    );
    expect(sources.map(s => [s.label, s.layerNames])).toEqual([
      ['b.zarr', ['b']],
      ['a.zarr', ['a DAPI', 'a GFP']]
    ]);
  });

  it("doesn't match a Data Link whose prefix only starts the same", () => {
    const [source] = groupLayersBySource(
      [layer('img2', 'K1', 'img.zarr2')],
      [ds('K1', 'data/img.zarr')],
      []
    );
    expect(source).toMatchObject({ fsp_name: null, label: 'img2' });
  });

  it('lists a layer from outside Fileglancer on its own', () => {
    const sources = groupLayersBySource(
      [{ name: 'ext', source: 'precomputed://gs://bucket/x' }],
      [],
      []
    );
    expect(sources).toEqual([
      expect.objectContaining({
        key: 'layer:ext',
        fsp_name: null,
        layerNames: ['ext']
      })
    ]);
  });

  it('appends unsupported datasets, which have no layers', () => {
    const sources = groupLayersBySource(
      [layer('a', 'K1', 'a.zarr')],
      [ds('K1', 'data/a.zarr')],
      [ds('K9', 'data/notes')]
    );
    expect(sources.map(s => [s.label, s.unsupported, s.layerNames])).toEqual([
      ['a.zarr', false, ['a']],
      ['notes', true, []]
    ]);
  });
});

describe('useViewSources', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (opts: {
    layers: unknown[];
    viewLayers?: ViewLayer[];
    added?: ResolvedCheckoutDataset[];
    pendingSources?: string[];
    removedSources?: string[];
  }) => {
    const fake = makeFakeBridge({ layers: opts.layers });
    const hook = renderHook(() =>
      useViewSources(fake.bridge, {
        viewLayers: opts.viewLayers ?? [],
        added: opts.added ?? [],
        pendingSources: opts.pendingSources ?? [],
        removedSources: opts.removedSources ?? []
      })
    );
    return { fake, ...hook };
  };

  it('maps layers through saved rows and datasets added this session', () => {
    const { result } = setup({
      layers: [layer('a', 'K1', 'a.zarr'), layer('b', 'K2', 'b.zarr')],
      viewLayers: [row('K1', 'data/a.zarr')],
      added: [{ ...added('K2', 'data/b.zarr'), label: 'b', url: '' }]
    });
    expect(result.current.map(s => s.path)).toEqual([
      'data/a.zarr',
      'data/b.zarr'
    ]);
  });

  it('maps bucket layers, saved or added this session, by their public URL', () => {
    const url = `${BUCKET_URL}/zarr/my%20img.zarr`;
    const { result } = setup({
      layers: [
        { name: 'img', source: `zarr://${url}|zarr2:` },
        { name: 'new', source: `zarr://${BUCKET_URL}/zarr/new.zarr/` },
        { name: 'other', source: `zarr://${BUCKET_URL}/zarr/my%20img.zarr2` }
      ],
      viewLayers: [
        row(null, 'zarr/my img.zarr', { fsp_name: 'idr', data_link_id: null })
      ],
      added: [
        {
          fsp_name: 'idr',
          path: 'zarr/new.zarr',
          sharing_key: null,
          url_prefix: '',
          url: `${BUCKET_URL}/zarr/new.zarr`,
          label: 'new'
        }
      ]
    });
    expect(result.current.map(s => [s.fsp_name, s.path, s.label])).toEqual([
      ['idr', 'zarr/my img.zarr', 'my img.zarr'],
      ['idr', 'zarr/new.zarr', 'new.zarr'],
      [null, null, 'other']
    ]);
  });

  it('follows layers removed in Neuroglancer', () => {
    vi.useFakeTimers();
    const { fake, result } = setup({
      layers: [layer('a', 'K1', 'a.zarr'), layer('b', 'K2', 'b.zarr')],
      viewLayers: [row('K1', 'data/a.zarr'), row('K2', 'data/b.zarr')]
    });
    expect(result.current).toHaveLength(2);
    act(() => {
      fake.change({ layers: [layer('b', 'K2', 'b.zarr')] });
      vi.advanceTimersByTime(300);
    });
    expect(result.current.map(s => s.label)).toEqual(['b.zarr']);
  });

  it('keeps the rows when only the camera moves', () => {
    vi.useFakeTimers();
    const layers = [layer('a', 'K1', 'a.zarr')];
    const { fake, result } = setup({
      layers,
      viewLayers: [row('K1', 'data/a.zarr')]
    });
    const before = result.current;
    act(() => {
      fake.change({ layers, position: [1, 2, 3] });
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(before);
  });

  it('lists pending unsupported sources and hides removed saved ones', () => {
    const { result } = setup({
      layers: [],
      viewLayers: [
        row('K8', 'data/old', { opts: { unsupported: true } }),
        row('K7', 'data/kept', { opts: { unsupported: true } })
      ],
      added: [{ ...added('K9', 'data/new'), label: 'new', url: '' }],
      pendingSources: ['K9'],
      removedSources: ['K8']
    });
    expect(result.current.map(s => [s.label, s.unsupported])).toEqual([
      ['kept', true],
      ['new', true]
    ]);
  });
});
