import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const createProxied = vi.fn();
const createViewAsync = vi.fn();
const buildViewState = vi.hoisted(() => vi.fn());

vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({
    data: [{ fsp_name: 'f', path: '/a', sharing_key: 'ka', url: 'http://a' }]
  }),
  useCreateProxiedPathMutation: () => ({ mutateAsync: createProxied })
}));
vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({
    createViewMutation: { mutateAsync: createViewAsync }
  })
}));
vi.mock('@/utils/viewCheckout', () => ({
  buildViewState
}));

import { useCartCheckout } from '@/hooks/useCartCheckout';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  createProxied.mockReset().mockResolvedValue({
    fsp_name: 'f',
    path: '/b',
    sharing_key: 'kb',
    url: 'http://b'
  });
  createViewAsync.mockReset().mockResolvedValue({ short_key: 'v1', name: 'N' });
  buildViewState.mockReset().mockResolvedValue({
    ng_state: { layers: [] },
    layers: [{ sharing_key: 'ka', layer_index: 0, channel: null, opts: null }]
  });
});

describe('useCartCheckout', () => {
  it('reuses existing links, creates missing ones, then creates the View', async () => {
    const { result } = renderHook(() => useCartCheckout(), { wrapper });
    await result.current.checkout(
      [
        { fsp_name: 'f', path: '/a', label: 'A' }, // existing link → no create
        { fsp_name: 'f', path: '/b', label: 'B' } // missing → create
      ],
      'My View'
    );
    expect(createProxied).toHaveBeenCalledTimes(1);
    expect(createProxied).toHaveBeenCalledWith(
      expect.objectContaining({ fsp_name: 'f', path: '/b' })
    );
    expect(createViewAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My View', ng_state: { layers: [] } })
    );
  });

  it('drops the base entry when a channel entry exists for the same dataset', async () => {
    const { result } = renderHook(() => useCartCheckout(), { wrapper });
    await result.current.checkout(
      [
        { fsp_name: 'f', path: '/a', label: 'A' }, // base entry, no channel
        { fsp_name: 'f', path: '/a', label: 'DAPI', channel: 'DAPI' } // channel entry, same dataset
      ],
      'My View'
    );

    expect(buildViewState).toHaveBeenCalledTimes(1);
    const resolvedDatasets = buildViewState.mock.calls[0][0];
    expect(resolvedDatasets).toHaveLength(1);
    expect(resolvedDatasets).toEqual([
      expect.objectContaining({ fsp_name: 'f', path: '/a', channel: 'DAPI' })
    ]);
  });
});
