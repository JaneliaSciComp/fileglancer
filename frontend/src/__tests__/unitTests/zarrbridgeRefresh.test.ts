import { describe, it, expect } from 'vitest';
import {
  shouldRefreshListing,
  isPendingVirtualZarr,
  pyramidJustFinished
} from '@/queries/zarrQueries';

describe('shouldRefreshListing', () => {
  it('refreshes a pending node as soon as the status is terminal, even on the first answer', () => {
    expect(shouldRefreshListing(undefined, 'native', 'indexing')).toBe(true);
    expect(shouldRefreshListing(undefined, 'unindexed', 'indexing')).toBe(true);
  });

  it('waits while the status is still busy or unknown', () => {
    expect(shouldRefreshListing(undefined, 'indexing', 'indexing')).toBe(false);
    expect(shouldRefreshListing('indexing', undefined, 'indexing')).toBe(false);
  });

  it('refreshes on a busy to terminal transition of a complete node', () => {
    expect(shouldRefreshListing('building', 'multiscale', undefined)).toBe(
      true
    );
    expect(shouldRefreshListing('native', 'native', undefined)).toBe(false);
  });
});

describe('isPendingVirtualZarr', () => {
  const node = (extra: Record<string, unknown>) =>
    ({ name: 'x', path: 'd/x', is_dir: false, ...extra }) as never;

  it('is true only for a root zarrbridge has no hierarchy for yet', () => {
    expect(
      isPendingVirtualZarr(
        node({ virtual_zarr: true, zarrbridge_state: 'indexing' })
      )
    ).toBe(true);
    expect(
      isPendingVirtualZarr(
        node({ virtual_zarr: true, zarrbridge_state: 'unindexed' })
      )
    ).toBe(true);
  });

  it('is false for leaves inside a virtual Zarr, plain files and nothing', () => {
    expect(isPendingVirtualZarr(node({ virtual_zarr: true }))).toBe(false);
    expect(isPendingVirtualZarr(node({}))).toBe(false);
    expect(isPendingVirtualZarr(undefined)).toBe(false);
  });
});

describe('pyramidJustFinished', () => {
  it('is true only on the transition from a busy state to multiscale', () => {
    expect(pyramidJustFinished('building', 'multiscale')).toBe(true);
    expect(pyramidJustFinished('queued', 'multiscale')).toBe(true);
    expect(pyramidJustFinished('indexing', 'native')).toBe(false);
    expect(pyramidJustFinished(undefined, 'multiscale')).toBe(false);
    expect(pyramidJustFinished('multiscale', 'multiscale')).toBe(false);
  });
});
