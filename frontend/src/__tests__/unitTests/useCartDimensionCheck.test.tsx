import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Each dataset's "metadata" is its voxel size; equal sizes match.
vi.mock('@/utils/viewCheckout', () => ({
  probeDataset: async (url: string) => ({
    kind: 'ome',
    metadata: { scale: url.includes('coarse') ? 2 : 1 }
  })
}));
vi.mock('@/utils/dimensionSignature', () => ({
  getDimensionSignature: (m: { scale: number }) => m,
  signaturesMatch: (a: { scale: number }, b: { scale: number }) =>
    a.scale === b.scale
}));

import { useCartDimensionCheck } from '@/hooks/useCartDimensionCheck';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);
const fine = { fsp_name: 'f', path: 'fine.zarr', label: 'fine' };
const coarse = { fsp_name: 'f', path: 'coarse.zarr', label: 'coarse' };

describe('useCartDimensionCheck', () => {
  it('uses the first cart dataset as the reference without a View', async () => {
    const { result } = renderHook(() => useCartDimensionCheck([coarse, fine]), {
      wrapper
    });
    await waitFor(() =>
      expect([...result.current.mismatchedKeys]).toEqual(['f::fine.zarr'])
    );
  });

  it("checks every cart dataset against the View's first source", async () => {
    const view = [{ fsp_name: 'f', path: 'fine.zarr' }];
    const { result } = renderHook(
      () => useCartDimensionCheck([coarse, fine], view),
      { wrapper }
    );
    await waitFor(() =>
      expect([...result.current.mismatchedKeys]).toEqual(['f::coarse.zarr'])
    );
    // The View's sources aren't cart rows.
    expect([...result.current.kindByKey.keys()]).toEqual([
      'f::coarse.zarr',
      'f::fine.zarr'
    ]);
  });
});
