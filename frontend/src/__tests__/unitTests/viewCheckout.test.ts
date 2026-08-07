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
      (await import('@/omezarr-helper')).generateNeuroglancerStateForDataURL as any
    ).mockReturnValue(encoded({ layers: [{ name: 'fallback' }] }));
    const { ng_state } = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' }
    ]);
    expect((ng_state as any).layers).toHaveLength(1);
  });
});
