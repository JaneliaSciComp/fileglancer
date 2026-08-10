import { describe, it, expect } from 'vitest';
import { isBareLayoutPath } from '@/utils';

describe('isBareLayoutPath', () => {
  it('is true for the embedded viewer route', () => {
    expect(isBareLayoutPath('/view/abc123')).toBe(true);
  });
  it('is false for normal app routes', () => {
    expect(isBareLayoutPath('/ngviews')).toBe(false);
    expect(isBareLayoutPath('/browse')).toBe(false);
    expect(isBareLayoutPath('/')).toBe(false);
  });
});
