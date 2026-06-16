// https://www.robinwieruch.de/vitest-react-testing-library/
// https://mswjs.io/docs/quick-start

import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/vitest';
import { server } from './mocks/node';

expect.extend(matchers);

import.meta.env.VITE_ENABLE_TASKS = true;
import.meta.env.VITE_ENABLE_SSH_KEYS = true;

// Define mock functions using vi.hoisted to ensure they're available to vi.mock,
// which is hoisted to be executed before all imports
const mockToastFns = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('react-hot-toast', () => {
  return {
    __esModule: true,
    default: Object.assign(
      () => {}, // Mock the default function export
      {
        success: mockToastFns.success,
        error: mockToastFns.error
      }
    )
  };
});

// Stub manifest loading globally so ViewersProvider (used throughout
// test-utils) never makes real network requests to the manifest host.
// Real network calls leak past MSW and get aborted on test teardown,
// producing "ECANCELED"/AbortError unhandled errors. Individual tests can
// still override this mock (see DataToolLinks.test.tsx). Other exports keep
// their real implementations.
vi.mock('@bioimagetools/capability-manifest', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@bioimagetools/capability-manifest')>();
  return {
    ...actual,
    loadManifestsFromUrls: vi.fn().mockResolvedValue(new Map())
  };
});

// Workaround for error: "element.animate" is not a function, caused by ripple animation on btn
// https://github.com/jsdom/jsdom/issues/3429#issuecomment-1936128876
Element.prototype.animate = vi
  .fn()
  .mockImplementation(() => ({ finished: Promise.resolve() }));

beforeAll(() => server.listen());

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
