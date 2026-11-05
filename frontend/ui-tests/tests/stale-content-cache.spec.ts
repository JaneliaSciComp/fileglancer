/**
 * Regression test for "file viewer shows stale content after an on-disk edit".
 *
 * GET /api/content used to send Last-Modified with no Cache-Control, so the
 * browser applied heuristic freshness (~10% of the file's age): a file that
 * was old when first viewed kept its cached body for days after being edited
 * on disk, while a fresh file updated. The endpoint now sends
 * Cache-Control: no-store; both cases must update on every refresh.
 *
 * Each step's outcome is also appended to RESULTS_FILE (default
 * $TEST_TEMP_DIR/stale-cache-results.jsonl, TEST_TEMP_DIR defaults to
 * /tmp/fg-playwright-test) so runs across browsers can be compared.
 *
 * Deliberately NOT using fileglancer-fixture: its page.route() mock switches
 * on request interception, and Playwright then disables the browser HTTP
 * cache (Network.setCacheDisabled / Page.setCacheDisabled), which hides the
 * very behaviour under test.
 *
 * Run:
 *   cd frontend/ui-tests
 *   pixi run npx playwright test stale-content-cache --browser=chromium
 *   pixi run npx playwright test stale-content-cache --browser=firefox
 */
import { expect, test } from '@playwright/test';
import { appendFile, mkdir, rm, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const DAY = 24 * 3600;
const TEMP_DIR = process.env.TEST_TEMP_DIR || '/tmp/fg-playwright-test';
const SCRATCH = join(TEMP_DIR, 'scratch');
// File share path name the test server derives from the scratch dir.
const FSP_NAME = 'tmp_fg_playwright_test_scratch';
// Outside test-results/, which Playwright wipes at the start of every run.
const RESULTS_FILE =
  process.env.RESULTS_FILE || join(TEMP_DIR, 'stale-cache-results.jsonl');

// The shared config asks for clipboard-write, which Firefox rejects.
test.use({ permissions: [] });

const CASES = [
  { label: 'old mtime (400 days)', ageSec: 400 * DAY },
  { label: 'fresh mtime (now)', ageSec: 0 }
];

type Observed = {
  status: number;
  lastModified?: string;
  cacheControl?: string;
};

for (const c of CASES) {
  test(`viewer after on-disk edit: ${c.label}`, async ({ page }) => {
    test.setTimeout(90_000);
    const testDir = `stale-${randomBytes(4).toString('hex')}`;
    const dir = join(SCRATCH, testDir);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'probe.json');

    try {
      // v1 on disk, with the mtime under test. Done before the first view.
      await writeFile(file, JSON.stringify({ stamp: 'v1' }));
      const t = Date.now() / 1000 - c.ageSec;
      await utimes(file, t, t);

      // Record every GET /api/content response the page sees.
      const seen: Observed[] = [];
      page.on('response', r => {
        if (
          r.url().includes('/api/content/') &&
          r.request().method() === 'GET'
        ) {
          const h = r.headers();
          seen.push({
            status: r.status(),
            lastModified: h['last-modified'],
            cacheControl: h['cache-control']
          });
        }
      });

      // Log in (no OKTA on the test server), then open the file directly.
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('textbox', { name: 'Username' }).fill('testUser');
      await page.getByRole('button', { name: 'Log In' }).click();
      await page.waitForSelector('text=Zones', { timeout: 10000 });
      await page.goto(`/browse/${FSP_NAME}/${testDir}/probe.json`);
      const viewer = page.locator('pre code').first();
      await expect(viewer).toContainText('v1');
      const requestsAfterFirstView = seen.length;

      // Edit on disk. Different length, so even an mtime-collision ETag differs.
      await writeFile(file, JSON.stringify({ stamp: 'v2-edited-on-disk' }));

      const results: Record<string, string> = {};
      const observe = async (step: string) => {
        await page.waitForTimeout(1500);
        const txt = await viewer.innerText().catch(() => '');
        results[step] = txt.includes('v2')
          ? 'updated'
          : txt.includes('v1')
            ? 'STALE'
            : `unknown: ${txt.slice(0, 60)}`;
      };

      // 1. Toolbar refresh: invalidates the TanStack query, so a fetch() is
      //    issued; whether it reaches the server is up to the HTTP cache.
      const before1 = seen.length;
      await page.getByRole('button', { name: 'Refresh file browser' }).click();
      await observe('toolbar refresh');
      results['toolbar refresh: new GET responses'] = String(
        seen.length - before1
      );

      // 2. Full page reload (F5 equivalent).
      const before2 = seen.length;
      await page.reload({ waitUntil: 'networkidle' });
      await expect(viewer).toBeVisible();
      await observe('page reload');
      results['page reload: new GET responses'] = String(seen.length - before2);

      // 3. Navigate away and back inside the SPA.
      const before3 = seen.length;
      await page.getByRole('link', { name: testDir }).first().click();
      await page.getByRole('link', { name: 'probe.json' }).click();
      await observe('spa away-and-back');
      results['spa away-and-back: new GET responses'] = String(
        seen.length - before3
      );

      const record = {
        when: new Date().toISOString(),
        browser: test.info().project.name || process.env.BROWSER || 'default',
        case: c.label,
        requestsAfterFirstView,
        results,
        responses: seen
      };
      console.log(JSON.stringify(record, null, 2));
      await appendFile(RESULTS_FILE, JSON.stringify(record) + '\n');
      await test.info().attach('stale-cache-results', {
        body: JSON.stringify(record, null, 2),
        contentType: 'application/json'
      });

      expect(results['toolbar refresh'], 'toolbar refresh').toBe('updated');
      expect(results['page reload'], 'page reload').toBe('updated');
      // Served from the TanStack cache within staleTime; not an HTTP cache
      // step, but it must still show the body fetched by the reload above.
      expect(results['spa away-and-back'], 'spa away-and-back').toBe('updated');
      for (const r of seen) {
        expect(r.cacheControl, 'Cache-Control on GET /api/content').toBe(
          'no-store'
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
