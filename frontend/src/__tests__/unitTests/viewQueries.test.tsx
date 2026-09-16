import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Stub the low-level fetch/url utils so the queries never hit the network.
const sendFetchRequest = vi.fn();
const buildUrl = vi.fn(
  (base: string, seg: string | null) => `${base}${seg ?? ''}`
);
vi.mock('@/utils', () => ({
  sendFetchRequest: (...args: unknown[]) => sendFetchRequest(...args),
  buildUrl: (...args: Parameters<typeof buildUrl>) => buildUrl(...args)
}));

import {
  useViewsQuery,
  useUpdateViewMutation,
  viewQueryKeys
} from '@/queries/viewQueries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('viewQueries', () => {
  beforeEach(() => {
    sendFetchRequest.mockReset();
  });

  it('has a stable query-key factory', () => {
    expect(viewQueryKeys.list()).toEqual(['views', 'list']);
  });

  it('unwraps the { views } envelope from the list endpoint', async () => {
    sendFetchRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        views: [{ short_key: 'k1', name: 'A', layers: [] }]
      })
    });
    const { result } = renderHook(() => useViewsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].short_key).toBe('k1');
    expect(sendFetchRequest).toHaveBeenCalledWith(
      '/api/neuroglancer/views',
      'GET',
      undefined,
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('treats a 404 list as an empty array (no error)', async () => {
    sendFetchRequest.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    });
    const { result } = renderHook(() => useViewsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  describe('useUpdateViewMutation invalidation', () => {
    // A name-only rename must not invalidate the state query: the embedded
    // viewer's active viewQueryKeys.state(readKey) query would refetch,
    // changing the iframe src and reloading Neuroglancer.
    it('invalidates only the list on a name-only rename', async () => {
      sendFetchRequest.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ short_key: 'k1', read_key: 'r1', name: 'New' })
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } }
      });
      const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(() => useUpdateViewMutation(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        )
      });
      await result.current.mutateAsync({ short_key: 'k1', name: 'New' });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: viewQueryKeys.list()
      });
      expect(invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: viewQueryKeys.state('r1')
      });
    });

    it('also invalidates the state query when ng_state changes', async () => {
      sendFetchRequest.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ short_key: 'k1', read_key: 'r1', name: 'New' })
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } }
      });
      const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(() => useUpdateViewMutation(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        )
      });
      await result.current.mutateAsync({ short_key: 'k1', ng_state: {} });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: viewQueryKeys.list()
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: viewQueryKeys.state('r1')
      });
    });
  });
});
