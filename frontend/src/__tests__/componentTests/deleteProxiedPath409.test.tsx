import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const sendFetchRequest = vi.fn();
vi.mock('@/utils', () => ({
  sendFetchRequest: (...args: unknown[]) => sendFetchRequest(...args),
  buildUrl: (
    base: string,
    seg: string | null,
    q?: Record<string, string> | null
  ) => `${base}${seg ?? ''}${q ? '?' + new URLSearchParams(q).toString() : ''}`
}));

import {
  useDeleteProxiedPathMutation,
  DependentViewsError
} from '@/queries/proxiedPathQueries';

const fakeResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body
  }) as unknown as Response;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => sendFetchRequest.mockReset());

describe('useDeleteProxiedPathMutation 409 handling', () => {
  it('throws DependentViewsError carrying the dependent views on 409', async () => {
    sendFetchRequest.mockResolvedValue(
      fakeResponse(409, {
        detail: {
          message:
            'This data link backs Views you own; they will be marked broken.',
          dependent_views: [{ short_key: 'v1', name: 'My View' }]
        }
      })
    );
    const { result } = renderHook(() => useDeleteProxiedPathMutation(), {
      wrapper
    });
    await expect(
      result.current.mutateAsync({ sharing_key: 'k1' })
    ).rejects.toBeInstanceOf(DependentViewsError);
    const err = (await result.current
      .mutateAsync({ sharing_key: 'k1' })
      .catch(e => e as DependentViewsError)) as DependentViewsError;
    expect(err.views).toEqual([{ short_key: 'v1', name: 'My View' }]);
  });

  it('adds ?confirm=true when confirm is set and resolves on success', async () => {
    sendFetchRequest.mockResolvedValue(
      fakeResponse(200, { message: 'deleted' })
    );
    const { result } = renderHook(() => useDeleteProxiedPathMutation(), {
      wrapper
    });
    await result.current.mutateAsync({ sharing_key: 'k1', confirm: true });
    await waitFor(() =>
      expect(sendFetchRequest).toHaveBeenCalledWith(
        expect.stringContaining('confirm=true'),
        'DELETE'
      )
    );
  });
});
