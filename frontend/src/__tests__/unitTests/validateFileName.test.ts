import { describe, test, expect } from 'vitest';

import { validateFileName, validateFilePath } from '@/utils/validateFileName';

describe('validateFileName', () => {
  test('empty string is empty and invalid', () => {
    const result = validateFileName('');
    expect(result.isEmpty).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('whitespace-only is treated as empty', () => {
    const result = validateFileName('   ');
    expect(result.isEmpty).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('plain name is valid', () => {
    const result = validateFileName('report.txt');
    expect(result.isValid).toBe(true);
    expect(result.isEmpty).toBe(false);
    expect(result.hasSlashes).toBe(false);
    expect(result.hasConsecutiveDots).toBe(false);
    expect(result.hasPercent).toBe(false);
  });

  test('leading/trailing whitespace is trimmed', () => {
    expect(validateFileName('  report.txt  ').isValid).toBe(true);
  });

  test('single dot in name is allowed', () => {
    expect(validateFileName('a.b').isValid).toBe(true);
  });

  test('forward slash is rejected', () => {
    const result = validateFileName('a/b');
    expect(result.hasSlashes).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('backslash is rejected', () => {
    const result = validateFileName('a\\b');
    expect(result.hasSlashes).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('consecutive dots are rejected', () => {
    const result = validateFileName('a..b');
    expect(result.hasConsecutiveDots).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('three dots are rejected', () => {
    expect(validateFileName('...').hasConsecutiveDots).toBe(true);
  });

  test('percent sign is rejected', () => {
    const result = validateFileName('50%off');
    expect(result.hasPercent).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('reports multiple violations simultaneously', () => {
    const result = validateFileName('a/..b%');
    expect(result.hasSlashes).toBe(true);
    expect(result.hasConsecutiveDots).toBe(true);
    expect(result.hasPercent).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('unicode names are valid', () => {
    expect(validateFileName('résumé.pdf').isValid).toBe(true);
    expect(validateFileName('文件.txt').isValid).toBe(true);
  });
});

describe('validateFilePath', () => {
  test('empty string is invalid', () => {
    const result = validateFilePath('');
    expect(result.isEmpty).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('whitespace-only is treated as empty', () => {
    expect(validateFilePath('   ').isEmpty).toBe(true);
  });

  test('path with slashes is valid', () => {
    expect(validateFilePath('/a/b/c').isValid).toBe(true);
    expect(validateFilePath('\\a\\b\\c').isValid).toBe(true);
  });

  test('consecutive dots are rejected', () => {
    const result = validateFilePath('/a/../b');
    expect(result.hasConsecutiveDots).toBe(true);
    expect(result.isValid).toBe(false);
  });

  test('single dot segments are allowed', () => {
    expect(validateFilePath('/a/./b').isValid).toBe(true);
  });
});
