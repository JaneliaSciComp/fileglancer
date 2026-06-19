import { describe, test, expect, vi, afterEach } from 'vitest';

import {
  formatDuration,
  stripLsfFooter,
  tailLines,
  exitCodeMeaning
} from '@/utils/jobDisplay';

describe('formatDuration', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns null when start is missing', () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(null)).toBeNull();
  });

  test('formats sub-minute durations in seconds', () => {
    expect(formatDuration('2026-06-18T10:00:00Z', '2026-06-18T10:00:42Z')).toBe(
      '42s'
    );
  });

  test('zero-length duration shows 0s', () => {
    expect(formatDuration('2026-06-18T10:00:00Z', '2026-06-18T10:00:00Z')).toBe(
      '0s'
    );
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration('2026-06-18T10:00:00Z', '2026-06-18T10:04:12Z')).toBe(
      '4m 12s'
    );
  });

  test('formats hours and days, dropping zero components', () => {
    expect(formatDuration('2026-06-18T10:00:00Z', '2026-06-19T12:00:00Z')).toBe(
      '1d 2h'
    );
  });

  test('defaults end to now for running jobs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T10:05:00Z'));
    expect(formatDuration('2026-06-18T10:00:00Z')).toBe('5m');
  });

  test('treats zoneless timestamps as UTC', () => {
    expect(formatDuration('2026-06-18T10:00:00', '2026-06-18T10:01:30')).toBe(
      '1m 30s'
    );
  });
});

describe('stripLsfFooter', () => {
  const footer = [
    '------------------------------------------------------------',
    'Sender: LSF System <lsfadmin@h07u17>',
    'Subject: Job 151418022: <fgk-pipeline-run> in cluster <Janelia> Done',
    '',
    'Job was submitted ...'
  ].join('\n');

  test('removes the footer block and trailing whitespace', () => {
    const text = `line one\nline two\n${footer}`;
    expect(stripLsfFooter(text)).toBe('line one\nline two');
  });

  test('leaves text untouched when no footer is present', () => {
    const text = 'just\nsome\noutput\n';
    expect(stripLsfFooter(text)).toBe(text);
  });

  test('does not strip a dashed line not followed by Sender', () => {
    const text =
      'a\n------------------------------------------------------------\nb';
    expect(stripLsfFooter(text)).toBe(text);
  });
});

describe('tailLines', () => {
  test('returns the last n lines', () => {
    expect(tailLines('a\nb\nc\nd\ne', 2)).toBe('d\ne');
  });

  test('returns all lines when fewer than n', () => {
    expect(tailLines('a\nb', 5)).toBe('a\nb');
  });

  test('ignores trailing blank lines', () => {
    expect(tailLines('a\nb\nc\n\n\n', 2)).toBe('b\nc');
  });
});

describe('exitCodeMeaning', () => {
  test('returns null for missing code', () => {
    expect(exitCodeMeaning(null)).toBeNull();
    expect(exitCodeMeaning(undefined)).toBeNull();
  });

  test('labels common codes', () => {
    expect(exitCodeMeaning(0)).toBe('success');
    expect(exitCodeMeaning(137)).toBe('killed (SIGKILL / out of memory)');
    expect(exitCodeMeaning(143)).toBe('terminated (SIGTERM)');
    expect(exitCodeMeaning(130)).toBe('interrupted (SIGINT)');
  });

  test('describes other signal-based codes', () => {
    expect(exitCodeMeaning(140)).toBe('killed by signal 12');
  });

  test('generic failure for small non-zero codes', () => {
    expect(exitCodeMeaning(1)).toBe('failed');
  });
});
