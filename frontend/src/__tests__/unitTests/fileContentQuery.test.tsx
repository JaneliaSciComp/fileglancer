import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFileContentQuery,
  TEXT_PREVIEW_BYTES
} from '@/queries/fileContentQueries';

vi.mock('@/utils', async () => {
  const actual = await vi.importActual('@/utils');
  return {
    ...actual,
    buildUrl: () => '/api/content/test_fsp?subpath=big.log'
  };
});

describe('useFileContentQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('asks only for the first TEXT_PREVIEW_BYTES bytes, never the whole file', async () => {
    const text = new TextEncoder().encode('first part of a huge log');
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: async () => text.buffer
    } as Response);

    const { result } = renderHook(
      () => useFileContentQuery('test_fsp', 'big.log'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('first part of a huge log');
    expect(TEXT_PREVIEW_BYTES).toBe(1024 * 1024);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Range')).toBe(`bytes=0-${TEXT_PREVIEW_BYTES - 1}`);
  });
});
