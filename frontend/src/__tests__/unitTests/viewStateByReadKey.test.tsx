import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { sendFetchRequest } = vi.hoisted(() => ({ sendFetchRequest: vi.fn() }));
vi.mock('@/utils', () => ({
  sendFetchRequest,
  buildUrl: (base: string, seg: string | null) => `${base}${seg ?? ''}`
}));

import { useViewStateByReadKey } from '@/queries/viewQueries';

const fakeResponse = (status: number, body: unknown) =>
  ({
    ok: status < 300,
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

describe('useViewStateByReadKey', () => {
  it('returns the raw ng_state on success', async () => {
    sendFetchRequest.mockResolvedValue(
      fakeResponse(200, { layers: [{ name: 'L0' }] })
    );
    const { result } = renderHook(() => useViewStateByReadKey('rk1'), {
      wrapper
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ layers: [{ name: 'L0' }] });
  });

  it('returns null on 404', async () => {
    sendFetchRequest.mockResolvedValue(
      fakeResponse(404, { detail: 'View not found' })
    );
    const { result } = renderHook(() => useViewStateByReadKey('rk1'), {
      wrapper
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('is disabled without a read key', () => {
    const { result } = renderHook(() => useViewStateByReadKey(undefined), {
      wrapper
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(sendFetchRequest).not.toHaveBeenCalled();
  });
});
