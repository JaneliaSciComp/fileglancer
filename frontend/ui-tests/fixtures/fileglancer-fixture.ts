import { test as base, Page, expect } from '@playwright/test';
import { mockAPI, teardownMockAPI } from '../mocks/api';

export type FileglancerFixtures = {
  fileglancerPage: Page;
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

const navigateToScratchDir = async (page: Page) => {
  // Navigate to Local zone - find it under Zones, not in Favorites
  const localZone = page
    .getByLabel('List of file share paths')
    .getByRole('button', { name: 'Local' });
  await localZone.click();

  const scratchFsp = page
    .getByRole('link', { name: /scratch/i })
    .filter({ hasNotText: 'zarr' });

  await expect(scratchFsp).toBeVisible();

  // Wait for file directory to load
  await scratchFsp.click();
  await expect(page.getByText('Name', { exact: true })).toBeVisible();
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
 * Usage:
 * ```typescript
 * import { test, expect } from '../fixtures/fileglancer-fixture';
 *
 * test('my test', async ({ fileglancerPage: page }) => {
 *   // Page is ready with mocks and login completed
 *   await expect(page.getByText('zarr_v3_array.zarr')).toBeVisible();
 * });
 * ```
 */
export const test = base.extend<FileglancerFixtures>({
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
