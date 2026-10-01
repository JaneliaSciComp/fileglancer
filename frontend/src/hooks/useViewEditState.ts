import { useCallback, useEffect, useRef, useState } from 'react';

import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';

type NgState = Record<string, unknown>;

export type ViewEditState = {
  dirty: boolean;
  discard: () => void;
  markSaved: (sent: NgState) => void;
  rebaseline: () => void;
};

// NG fires `changed` on every camera frame.
const COMPARE_THROTTLE_MS = 300;

/**
 * Tracks whether the embedded viewer's state differs from the last saved one.
 * The baseline is the viewer's own toJSON() (NG normalizes the saved state on
 * load), and until the user first interacts every change re-baselines, so
 * NG's own load-time changes (e.g. setting the position) don't count.
 * ponytail: the interaction gate is a heuristic; an NG-internal change after
 * the first click shows as dirty.
 */
export function useViewEditState(bridge: NeuroglancerBridge): ViewEditState {
  const { status, getState, setState, subscribe, onInteraction } = bridge;
  const [dirty, setDirty] = useState(false);
  const baseline = useRef('');
  const interacted = useRef(false);

  const rebaseline = useCallback(() => {
    baseline.current = JSON.stringify(getState());
    interacted.current = false;
    setDirty(false);
  }, [getState]);

  const markSaved = useCallback(
    (sent: NgState) => {
      baseline.current = JSON.stringify(sent);
      setDirty(JSON.stringify(getState()) !== baseline.current);
    },
    [getState]
  );

  const discard = useCallback(() => {
    setState(JSON.parse(baseline.current) as NgState);
    rebaseline();
  }, [setState, rebaseline]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    rebaseline();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const compare = () => {
      timer = undefined;
      const current = JSON.stringify(getState());
      if (!interacted.current) {
        baseline.current = current;
        return;
      }
      setDirty(current !== baseline.current);
    };
    const offChanged = subscribe(() => {
      timer ??= setTimeout(compare, COMPARE_THROTTLE_MS);
    });
    const offInput = onInteraction(() => {
      interacted.current = true;
    });
    return () => {
      offChanged();
      offInput();
      clearTimeout(timer);
    };
  }, [status, getState, subscribe, onInteraction, rebaseline]);

  return { dirty, discard, markSaved, rebaseline };
}
