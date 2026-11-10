import { describe, it, expect } from 'vitest';
import { shouldRefreshListing } from '@/queries/zarrQueries';

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
