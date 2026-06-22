import { describe, it, expect } from 'vitest';
import { resolveViewersConfigPath } from '@/config/resolveViewersConfigPath';

// A stand-in frontend dir; the value is irrelevant since we inject the
// existence check and assert on the resolved path's shape rather than its
// exact string (which would just mirror the implementation's path.resolve).
const frontendDir = '/frontend';

describe('resolveViewersConfigPath', () => {
  it('prefers the root override over the committed default when it exists', () => {
    // existsSync only returns true for the root-level override, not the default.
    const result = resolveViewersConfigPath(
      frontendDir,
      p => /[/\\]viewers\.config\.yaml$/.test(p) && !/src[/\\]config/.test(p)
    );
    expect(result).toMatch(/[/\\]viewers\.config\.yaml$/);
    expect(result).not.toMatch(/src[/\\]config/);
  });

  it('falls back to the committed default when no override is present', () => {
    const result = resolveViewersConfigPath(frontendDir, () => false);
    expect(result).toMatch(/src[/\\]config[/\\]viewers\.config\.yaml$/);
  });
});
