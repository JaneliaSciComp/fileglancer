import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const sendFetchRequest = vi.fn();
vi.mock('@/utils', () => ({
  sendFetchRequest: (...args: unknown[]) => sendFetchRequest(...args),
  buildUrl: (base: string, seg: string) => `${base}/${seg}`
}));

import { useViewsForDataLinkQuery } from '@/queries/viewQueries';

const fakeResponse = (status: number, body: unknown) =>
  ({
    ok: status < 300,
    status,
    statusText: String(status),
    json: async () => body
  }) as unknown as Response;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => sendFetchRequest.mockReset());

describe('useViewsForDataLinkQuery', () => {
  it('returns the views array on success', async () => {
    sendFetchRequest.mockResolvedValue(
      fakeResponse(200, { views: [{ short_key: 'v1', name: 'A' }] })
    );
    const { result } = renderHook(() => useViewsForDataLinkQuery('k1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it('treats 404 as an empty list', async () => {
    sendFetchRequest.mockResolvedValue(fakeResponse(404, {}));
    const { result } = renderHook(() => useViewsForDataLinkQuery('k1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('is disabled without a sharing key', () => {
    const { result } = renderHook(() => useViewsForDataLinkQuery(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(sendFetchRequest).not.toHaveBeenCalled();
  });
});
