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

import { useViewsQuery, viewQueryKeys } from '@/queries/viewQueries';

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
});
