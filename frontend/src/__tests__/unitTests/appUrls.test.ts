import { describe, expect, test } from 'vitest';

import {
  buildAppUrl,
  buildLaunchPath,
  buildRelaunchPath,
  canonicalGithubUrl,
  isGithubRepoUrl,
  parseGithubUrl
} from '@/utils/appUrls';

describe('app URL helpers', () => {
  test('parses GitHub branch names containing slashes', () => {
    expect(
      parseGithubUrl('https://github.com/org/tool/tree/feature/my-tool')
    ).toEqual({ owner: 'org', repo: 'tool', branch: 'feature/my-tool' });
  });

  test('parses scp-style SSH URLs (with and without .git)', () => {
    expect(parseGithubUrl('git@github.com:org/tool.git')).toEqual({
      owner: 'org',
      repo: 'tool',
      branch: 'main'
    });
    expect(parseGithubUrl('git@github.com:org/tool')).toEqual({
      owner: 'org',
      repo: 'tool',
      branch: 'main'
    });
  });

  test('parses ssh:// URLs', () => {
    expect(parseGithubUrl('ssh://git@github.com/org/tool.git')).toEqual({
      owner: 'org',
      repo: 'tool',
      branch: 'main'
    });
  });

  test('isGithubRepoUrl accepts HTTPS and SSH, rejects others', () => {
    expect(isGithubRepoUrl('https://github.com/org/tool')).toBe(true);
    expect(isGithubRepoUrl('git@github.com:org/tool.git')).toBe(true);
    expect(isGithubRepoUrl('https://gitlab.com/org/tool')).toBe(false);
    expect(isGithubRepoUrl('not a url')).toBe(false);
  });

  test('canonicalGithubUrl normalizes cosmetic URL variations', () => {
    // These all refer to the same app and must canonicalize identically, so an
    // installed-app lookup by URL doesn't wrongly miss (the "not in your
    // library" bug).
    const canonical = 'https://github.com/Org/Repo';
    expect(canonicalGithubUrl('https://github.com/Org/Repo')).toBe(canonical);
    expect(canonicalGithubUrl('https://github.com/Org/Repo.git')).toBe(
      canonical
    );
    expect(canonicalGithubUrl('https://github.com/Org/Repo/')).toBe(canonical);
    expect(canonicalGithubUrl('https://github.com/Org/Repo/tree/main')).toBe(
      canonical
    );
    expect(canonicalGithubUrl('git@github.com:Org/Repo.git')).toBe(canonical);
    // Non-default branches are preserved.
    expect(canonicalGithubUrl('https://github.com/Org/Repo/tree/dev')).toBe(
      'https://github.com/Org/Repo/tree/dev'
    );
    // Unparseable input is returned unchanged.
    expect(canonicalGithubUrl('not a url')).toBe('not a url');
  });

  test('buildAppUrl normalizes SSH input and applies the revision', () => {
    expect(buildAppUrl('git@github.com:org/tool.git', 'v0.1.0')).toBe(
      'https://github.com/org/tool/tree/v0.1.0'
    );
    expect(buildAppUrl('https://github.com/org/tool', '')).toBe(
      'https://github.com/org/tool'
    );
    // Revision overrides a branch embedded in the URL.
    expect(buildAppUrl('https://github.com/org/tool/tree/dev', 'v1')).toBe(
      'https://github.com/org/tool/tree/v1'
    );
  });

  test('builds launch paths with slash branches in the query string', () => {
    expect(
      buildLaunchPath('org', 'tool', 'feature/my-tool', 'run', 'apps/demo')
    ).toBe(
      '/apps/launch/org/tool?branch=feature%2Fmy-tool&entryPointId=run&path=apps%2Fdemo'
    );
  });

  test('builds relaunch paths with slash branches in the query string', () => {
    expect(buildRelaunchPath('org', 'tool', 'release/2026-06', 'run')).toBe(
      '/apps/relaunch/org/tool?branch=release%2F2026-06&entryPointId=run'
    );
  });
});
