import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useViewEditState } from '@/hooks/useViewEditState';
import { makeFakeBridge } from '@/__tests__/mocks/fakeNeuroglancer';

const settle = () =>
  act(() => {
    vi.advanceTimersByTime(400);
  });

describe('useViewEditState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts clean', () => {
    const { bridge } = makeFakeBridge({ layout: 'xy' });
    const { result } = renderHook(() => useViewEditState(bridge));
    expect(result.current.dirty).toBe(false);
  });

  it("ignores Neuroglancer's own changes before the first interaction", () => {
    const fake = makeFakeBridge({ layout: 'xy' });
    const { result } = renderHook(() => useViewEditState(fake.bridge));
    fake.change({ layout: 'xy', position: [1, 2, 3] }); // NG sets position as data loads
    settle();
    expect(result.current.dirty).toBe(false);
    // That change became the baseline: interacting without editing stays clean.
    act(() => fake.interact());
    fake.change({ layout: 'xy', position: [1, 2, 3] });
    settle();
    expect(result.current.dirty).toBe(false);
  });

  it('is dirty after the user changes the state, clean again if reverted', () => {
    const fake = makeFakeBridge({ layout: 'xy' });
    const { result } = renderHook(() => useViewEditState(fake.bridge));
    act(() => fake.interact());
    fake.change({ layout: '4panel' });
    settle();
    expect(result.current.dirty).toBe(true);
    fake.change({ layout: 'xy' });
    settle();
    expect(result.current.dirty).toBe(false);
  });

  it('discard restores the baseline through the bridge', () => {
    const fake = makeFakeBridge({ layout: 'xy' });
    const setState = vi.spyOn(fake.bridge, 'setState');
    const { result } = renderHook(() => useViewEditState(fake.bridge));
    act(() => fake.interact());
    fake.change({ layout: '4panel' });
    settle();
    act(() => result.current.discard());
    expect(setState).toHaveBeenCalledWith({ layout: 'xy' });
    settle();
    expect(result.current.dirty).toBe(false);
  });

  it('markSaved makes the sent state the baseline', () => {
    const fake = makeFakeBridge({ layout: 'xy' });
    const { result } = renderHook(() => useViewEditState(fake.bridge));
    act(() => fake.interact());
    fake.change({ layout: '4panel' });
    settle();
    act(() => result.current.markSaved({ layout: '4panel' }));
    expect(result.current.dirty).toBe(false);
    fake.change({ layout: 'xy' });
    settle();
    expect(result.current.dirty).toBe(true);
  });

  it('markSaved keeps dirty when the state moved on after sending', () => {
    const fake = makeFakeBridge({ layout: 'xy' });
    const { result } = renderHook(() => useViewEditState(fake.bridge));
    act(() => fake.interact());
    fake.change({ layout: '4panel' });
    settle();
    const sent = fake.bridge.getState();
    fake.change({ layout: '3d' }); // camera kept moving during the PUT
    act(() => result.current.markSaved(sent));
    expect(result.current.dirty).toBe(true);
  });

  it('does nothing while the bridge is not ready', () => {
    const fake = makeFakeBridge({ layout: 'xy' });
    const subscribe = vi.spyOn(fake.bridge, 'subscribe');
    renderHook(() =>
      useViewEditState({ ...fake.bridge, status: 'unavailable' })
    );
    expect(subscribe).not.toHaveBeenCalled();
  });
});
