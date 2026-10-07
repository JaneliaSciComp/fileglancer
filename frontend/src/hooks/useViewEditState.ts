import { useCallback, useEffect, useRef, useState } from 'react';

import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';

type NgState = Record<string, unknown>;

export type ViewEditState = {
  dirty: boolean;
  /** Data Links of added datasets with no NG layer, recorded on Save. */
  pendingSources: string[];
  addSources: (sharingKeys: string[]) => void;
  discard: () => void;
  markSaved: (sent: NgState) => void;
  markEdited: () => void;
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
 *
 * If Neuroglancer reloads inside the iframe while dirty, `onChangesLost` fires
 * and the edits are compared against the saved baseline again once it is
 * ready: NG restores its own URL hash, so they may have survived.
 */
export function useViewEditState(
  bridge: NeuroglancerBridge,
  onChangesLost?: () => void
): ViewEditState {
  const { status, getState, setState, subscribe, onInteraction } = bridge;
  const [dirty, setDirtyState] = useState(false);
  const [pendingSources, setPendingSources] = useState<string[]>([]);
  const dirtyRef = useRef(false);
  const baseline = useRef('');
  const interacted = useRef(false);

  const setDirty = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirtyState(next);
  }, []);

  const rebaseline = useCallback(() => {
    baseline.current = JSON.stringify(getState());
    interacted.current = false;
    setDirty(false);
  }, [getState, setDirty]);

  const markSaved = useCallback(
    (sent: NgState) => {
      baseline.current = JSON.stringify(sent);
      setPendingSources([]);
      setDirty(JSON.stringify(getState()) !== baseline.current);
    },
    [getState, setDirty]
  );

  // A change made from outside the viewer (adding layers from the sidebar)
  // is the user's edit, the same as an in-viewer interaction.
  const markEdited = useCallback(() => {
    interacted.current = true;
    setDirty(JSON.stringify(getState()) !== baseline.current);
  }, [getState, setDirty]);

  // They aren't in NG's state, so they survive an NG reload.
  const addSources = useCallback((sharingKeys: string[]) => {
    setPendingSources(prev => [...new Set([...prev, ...sharingKeys])]);
  }, []);

  const discard = useCallback(() => {
    setPendingSources([]);
    setState(JSON.parse(baseline.current) as NgState);
    rebaseline();
  }, [setState, rebaseline]);

  useEffect(() => {
    if (status !== 'ready' && dirtyRef.current) {
      setDirty(false);
      onChangesLost?.();
    }
  }, [status, setDirty, onChangesLost]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    if (baseline.current === '') {
      rebaseline();
    } else {
      // Ready again after a reload: compare with the saved baseline, and
      // skip the gate so the gate can't absorb surviving edits.
      interacted.current = true;
      setDirty(JSON.stringify(getState()) !== baseline.current);
    }
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
  }, [status, getState, subscribe, onInteraction, rebaseline, setDirty]);

  return {
    dirty: dirty || pendingSources.length > 0,
    pendingSources,
    addSources,
    discard,
    markSaved,
    markEdited,
    rebaseline
  };
}
