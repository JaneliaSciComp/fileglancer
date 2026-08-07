import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const createProxied = vi.fn();
const createViewAsync = vi.fn();

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
  buildViewState: vi.fn().mockResolvedValue({
    ng_state: { layers: [] },
    layers: [{ sharing_key: 'ka', layer_index: 0, channel: null, opts: null }]
  })
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
});
