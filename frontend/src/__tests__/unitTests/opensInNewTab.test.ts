import { describe, it, expect } from 'vitest';
import { opensInNewTab } from '@/hooks/useDataToolLinks';

describe('opensInNewTab', () => {
  it('opens web viewers in a new tab', () => {
    expect(opensInNewTab('https://biongff.github.io/vizarr/?source=x')).toBe(
      true
    );
    expect(opensInNewTab('/viewers/local/?url=x')).toBe(true);
  });

  it('opens desktop app links in the current tab', () => {
    expect(opensInNewTab('fiji://open/url?p=https%3A%2F%2Fexample.org')).toBe(
      false
    );
  });
});
