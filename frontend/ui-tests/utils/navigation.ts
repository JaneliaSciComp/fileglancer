import { Page, expect } from '@playwright/test';

const navigateToScratchFsp = async (page: Page) => {
  // Navigate to Local zone - find it under Zones, not in Favorites
  const localZone = page
    .getByLabel('List of file share paths')
    .getByRole('button', { name: 'Local' });
  await localZone.click();

  // Wait for the zone to expand and show the scratch FSP
  // Don't just wait for page load - wait for the actual link to appear
  const scratchFsp = page
    .getByRole('link', { name: /scratch/i })
    .filter({ hasNotText: 'zarr' })
    .nth(0);

  await expect(scratchFsp).toBeVisible({ timeout: 10000 });

  // Wait for file directory to load
  await scratchFsp.click();
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  await expect(page.getByText('Name', { exact: true })).toBeVisible();
};

const navigateToTestDir = async (page: Page, testDir: string) => {
  // Navigate to the test-specific directory
  const testDirName = testDir.split('/').pop();
  console.log(`[Fixture] Navigating to test directory: ${testDirName}`);
  const testDirLink = page.getByRole('link', { name: testDirName });
  await testDirLink.click();
  await page.waitForLoadState('domcontentloaded');
};

export { navigateToScratchFsp, navigateToTestDir };
