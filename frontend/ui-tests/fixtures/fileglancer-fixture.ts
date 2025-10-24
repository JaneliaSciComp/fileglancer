import { test as base, Page, expect } from '@playwright/test';
import { navigateToScratchDir } from '../utils';
import { mockAPI, teardownMockAPI } from '../mocks/api';
import { resetTestFiles } from './reset-files';

export type FileglancerFixtures = {
  fileglancerPage: Page;
  freshFiles: void;
};

const openFileglancer = async (page: Page) => {
  // Navigate directly to Fileglancer standalone app
  await page.goto('/fg/', {
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
 * 1. Sets up API mocks before navigating to the page
 * 2. Opens Fileglancer and performs login
 * 3. Tears down API mocks after each test
 *
 * Note: Files for testing are created in playwright.config.ts before the server starts.
 * This ensures the server sees the files when it initializes.
 *
 * Additional fixtures:
 * - `freshFiles`: Resets test files to their initial state before each test. Use this
 *   when you need test isolation and want to ensure files haven't been modified by
 *   previous tests.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from '../fixtures/fileglancer-fixture';
 *
 * // Basic usage - files may have been modified by previous tests
 * test('my test', async ({ fileglancerPage: page }) => {
 *   // Page is ready with mocks and login completed
 *   await expect(page.getByText('zarr_v3_array.zarr')).toBeVisible();
 * });
 *
 * // With fresh files - guarantees clean state
 * test('my test', async ({ fileglancerPage: page, freshFiles }) => {
 *   // Files have been reset to initial state
 *   await expect(page.getByText('f1')).toBeVisible();
 * });
 * ```
 */
export const test = base.extend<FileglancerFixtures>({
  freshFiles: async ({}, use) => {
    // Reset test files before the test runs
    await resetTestFiles();
    await use();
  },

  fileglancerPage: async ({ page }, use) => {
    // Setup
    await mockAPI(page);
    await openFileglancer(page);
    await navigateToScratchDir(page);

    // Provide the page to the test
    await use(page);

    // Teardown
    await teardownMockAPI(page);
  }
});

export { expect } from '@playwright/test';
