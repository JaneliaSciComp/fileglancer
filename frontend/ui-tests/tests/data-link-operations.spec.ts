import { expect, test } from '../fixtures/fileglancer-fixture';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';
import { navigateToScratchFsp, navigateToTestDir } from '../utils/navigation';

const navigateToZarrDir = async (
  page: any,
  testDir: string,
  zarrDirName: string
) => {
  await page.goto('/fg/browse', {
    waitUntil: 'domcontentloaded'
  });
  await navigateToScratchFsp(page);
  const testDirName = testDir.split('/').pop() || testDir;
  const fullTestPath = testDirName.startsWith('test-')
    ? global.testTempDir + '/scratch/' + testDirName
    : testDir;
  await navigateToTestDir(page, fullTestPath);
  await page.getByRole('link', { name: zarrDirName }).click();
  // Wait for zarr metadata to load
  await page.waitForSelector('text=zarr.json', { timeout: 10000 });
};

test.describe('Data Link Operations', () => {
  test.beforeEach(
    'Wait for Zarr directories to load',
    async ({ fileglancerPage: page }) => {
      await expect(
        page.getByRole('link', { name: ZARR_TEST_FILE_INFO.v3_ome.dirname })
      ).toBeVisible();
    }
  );

  test('Create data link via viewer icon, delete via properties panel, recreate via properties panel, then delete via links page', async ({
    fileglancerPage: page,
    testDir
  }) => {
    const zarrDirName = ZARR_TEST_FILE_INFO.v3_ome.dirname;
    await page.getByRole('link', { name: zarrDirName }).click();

    // Wait for zarr metadata to load
    await expect(page.getByText('zarr.json')).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('link', { name: 'Neuroglancer logo' })
    ).toBeVisible({ timeout: 10000 });

    const dataLinkToggle = page.getByRole('checkbox', { name: /data link/i });
    const confirmButton = page.getByRole('button', {
      name: /confirm|create|yes/i
    });
    const confirmDeleteButton = page.getByRole('button', {
      name: /delete/i
    });

    // Step 1
    await test.step('Create data link via viewer icon', async () => {
      const neuroglancerLink = page.getByRole('link', {
        name: 'Neuroglancer logo'
      });
      await neuroglancerLink.click();

      // Confirm the data link creation in the dialog
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();
      await expect(
        page.getByText('Data link created successfully')
      ).toBeVisible();

      // Navigate back to the zarr directory to check data link status; the above click takes you to Neuroglancer
      await navigateToZarrDir(page, testDir, zarrDirName);

      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      // Look for the "Data Link" toggle in the properties panel to be checked, after the page has loaded sufficiently
      await expect(page.getByRole('img', { name: 'Thumbnail' })).toBeVisible({
        timeout: 20000
      });

      await expect(dataLinkToggle).toBeChecked({ timeout: 20000 });
    });

    // Step 2
    await test.step('Delete data link via properties panel', async () => {
      await dataLinkToggle.click();
      await expect(confirmDeleteButton).toBeVisible({ timeout: 5000 });
      await confirmDeleteButton.click();
      await expect(
        page.getByText('Successfully deleted data link')
      ).toBeVisible();
      await expect(dataLinkToggle).not.toBeChecked({ timeout: 10000 });
    });

    // Step 3
    await test.step('Recreate data link via properties panel', async () => {
      await expect(
        page.getByText('Successfully deleted data link')
      ).not.toBeVisible({ timeout: 10000 });
      await dataLinkToggle.click();
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();
      // Navigate back to the zarr directory to check data link status; the above click takes you to Neuroglancer
      await navigateToZarrDir(page, testDir, zarrDirName);

      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      await expect(dataLinkToggle).toBeChecked({ timeout: 10000 });
    });

    // Step 4
    await test.step('Delete the link via action menu on links page', async () => {
      const linksNavButton = page.getByRole('link', { name: 'Data links' });
      await linksNavButton.click();

      await expect(page.getByRole('heading', { name: /links/i })).toBeVisible();
      const linkRow = page.getByText(zarrDirName, { exact: true });
      await expect(linkRow).toBeVisible();

      const actionMenuButton = page
        .getByTestId('data-link-actions-cell')
        .getByRole('button');
      await actionMenuButton.click();
      const deleteLinkOption = page.getByRole('menuitem', { name: /unshare/i });
      await deleteLinkOption.click();
      // Confirm deletion
      await expect(confirmDeleteButton).toBeVisible({ timeout: 10000 });
      await confirmDeleteButton.click();

      // Verify the link is removed from the table
      await expect(linkRow).not.toBeVisible({ timeout: 10000 });
    });
  });
});
