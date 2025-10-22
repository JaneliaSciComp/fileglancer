import { Page, expect } from '@playwright/test';

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
export { navigateToScratchDir };
