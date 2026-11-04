import { describe, expect, it } from 'vitest';

import { summarizeMarkdown } from '@/utils/markdown';

describe('summarizeMarkdown', () => {
  it('flattens inline markup to plain text', () => {
    expect(
      summarizeMarkdown(
        'Does **something** with `zarr` per [docs](https://example.org).'
      )
    ).toBe('Does something with zarr per docs.');
  });

  it('drops heading markers but keeps heading text', () => {
    expect(summarizeMarkdown('### Limitations\nNo tables.')).toBe(
      'Limitations No tables.'
    );
  });

  it('drops table and fenced code lines entirely', () => {
    const text =
      'Intro.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```python\nprint(1)\n```\n\nOutro.';
    expect(summarizeMarkdown(text)).toBe('Intro. Outro.');
  });

  it('truncates long text at a word boundary with an ellipsis', () => {
    const text = 'word '.repeat(100);
    const summary = summarizeMarkdown(text, 50);
    expect(summary.length).toBeLessThanOrEqual(50);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).not.toContain('wor…');
  });

  it('returns empty string for empty input', () => {
    expect(summarizeMarkdown('')).toBe('');
  });
});
