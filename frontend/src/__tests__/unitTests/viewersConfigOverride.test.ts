import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveViewersConfigPath } from '@/config/resolveViewersConfigPath';

// Use the mocks directory as a stand-in for the frontend root in override tests.
// It contains a viewers.config.yaml fixture, so existsSync returns true there —
// exactly as it would for a real user-provided override at frontend/viewers.config.yaml.
const mocksDir = path.resolve(process.cwd(), 'src/__tests__/mocks');

// A directory guaranteed not to contain viewers.config.yaml, to test the fallback.
const noOverrideDir = path.resolve(process.cwd(), 'src/__tests__/unitTests');

describe('resolveViewersConfigPath', () => {
  it('returns the override path when viewers.config.yaml exists in the frontend root', () => {
    const result = resolveViewersConfigPath(mocksDir);
    expect(result).toBe(path.resolve(mocksDir, 'viewers.config.yaml'));
  });

  it('returns the default config path when no override file is present', () => {
    const result = resolveViewersConfigPath(noOverrideDir);
    expect(result).toBe(
      path.resolve(noOverrideDir, 'src/config/viewers.config.yaml')
    );
  });
});
