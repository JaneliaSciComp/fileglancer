/**
 * Regression test for "file viewer shows stale content after an on-disk edit".
 *
 * GET /api/content used to send Last-Modified with no Cache-Control, so the
 * browser applied heuristic freshness (~10% of the file's age): a file that
 * was old when first viewed kept its cached body for days after being edited
 * on disk.
 *
 * Deliberately NOT using fileglancer-fixture: its page.route() mock switches
 * on request interception, and Playwright then disables the browser HTTP
 * cache, which hides the very behaviour under test.
 */
import { expect, test } from '@playwright/test';
import { mkdir, rm, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const TEMP_DIR = process.env.TEST_TEMP_DIR || '/tmp/fg-playwright-test';
// File share path name the test server derives from the scratch dir.
const FSP_NAME = 'tmp_fg_playwright_test_scratch';

// The shared config asks for clipboard-write, which Firefox rejects.
test.use({ permissions: [] });

test('viewer shows an on-disk edit to an old file after refresh', async ({
  page
}) => {
  const testDir = `stale-${randomBytes(4).toString('hex')}`;
  const dir = join(TEMP_DIR, 'scratch', testDir);
  const file = join(dir, 'probe.json');
  await mkdir(dir, { recursive: true });

  try {
    // An old mtime gives the browser a long heuristic freshness window.
    await writeFile(file, JSON.stringify({ stamp: 'v1' }));
    const oldTime = Date.now() / 1000 - 400 * 24 * 3600;
    await utimes(file, oldTime, oldTime);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'Password' }).fill('playwright');
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByText('Zones').first()).toBeVisible();
    await page.goto(`/browse/${FSP_NAME}/${testDir}/probe.json`);
    const viewer = page.locator('pre code').first();
    await expect(viewer).toContainText('v1');

    await writeFile(file, JSON.stringify({ stamp: 'v2-edited-on-disk' }));
    await page.getByRole('button', { name: 'Refresh file browser' }).click();

    await expect(viewer).toContainText('v2-edited-on-disk');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
