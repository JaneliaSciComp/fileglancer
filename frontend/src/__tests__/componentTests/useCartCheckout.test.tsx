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
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({ disableHeuristicalLayerTypeDetection: false })
}));
vi.mock('@/utils/viewCheckout', () => ({
  buildViewState
}));
vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  useZoneAndFspMapContext: () => ({
    zonesAndFspQuery: {
      data: {
        fsp_f: { name: 'f', protocol: 'file', mount_path: '/f' },
        fsp_bucket: {
          name: 'bucket',
          protocol: 's3',
          mount_path: 'https://example-datasets.s3.amazonaws.com/zarr'
        }
      }
    }
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

  it('resolves a bucket dataset to its public URL without creating a Data Link', async () => {
    const { result } = renderHook(() => useCartCheckout(), { wrapper });
    const resolved = await result.current.resolveCartDatasets([
      { fsp_name: 'bucket', path: 'a b/sample.zarr', label: 'S' },
      { fsp_name: 'bucket', path: '.', label: 'root' }
    ]);
    expect(resolved).toEqual([
      expect.objectContaining({
        url: 'https://example-datasets.s3.amazonaws.com/zarr/a%20b/sample.zarr',
        sharing_key: null,
        url_prefix: ''
      }),
      expect.objectContaining({
        url: 'https://example-datasets.s3.amazonaws.com/zarr',
        sharing_key: null
      })
    ]);
    expect(createProxied).not.toHaveBeenCalled();
    expect(result.current.isBucketDataset({ fsp_name: 'bucket' })).toBe(true);
    expect(result.current.isBucketDataset({ fsp_name: 'f' })).toBe(false);
  });

  it('resolves Data Links without building or creating a View', async () => {
    const { result } = renderHook(() => useCartCheckout(), { wrapper });
    const resolved = await result.current.resolveCartDatasets([
      { fsp_name: 'f', path: '/a', label: 'A' },
      { fsp_name: 'f', path: '/a', label: 'DAPI', channel: 'DAPI' },
      { fsp_name: 'f', path: '/b', label: 'B' }
    ]);
    expect(resolved).toEqual([
      expect.objectContaining({
        path: '/a',
        channel: 'DAPI',
        sharing_key: 'ka'
      }),
      expect.objectContaining({
        path: '/b',
        sharing_key: 'kb',
        url: 'http://b'
      })
    ]);
    expect(createProxied).toHaveBeenCalledTimes(1);
    expect(buildViewState).not.toHaveBeenCalled();
    expect(createViewAsync).not.toHaveBeenCalled();
  });
});
