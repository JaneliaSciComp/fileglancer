import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    layout: '',
    handleUpdateLayout: vi.fn().mockResolvedValue(undefined),
    preferenceQuery: { isPending: false }
  })
}));
vi.mock('@/contexts/ServerHealthContext', () => ({
  useServerHealthContext: () => ({ status: 'up' })
}));

import useLayoutPrefs from '@/hooks/useLayoutPrefs';

describe('useLayoutPrefs drawer mode', () => {
  beforeEach(() => {
    // layout==='' on a wide screen opens the drawer in the init effect.
    window.innerWidth = 1200;
  });

  it('defaults to properties mode', () => {
    const { result } = renderHook(() => useLayoutPrefs());
    expect(result.current.propertiesDrawerMode).toBe('properties');
  });

  it('selectDrawerMode opens the drawer and sets the mode', () => {
    const { result } = renderHook(() => useLayoutPrefs());
    act(() => result.current.selectDrawerMode('cart'));
    expect(result.current.showPropertiesDrawer).toBe(true);
    expect(result.current.propertiesDrawerMode).toBe('cart');
  });

  it('selecting the already-open mode closes the drawer', () => {
    const { result } = renderHook(() => useLayoutPrefs());
    act(() => result.current.selectDrawerMode('cart')); // open in cart
    act(() => result.current.selectDrawerMode('cart')); // toggle closed
    expect(result.current.showPropertiesDrawer).toBe(false);
  });

  it('switching mode while open keeps it open', () => {
    const { result } = renderHook(() => useLayoutPrefs());
    act(() => result.current.selectDrawerMode('cart'));
    act(() => result.current.selectDrawerMode('properties'));
    expect(result.current.showPropertiesDrawer).toBe(true);
    expect(result.current.propertiesDrawerMode).toBe('properties');
  });
});
