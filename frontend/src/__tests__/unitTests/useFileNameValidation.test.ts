import { describe, test, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import useFileNameValidation from '@/hooks/useFileNameValidation';

describe('useFileNameValidation', () => {
  test('empty input is treated as valid (caller handles required-ness)', () => {
    const { result } = renderHook(() => useFileNameValidation(''));
    expect(result.current.isValid).toBe(true);
    expect(result.current.errorMessage).toBeUndefined();
  });

  test('whitespace-only is also treated as valid', () => {
    const { result } = renderHook(() => useFileNameValidation('   '));
    expect(result.current.isValid).toBe(true);
    expect(result.current.errorMessage).toBeUndefined();
  });

  test('valid name has no error', () => {
    const { result } = renderHook(() => useFileNameValidation('report.txt'));
    expect(result.current.isValid).toBe(true);
    expect(result.current.errorMessage).toBeUndefined();
  });

  test('slashes take priority over other errors', () => {
    const { result } = renderHook(() => useFileNameValidation('a/..b%'));
    expect(result.current.isValid).toBe(false);
    expect(result.current.errorMessage).toBe('Cannot contain slashes.');
  });

  test('percent is reported when no slashes present', () => {
    const { result } = renderHook(() => useFileNameValidation('a..b%'));
    expect(result.current.errorMessage).toBe(
      'Cannot contain percent signs (%).'
    );
  });

  test('consecutive dots reported when only violation', () => {
    const { result } = renderHook(() => useFileNameValidation('a..b'));
    expect(result.current.errorMessage).toBe(
      'Cannot contain consecutive dots (..).'
    );
  });

  test('rerendering with new input updates result', () => {
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useFileNameValidation(name),
      { initialProps: { name: 'ok.txt' } }
    );
    expect(result.current.isValid).toBe(true);

    rerender({ name: 'bad/name' });
    expect(result.current.isValid).toBe(false);
    expect(result.current.errorMessage).toBe('Cannot contain slashes.');
  });
});
