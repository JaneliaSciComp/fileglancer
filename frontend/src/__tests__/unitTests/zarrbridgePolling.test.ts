import { describe, it, expect } from 'vitest';
import { zarrbridgePollInterval } from '@/queries/zarrQueries';

const status = (state: string) => ({ levels: { state } });

describe('zarrbridgePollInterval', () => {
  it('polls only while a pyramid is actually in progress', () => {
    expect(zarrbridgePollInterval(status('indexing'), null)).toBe(5000);
    expect(zarrbridgePollInterval(status('queued'), null)).toBe(5000);
    expect(zarrbridgePollInterval(status('building'), null)).toBe(5000);
  });

  it('stops on every terminal state', () => {
    for (const s of ['native', 'multiscale', 'failed', 'unservable']) {
      expect(zarrbridgePollInterval(status(s), null)).toBe(false);
    }
    expect(zarrbridgePollInterval(undefined, null)).toBe(false);
  });

  it('stops when the status request itself fails, even with stale data', () => {
    expect(zarrbridgePollInterval(status('building'), new Error('503'))).toBe(
      false
    );
  });
});
