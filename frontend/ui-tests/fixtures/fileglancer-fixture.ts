import { test as base, Page } from '@playwright/test';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm, mkdir } from 'fs/promises';
import { navigateToScratchFsp, navigateToTestDir } from '../utils/navigation';
import { mockAPI, teardownMockAPI } from '../mocks/api';
import { writeFiles } from '../mocks/files';
import { createZarrDirs } from '../mocks/zarrDirs';
import { cleanDatabase } from '../utils/db-cleanup';
import { randomBytes } from 'crypto';

export type FileglancerFixtures = {
  fileglancerPage: Page;
  testDir: string;
};

const openFileglancer = async (page: Page) => {
  // Navigate directly to Fileglancer standalone app
  await page.goto('/', {
    waitUntil: 'domcontentloaded'
  });
  // Wait for the app to be ready
  await page.waitForSelector('text=Log In', { timeout: 10000 });

  // Perform login
  const loginForm = page.getByRole('textbox', { name: 'Username' });
  const loginSubmitBtn = page.getByRole('button', { name: 'Log In' });
  await loginForm.fill('testUser');
  await loginSubmitBtn.click();

  // Wait for the main UI to load
  await page.waitForSelector('text=Zones', { timeout: 10000 });
};

/**
 * Custom Playwright fixture that handles setup and teardown for Fileglancer tests.
 *
 * This fixture:
 * 1. Creates a unique directory for each test within the shared scratch path
 * 2. Populates the test directory with fresh test files
 * 3. Sets up API mocks before navigating to the page
 * 4. Opens Fileglancer and performs login
 * 5. Navigates to the test-specific directory
 * 6. Tears down API mocks and cleans up the test directory after each test
 *
 * This approach ensures test isolation while maintaining the same base file share path
 * that was registered with the server at startup.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from '../fixtures/fileglancer-fixture';
 *
 * test('my test', async ({ fileglancerPage: page, testDir }) => {
 *   // Page is ready with mocks and login completed
 *   // Already navigated to the test-specific directory
 *   await expect(page.getByText('zarr_v3_array.zarr')).toBeVisible();
 * });
 * ```
 */
export const test = base.extend<FileglancerFixtures>({
  testDir: async ({}, use) => {
    // Create unique directory for this test
    const scratchDir = join(global.testTempDir, 'scratch');
    const uniqueId = randomBytes(8).toString('hex');
    const testDir = `test-${uniqueId}`;
    const fullPath = join(scratchDir, testDir);

    console.log(`[Fixture] Creating unique test directory: ${fullPath}`);

    // Create test directory and populate with files
    await mkdir(fullPath, { recursive: true });
    await writeFiles(fullPath);
    await createZarrDirs(fullPath);

    // Provide test directory NAME (not full path) to the test
    await use(testDir);

    // Cleanup test directory after test completes
    console.log(`[Fixture] Cleaning up test directory: ${fullPath}`);
    if (existsSync(fullPath)) {
      await rm(fullPath, { recursive: true, force: true });
    }
  },

  fileglancerPage: async ({ page, testDir }, use) => {
    // Setup - Clean database before test
    const fullTestPath = join(global.testTempDir, 'scratch', testDir);
    console.log(`[Fixture] Test temp dir: ${global.testTempDir}`);
    console.log(`[Fixture] Test directory: ${fullTestPath}`);

    // Clean user-specific database tables
    cleanDatabase(global.testTempDir);

    await mockAPI(page);
    await openFileglancer(page);
    await navigateToScratchFsp(page);
    await navigateToTestDir(page, fullTestPath);

    // Provide the page to the test
    await use(page);

    // Teardown - wait for any pending operations before cleanup
    await teardownMockAPI(page);
    await page.waitForTimeout(100);
  }
});

export { expect } from '@playwright/test';
