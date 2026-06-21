import { describe, expect, test } from 'vitest';

import {
  buildLaunchPath,
  buildRelaunchPath,
  parseGithubUrl
} from '@/utils/appUrls';

describe('app URL helpers', () => {
  test('parses GitHub branch names containing slashes', () => {
    expect(
      parseGithubUrl('https://github.com/org/tool/tree/feature/my-tool')
    ).toEqual({ owner: 'org', repo: 'tool', branch: 'feature/my-tool' });
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
