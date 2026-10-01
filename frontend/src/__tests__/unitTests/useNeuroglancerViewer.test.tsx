import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useNeuroglancerViewer } from '@/hooks/useNeuroglancerViewer';
import { makeFakeViewer } from '@/__tests__/mocks/fakeNeuroglancer';

function iframeWith(contentWindow: unknown) {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get: () => contentWindow
  });
  return iframe;
}

function load(iframe: HTMLIFrameElement) {
  act(() => {
    iframe.dispatchEvent(new Event('load'));
  });
}

describe('useNeuroglancerViewer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is loading until the iframe loads', () => {
    const { result } = renderHook(() => useNeuroglancerViewer(iframeWith({})));
    expect(result.current.status).toBe('loading');
  });

  it('becomes ready once Neuroglancer sets window.viewer', () => {
    const win: { viewer?: unknown } = {};
    const iframe = iframeWith(win);
    const { result } = renderHook(() => useNeuroglancerViewer(iframe));
    load(iframe);
    expect(result.current.status).toBe('loading');
    win.viewer = makeFakeViewer({ layers: [] }).viewer;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.getState()).toEqual({ layers: [] });
  });

  it('is unavailable when the browser blocks cross-origin access', () => {
    const iframe = iframeWith({
      get viewer() {
        throw new DOMException('Blocked a frame', 'SecurityError');
      }
    });
    const { result } = renderHook(() => useNeuroglancerViewer(iframe));
    load(iframe);
    expect(result.current.status).toBe('unavailable');
  });

  it('gives up when Neuroglancer never sets window.viewer', () => {
    const iframe = iframeWith({});
    const { result } = renderHook(() => useNeuroglancerViewer(iframe));
    load(iframe);
    act(() => {
      vi.advanceTimersByTime(16000);
    });
    expect(result.current.status).toBe('unavailable');
  });

  it('setState resets before restoring, so absent keys are cleared', () => {
    const fake = makeFakeViewer({ layers: [{ name: 'a' }], layout: '4panel' });
    const iframe = iframeWith({ viewer: fake.viewer });
    const { result } = renderHook(() => useNeuroglancerViewer(iframe));
    load(iframe);
    act(() => result.current.setState({ layers: [] }));
    expect(fake.viewer.state.reset).toHaveBeenCalledBefore(
      fake.viewer.state.restoreState as ReturnType<typeof vi.fn>
    );
    expect(result.current.getState()).toEqual({ layers: [] });
  });

  it('subscribe forwards state changes and returns a remover', () => {
    const fake = makeFakeViewer({});
    const iframe = iframeWith({ viewer: fake.viewer });
    const { result } = renderHook(() => useNeuroglancerViewer(iframe));
    load(iframe);
    const cb = vi.fn();
    const off = result.current.subscribe(cb);
    fake.change({ layout: 'xy' });
    off();
    fake.change({ layout: 'yz' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('onInteraction listens for pointer/key/wheel input in the iframe', () => {
    const win = Object.assign(new EventTarget(), {
      viewer: makeFakeViewer({}).viewer
    });
    const iframe = iframeWith(win);
    const { result } = renderHook(() => useNeuroglancerViewer(iframe));
    load(iframe);
    const cb = vi.fn();
    const off = result.current.onInteraction(cb);
    win.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    win.dispatchEvent(new Event('wheel'));
    off();
    win.dispatchEvent(new Event('pointerdown'));
    expect(cb).toHaveBeenCalledTimes(3);
  });
});
