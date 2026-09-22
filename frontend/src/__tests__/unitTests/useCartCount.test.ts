import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { CartItem } from '@/queries/preferencesQueries';

let cartData: CartItem[] = [];

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    preferenceQuery: { data: { neuroglancerCart: cartData } }
  })
}));

import { useCartCount } from '@/hooks/useCartCount';

describe('useCartCount', () => {
  it('returns 0 for an empty cart', () => {
    cartData = [];

    const { result } = renderHook(() => useCartCount());

    expect(result.current).toBe(0);
  });

  it('counts datasets, not channel entries', () => {
    cartData = [
      { fsp_name: 'f', path: '/a.zarr', label: 'a' },
      {
        fsp_name: 'f',
        path: '/a.zarr',
        label: 'DAPI',
        channel: 'DAPI',
        channelIndex: 0
      },
      {
        fsp_name: 'f',
        path: '/a.zarr',
        label: 'GFP',
        channel: 'GFP',
        channelIndex: 1
      },
      { fsp_name: 'f', path: '/b.zarr', label: 'b' }
    ];

    const { result } = renderHook(() => useCartCount());

    expect(result.current).toBe(2);
  });
});
