import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { makeFakeBridge } from '@/__tests__/mocks/fakeNeuroglancer';
import type { CartItem } from '@/contexts/CartContext';
import type { ViewLayer } from '@/queries/viewQueries';

const resolveCartDatasets = vi.hoisted(() => vi.fn());
const buildViewState = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({ resolveCartDatasets })
}));
vi.mock('@/utils/viewCheckout', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/viewCheckout')>()),
  buildViewState
}));

import { useAddToView } from '@/hooks/useAddToView';

const ok: CartItem = { fsp_name: 'f', path: '/ok.zarr', label: 'ok' };
const nope: CartItem = { fsp_name: 'f', path: '/nope', label: 'nope' };
const resolvedOf = (item: CartItem, key: string) => ({
  ...item,
  url: `http://x/${key}`,
  sharing_key: key,
  url_prefix: item.path.split('/').pop()
});

beforeEach(() => {
  resolveCartDatasets.mockReset();
  buildViewState.mockReset();
});

function setup(
  state: Record<string, unknown> = { layout: 'xy', layers: [{ name: 'old' }] },
  viewLayers: ViewLayer[] = []
) {
  const fake = makeFakeBridge(state);
  const onEdited = vi.fn();
  const onAddSources = vi.fn();
  const onAdded = vi.fn();
  const { result } = renderHook(() =>
    useAddToView(fake.bridge, { viewLayers, onEdited, onAddSources, onAdded })
  );
  return { fake, onEdited, onAddSources, onAdded, addToView: result.current };
}

describe('useAddToView', () => {
  it('appends the new layers, marks the View edited, and reports the datasets', async () => {
    resolveCartDatasets.mockResolvedValue([resolvedOf(ok, 'k1')]);
    buildViewState.mockResolvedValue({
      ng_state: { layers: [{ name: 'old' }], layout: '4panel' },
      layers: [{ sharing_key: 'k1', layer_index: 0, channel: null, opts: null }]
    });
    const { fake, onEdited, onAdded, addToView } = setup();
    await addToView([ok]);
    expect(fake.bridge.getState()).toEqual({
      layout: 'xy',
      layers: [{ name: 'old' }, { name: 'old (2)', archived: false }]
    });
    expect(onEdited).toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledWith([resolvedOf(ok, 'k1')]);
  });

  it('records unsupported datasets as sources', async () => {
    resolveCartDatasets.mockResolvedValue([
      resolvedOf(ok, 'k1'),
      resolvedOf(nope, 'k2')
    ]);
    buildViewState.mockResolvedValue({
      ng_state: { layers: [{ name: 'ok' }] },
      layers: [
        { sharing_key: 'k1', layer_index: 0, channel: null, opts: null },
        {
          sharing_key: 'k2',
          layer_index: 1,
          channel: null,
          opts: { unsupported: true }
        }
      ]
    });
    const { onAddSources, addToView } = setup();
    await addToView([ok, nope]);
    expect(onAddSources).toHaveBeenCalledWith(['k2']);
  });

  it('leaves the viewer state alone when no dataset loads', async () => {
    resolveCartDatasets.mockResolvedValue([resolvedOf(nope, 'k2')]);
    buildViewState.mockResolvedValue({
      ng_state: { layers: [] },
      layers: [
        {
          sharing_key: 'k2',
          layer_index: 0,
          channel: null,
          opts: { unsupported: true }
        }
      ]
    });
    const { fake, onEdited, onAddSources, addToView } = setup();
    const setState = vi.spyOn(fake.bridge, 'setState');
    await addToView([nope]);
    expect(setState).not.toHaveBeenCalled();
    expect(onEdited).not.toHaveBeenCalled();
    expect(onAddSources).toHaveBeenCalledWith(['k2']);
  });

  it("points the View's broken layer on the added dataset at its new Data Link", async () => {
    // The dataset's old link was deleted; adding it creates link k1, which
    // relinks this View server-side. The local state must match, or Save
    // would re-break the old layer.
    const brokenRow: ViewLayer = {
      layer_index: 0,
      data_link_id: null,
      channel: null,
      opts: null,
      broken: true,
      fsp_name: 'f',
      path: '/ok.zarr',
      sharing_key: 'DEAD',
      url_prefix: 'ok.zarr'
    };
    resolveCartDatasets.mockResolvedValue([resolvedOf(ok, 'k1')]);
    buildViewState.mockResolvedValue({
      ng_state: {
        layers: [{ name: 'ok.zarr', source: 'http://x/k1/ok.zarr' }]
      },
      layers: [{ sharing_key: 'k1', layer_index: 0, channel: null, opts: null }]
    });
    const { fake, onEdited, addToView } = setup(
      { layers: [{ name: 'ok.zarr', source: 'http://x/DEAD/ok.zarr|zarr2:' }] },
      [brokenRow]
    );
    await addToView([ok]);
    expect(fake.bridge.getState().layers).toEqual([
      { name: 'ok.zarr', source: 'http://x/k1/ok.zarr|zarr2:' },
      {
        name: 'ok.zarr (2)',
        source: 'http://x/k1/ok.zarr',
        archived: false
      }
    ]);
    expect(onEdited).toHaveBeenCalled();
  });

  it('changes nothing when a Data Link cannot be created', async () => {
    resolveCartDatasets.mockRejectedValue(new Error('link failed'));
    const { fake, onAdded, addToView } = setup();
    const setState = vi.spyOn(fake.bridge, 'setState');
    await expect(addToView([ok])).rejects.toThrow('link failed');
    expect(setState).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('changes nothing when the sidebar unmounts mid-add (NG reloaded)', async () => {
    let resolve!: (v: unknown) => void;
    resolveCartDatasets.mockReturnValue(new Promise(r => (resolve = r)));
    buildViewState.mockResolvedValue({
      ng_state: { layers: [{ name: 'ok' }] },
      layers: [{ sharing_key: 'k1', layer_index: 0, channel: null, opts: null }]
    });
    const fake = makeFakeBridge({ layers: [{ name: 'old' }] });
    const setState = vi.spyOn(fake.bridge, 'setState');
    const onEdited = vi.fn();
    const onAddSources = vi.fn();
    const onAdded = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAddToView(fake.bridge, {
        viewLayers: [],
        onEdited,
        onAddSources,
        onAdded
      })
    );
    const pending = result.current([ok]);
    unmount();
    resolve([resolvedOf(ok, 'k1')]);
    await expect(pending).rejects.toThrow('Nothing was added');
    expect(setState).not.toHaveBeenCalled();
    expect(onEdited).not.toHaveBeenCalled();
    expect(onAddSources).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
