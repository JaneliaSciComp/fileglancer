import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/mocks/node';
import {
  isRelinkableLayer,
  useRelinkViewsMutation,
  useRelinkableViewsQuery
} from '@/queries/viewQueries';
import { useCreateProxiedPathMutation } from '@/queries/proxiedPathQueries';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('relink queries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isRelinkableLayer needs broken + key + prefix', () => {
    expect(
      isRelinkableLayer({ broken: true, sharing_key: 'k', url_prefix: 'p' })
    ).toBe(true);
    expect(
      isRelinkableLayer({ broken: true, sharing_key: 'k', url_prefix: null })
    ).toBe(false);
    expect(
      isRelinkableLayer({ broken: false, sharing_key: 'k', url_prefix: 'p' })
    ).toBe(false);
  });

  it('fetches relinkable Views for an FSP-root path', async () => {
    let seen: URL | null = null;
    server.use(
      http.get('/api/neuroglancer/views/relinkable', ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json({ views: [{ short_key: 'a', name: 'A' }] });
      })
    );
    const { result } = renderHook(() => useRelinkableViewsQuery('nrs', ''), {
      wrapper: wrapper()
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ short_key: 'a', name: 'A' }]);
    expect(seen!.searchParams.get('path')).toBe('');
  });

  it('toasts after a relink', async () => {
    server.use(
      http.post('/api/neuroglancer/views/relink', () =>
        HttpResponse.json({ views: [{ short_key: 'a', name: 'A' }] })
      )
    );
    const { result } = renderHook(() => useRelinkViewsMutation(), {
      wrapper: wrapper()
    });
    await result.current.mutateAsync('newkey');
    expect(toast.success).toHaveBeenCalledWith('Relinked 1 broken View');
  });

  it('toasts when creating a Data Link relinked Views', async () => {
    server.use(
      http.post('/api/proxied-path', () =>
        HttpResponse.json({
          sharing_key: 'k',
          fsp_name: 'nrs',
          path: 'a.zarr',
          url: 'http://x/files/k/a.zarr',
          relinked_views: [
            { short_key: 'a', name: 'A' },
            { short_key: 'b', name: 'B' }
          ]
        })
      )
    );
    const { result } = renderHook(() => useCreateProxiedPathMutation(), {
      wrapper: wrapper()
    });
    await result.current.mutateAsync({ fsp_name: 'nrs', path: 'a.zarr' });
    expect(toast.success).toHaveBeenCalledWith('Relinked 2 broken Views');
  });

  it('does not toast when nothing was relinked', async () => {
    const { result } = renderHook(() => useCreateProxiedPathMutation(), {
      wrapper: wrapper()
    });
    await result.current.mutateAsync({ fsp_name: 'nrs', path: 'a.zarr' });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
