import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { makeFakeBridge } from '@/__tests__/mocks/fakeNeuroglancer';
import type { CartItem } from '@/contexts/CartContext';

const resolveCartDatasets = vi.hoisted(() => vi.fn());
const removeManyFromCart = vi.hoisted(() => vi.fn());
const buildViewState = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({ resolveCartDatasets })
}));
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({ removeManyFromCart })
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
  sharing_key: key
});

beforeEach(() => {
  resolveCartDatasets.mockReset();
  removeManyFromCart.mockReset().mockResolvedValue(undefined);
  buildViewState.mockReset();
});

function setup() {
  const fake = makeFakeBridge({ layout: 'xy', layers: [{ name: 'old' }] });
  const onEdited = vi.fn();
  const onAddSources = vi.fn();
  const { result } = renderHook(() =>
    useAddToView(fake.bridge, onEdited, onAddSources)
  );
  return { fake, onEdited, onAddSources, addToView: result.current };
}

describe('useAddToView', () => {
  it('appends the new layers, marks the View edited, and empties the cart of them', async () => {
    resolveCartDatasets.mockResolvedValue([resolvedOf(ok, 'k1')]);
    buildViewState.mockResolvedValue({
      ng_state: { layers: [{ name: 'old' }], layout: '4panel' },
      layers: [{ sharing_key: 'k1', layer_index: 0, channel: null, opts: null }]
    });
    const { fake, onEdited, addToView } = setup();
    await addToView([ok]);
    expect(fake.bridge.getState()).toEqual({
      layout: 'xy',
      layers: [{ name: 'old' }, { name: 'old (2)', archived: false }]
    });
    expect(onEdited).toHaveBeenCalled();
    expect(removeManyFromCart).toHaveBeenCalledWith([
      { path: '/ok.zarr', channel: undefined }
    ]);
  });

  it('records unsupported datasets as sources and empties the cart of them', async () => {
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
    expect(removeManyFromCart).toHaveBeenCalledWith([
      { path: '/ok.zarr', channel: undefined },
      { path: '/nope', channel: undefined }
    ]);
  });

  it('removes a shadowed base entry along with its channel entry', async () => {
    const base: CartItem = { fsp_name: 'f', path: '/ok.zarr', label: 'ok' };
    const dapi: CartItem = {
      ...base,
      label: 'DAPI',
      channel: 'DAPI',
      channelIndex: 0
    };
    // Checkout drops the base entry, so only the channel entry resolves.
    resolveCartDatasets.mockResolvedValue([resolvedOf(dapi, 'k1')]);
    buildViewState.mockResolvedValue({
      ng_state: { layers: [{ name: 'DAPI' }] },
      layers: [
        { sharing_key: 'k1', layer_index: 0, channel: 'DAPI', opts: null }
      ]
    });
    const { addToView } = setup();
    await addToView([base, dapi]);
    expect(removeManyFromCart).toHaveBeenCalledWith([
      { path: '/ok.zarr', channel: undefined },
      { path: '/ok.zarr', channel: 'DAPI' }
    ]);
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
    expect(removeManyFromCart).toHaveBeenCalledWith([
      { path: '/nope', channel: undefined }
    ]);
  });

  it('changes nothing when a Data Link cannot be created', async () => {
    resolveCartDatasets.mockRejectedValue(new Error('link failed'));
    const { fake, addToView } = setup();
    const setState = vi.spyOn(fake.bridge, 'setState');
    await expect(addToView([ok])).rejects.toThrow('link failed');
    expect(setState).not.toHaveBeenCalled();
    expect(removeManyFromCart).not.toHaveBeenCalled();
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
    const { result, unmount } = renderHook(() =>
      useAddToView(fake.bridge, onEdited, onAddSources)
    );
    const pending = result.current([ok]);
    unmount();
    resolve([resolvedOf(ok, 'k1')]);
    await expect(pending).rejects.toThrow('Nothing was added');
    expect(setState).not.toHaveBeenCalled();
    expect(onEdited).not.toHaveBeenCalled();
    expect(onAddSources).not.toHaveBeenCalled();
    expect(removeManyFromCart).not.toHaveBeenCalled();
  });
});
