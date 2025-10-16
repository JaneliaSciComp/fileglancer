import { expect, test } from '@playwright/test';
import {
  openFileglancer,
  mockAPI,
  teardownMockAPI,
  createTestFilesInScratchDir
} from './testutils.ts';

test.beforeEach('Recreate test files before each test', async () => {
  // Recreate test files before each test (since operations may modify/delete them)
  await createTestFilesInScratchDir();
});

test.beforeEach('setup API endpoints BEFORE opening page', async ({ page }) => {
  // CRITICAL: Set up mocks BEFORE navigating to make sure they are registered before any requests are made
  await mockAPI(page);
});

test.beforeEach('Open Fileglancer', async ({ page }) => {
  await openFileglancer(page);
});

test.afterEach(async ({ page }) => {
  await teardownMockAPI(page);
});

test('favor entire zone with reload page', async ({ page }) => {
  // When using file_share_mounts, backend creates a "Local" zone with storage names = "local"
  // Navigate to Local zone
  await page.getByText('Local', { exact: true }).click();

  // Wait for storage paths to be visible
  // The backend creates storage entries with name "local" for each mount point
  const storageLinks = await page.getByRole('link', { name: /local/i }).all();

  // We should see 3 storage paths (home, primary, scratch)
  expect(storageLinks.length).toBeGreaterThanOrEqual(1);

  // Click on the scratch path (the third one in our list)
  await page.getByRole('link', { name: /scratch/i }).click();

  // Wait for files to load - verify f1 is visible (the real backend will provide actual file data)
  await expect(page.getByText('f1')).toBeVisible();

  // Favor entire Local zone by clicking star btn within Local zone header btn
  await page.getByRole('button', { name: 'Local' }).getByRole('button').click();

  // Test that Local now shows in the favorites
  const localFavorite = page.getByLabel('Favorites list').getByRole('button', {
    name: 'Local'
  });
  await expect(localFavorite).toBeVisible();

  // Reload page to verify favorites persist
  await page.reload();
  await expect(localFavorite).toBeVisible();
});
