import { describe, it, expect, vi, beforeEach } from 'vitest';

const encoded = (state: unknown) => encodeURIComponent(JSON.stringify(state));

vi.mock('@/omezarr-helper', () => ({
  getOmeZarrMetadata: vi.fn(),
  generateNeuroglancerStateForOmeZarr: vi.fn(),
  generateNeuroglancerStateForDataURL: vi.fn()
}));

import {
  getOmeZarrMetadata,
  generateNeuroglancerStateForOmeZarr
} from '@/omezarr-helper';
import { buildViewState } from '@/utils/viewCheckout';

const md = { multiscales: [{}], arr: {}, zarrVersion: 2 };

beforeEach(() => {
  (getOmeZarrMetadata as any).mockReset().mockResolvedValue(md);
  (generateNeuroglancerStateForOmeZarr as any)
    .mockReset()
    .mockImplementation((url: string) =>
      encoded({
        dimensions: { x: [1, 'm'] },
        layout: '4panel-alt',
        layers: [{ name: `${url}-L0`, type: 'image' }]
      })
    );
});

describe('buildViewState', () => {
  it('concatenates layers across datasets and maps ViewLayerInput', async () => {
    const { ng_state, layers } = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' },
      {
        url: 'b',
        sharing_key: 'kb',
        fsp_name: 'f',
        path: '/b',
        channel: 'GFP',
        label: 'B'
      }
    ]);
    const stateLayers = (ng_state as any).layers;
    expect(stateLayers).toHaveLength(2);
    expect((ng_state as any).dimensions).toEqual({ x: [1, 'm'] }); // first dataset's dims kept
    expect(layers).toEqual([
      { sharing_key: 'ka', layer_index: 0, channel: null, opts: null },
      { sharing_key: 'kb', layer_index: 1, channel: 'GFP', opts: null }
    ]);
  });

  it('falls back to the data-URL generator when there are no multiscales', async () => {
    (getOmeZarrMetadata as any).mockResolvedValue({
      multiscales: undefined,
      arr: {},
      zarrVersion: 2
    });
    (
      (await import('@/omezarr-helper'))
        .generateNeuroglancerStateForDataURL as any
    ).mockReturnValue(encoded({ layers: [{ name: 'fallback' }] }));
    const { ng_state } = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' }
    ]);
    expect((ng_state as any).layers).toHaveLength(1);
  });

  it('skips a dataset whose metadata fetch throws and keeps the rest', async () => {
    (getOmeZarrMetadata as any).mockRejectedValueOnce(new Error('gone'));
    const { ng_state, layers } = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' },
      { url: 'b', sharing_key: 'kb', fsp_name: 'f', path: '/b', label: 'B' }
    ]);
    expect((ng_state as any).layers).toHaveLength(1);
    expect(layers).toEqual([
      { sharing_key: 'kb', layer_index: 0, channel: null, opts: null }
    ]);
  });

  it('selects the layer at the requested channel index', async () => {
    (generateNeuroglancerStateForOmeZarr as any).mockReturnValue(
      encoded({
        layers: [
          { name: 'DAPI', type: 'image' },
          { name: 'GFP', type: 'image' }
        ]
      })
    );
    const { ng_state } = await buildViewState([
      {
        url: 'a',
        sharing_key: 'ka',
        fsp_name: 'f',
        path: '/a',
        channel: 'GFP',
        channelIndex: 1,
        label: 'A'
      }
    ]);
    expect((ng_state as any).layers).toEqual([
      { name: 'GFP', type: 'image', archived: false }
    ]);
  });

  it('selects one per-channel layer per channel entry by index', async () => {
    // Checkout forces the per-channel layer path when a channel is selected
    // (8th generator arg = true), yielding layers in c-axis index order.
    (generateNeuroglancerStateForOmeZarr as any).mockImplementation(
      (...args: unknown[]) => {
        const perChannel = args[7] === true;
        return encoded({
          layers: perChannel
            ? [
                { name: 'Ch0', localPosition: [0] },
                { name: 'Ch1', localPosition: [1] },
                { name: 'Ch2', localPosition: [2] },
                { name: 'Ch3', localPosition: [3] }
              ]
            : [{ name: 'combined', localPosition: [] }]
        });
      }
    );

    const noChannel = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' }
    ]);
    expect((noChannel.ng_state as any).layers).toHaveLength(1);

    const twoChannels = await buildViewState([
      {
        url: 'a',
        sharing_key: 'ka',
        fsp_name: 'f',
        path: '/a',
        channel: 'Ch0',
        channelIndex: 0,
        label: 'A'
      },
      {
        url: 'a',
        sharing_key: 'ka',
        fsp_name: 'f',
        path: '/a',
        channel: 'Ch2',
        channelIndex: 2,
        label: 'A'
      }
    ]);
    const layers = (twoChannels.ng_state as any).layers;
    expect(layers).toHaveLength(2);
    expect(layers[0].localPosition).toEqual([0]);
    expect(layers[1].localPosition).toEqual([2]);
  });
});
