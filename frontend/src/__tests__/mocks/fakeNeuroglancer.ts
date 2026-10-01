import { vi } from 'vitest';

import type {
  NeuroglancerBridge,
  NeuroglancerViewerHandle
} from '@/hooks/useNeuroglancerViewer';

type NgState = Record<string, unknown>;

/** A stand-in for stock Neuroglancer's window.viewer. */
export function makeFakeViewer(initial: NgState = {}) {
  let state: NgState = structuredClone(initial);
  const handlers = new Set<() => void>();
  const notify = () => handlers.forEach(cb => cb());
  const viewer: NeuroglancerViewerHandle = {
    state: {
      toJSON: () => structuredClone(state),
      reset: vi.fn(() => {
        state = {};
      }),
      restoreState: vi.fn((json: NgState) => {
        state = { ...state, ...structuredClone(json) };
        notify();
      }),
      changed: {
        add: (cb: () => void) => {
          handlers.add(cb);
          return () => {
            handlers.delete(cb);
          };
        }
      }
    }
  };
  return {
    viewer,
    /** Simulate Neuroglancer changing its state (a user edit or NG itself). */
    change(next: NgState) {
      state = structuredClone(next);
      notify();
    }
  };
}

/** A ready bridge over a fake viewer, plus a way to simulate user input. */
export function makeFakeBridge(initial: NgState = {}) {
  const fake = makeFakeViewer(initial);
  const inputs = new Set<() => void>();
  const bridge: NeuroglancerBridge = {
    status: 'ready',
    getState: () => fake.viewer.state.toJSON(),
    setState: json => {
      fake.viewer.state.reset();
      fake.viewer.state.restoreState(json);
    },
    subscribe: cb => fake.viewer.state.changed.add(cb),
    onInteraction: cb => {
      inputs.add(cb);
      return () => {
        inputs.delete(cb);
      };
    }
  };
  return { ...fake, bridge, interact: () => inputs.forEach(cb => cb()) };
}
