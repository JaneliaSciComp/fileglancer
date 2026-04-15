import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFileBinaryPreviewQuery } from '@/queries/fileContentQueries';

// Simplify buildUrl so we can intercept fetch without URL matching complexity
vi.mock('@/utils', async () => {
  const actual = await vi.importActual('@/utils');
  return {
    ...actual,
    buildUrl: () => '/api/content/test_fsp?subpath=file.bin'
  };
});

describe('useFileBinaryPreviewQuery', () => {
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

  it('returns a Uint8Array from a 206 Partial Content response', async () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: async () => data.buffer
    } as Response);

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery('test_fsp', 'file.bin'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.current.data!)).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('returns a Uint8Array from a 200 OK response (server ignores Range)', async () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => data.buffer
    } as Response);

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery('test_fsp', 'file.bin'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeInstanceOf(Uint8Array);
  });

  it('sets error state when the response is not ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden'
    } as Response);

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery('test_fsp', 'file.bin'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Forbidden');
  });

  it('does not fetch when enabled is false', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery('test_fsp', 'file.bin', false),
      { wrapper }
    );

    await new Promise(r => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
  });

  it('does not fetch when fspName is undefined', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery(undefined, 'file.bin'),
      { wrapper }
    );

    await new Promise(r => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
  });

  it('sends a Range header requesting the first 512 bytes', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: async () => new Uint8Array(512).buffer
    } as Response);

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery('test_fsp', 'file.bin'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Range: 'bytes=0-511' })
      })
    );
  });

  it('includes credentials in the fetch request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: async () => new Uint8Array(4).buffer
    } as Response);

    const { result } = renderHook(
      () => useFileBinaryPreviewQuery('test_fsp', 'file.bin'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });
});
