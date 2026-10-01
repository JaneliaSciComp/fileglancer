import { useCallback, useEffect, useState } from 'react';

type NgState = Record<string, unknown>;

/** The slice of stock Neuroglancer's `window.viewer` the bridge uses. */
export type NeuroglancerViewerHandle = {
  state: {
    toJSON(): NgState;
    reset(): void;
    restoreState(json: NgState): void;
    changed: { add(cb: () => void): () => void };
  };
};

export type BridgeStatus = 'loading' | 'ready' | 'unavailable';

export type NeuroglancerBridge = {
  status: BridgeStatus;
  getState: () => NgState;
  setState: (json: NgState) => void;
  subscribe: (cb: () => void) => () => void;
  onInteraction: (cb: () => void) => () => void;
};

const POLL_MS = 200;
const POLL_LIMIT_MS = 15000;
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

/**
 * Two-way bridge to the Neuroglancer in an iframe, via the `window.viewer`
 * global stock NG sets. Only works same-origin: reading a cross-origin
 * iframe's window throws, which reports `unavailable`.
 * ponytail: relies on stock NG's window.viewer global; library-embedding NG
 * (react-neuroglancer style) is the upgrade if the iframe becomes limiting.
 */
export function useNeuroglancerViewer(
  iframe: HTMLIFrameElement | null
): NeuroglancerBridge {
  const [viewer, setViewer] = useState<NeuroglancerViewerHandle | null>(null);
  const [status, setStatus] = useState<BridgeStatus>('loading');

  useEffect(() => {
    if (!iframe) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = (
      next: BridgeStatus,
      found: NeuroglancerViewerHandle | null
    ) => {
      clearInterval(timer);
      setViewer(found);
      setStatus(next);
    };
    const onLoad = () => {
      clearInterval(timer);
      setViewer(null);
      setStatus('loading');
      const started = Date.now();
      const poll = () => {
        let found: NeuroglancerViewerHandle | undefined;
        try {
          found = (
            iframe.contentWindow as
              | (Window & { viewer?: NeuroglancerViewerHandle })
              | null
          )?.viewer;
        } catch {
          // Cross-origin Neuroglancer: the browser blocks access.
          stop('unavailable', null);
          return;
        }
        if (found) {
          stop('ready', found);
        } else if (Date.now() - started > POLL_LIMIT_MS) {
          stop('unavailable', null);
        }
      };
      // NG creates window.viewer after its bundle runs, shortly after load.
      timer = setInterval(poll, POLL_MS);
      poll();
    };
    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      clearInterval(timer);
    };
  }, [iframe]);

  const requireViewer = useCallback(() => {
    if (!viewer) {
      throw new Error('Neuroglancer viewer is not ready');
    }
    return viewer;
  }, [viewer]);

  const getState = useCallback(
    () => requireViewer().state.toJSON(),
    [requireViewer]
  );
  const setState = useCallback(
    (json: NgState) => {
      const { state } = requireViewer();
      // restoreState leaves keys absent from json untouched; NG's own URL-hash
      // binding resets first for the same reason.
      state.reset();
      state.restoreState(json);
    },
    [requireViewer]
  );
  const subscribe = useCallback(
    (cb: () => void) => requireViewer().state.changed.add(cb),
    [requireViewer]
  );
  const onInteraction = useCallback(
    (cb: () => void) => {
      const win = iframe?.contentWindow;
      if (!win) {
        return () => {};
      }
      INPUT_EVENTS.forEach(e => win.addEventListener(e, cb, true));
      return () =>
        INPUT_EVENTS.forEach(e => win.removeEventListener(e, cb, true));
    },
    [iframe]
  );

  return { status, getState, setState, subscribe, onInteraction };
}
