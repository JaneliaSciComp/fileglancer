import { expect, test } from '../fixtures/fileglancer-fixture';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';
import { navigateToScratchDir } from '../utils';

const navigateBackToZarrDir = async (page: any, zarrDirName: string) => {
  // Navigate back to the zarr directory to check data link status; the above click takes you to Neuroglancer
  await page.goto('/fg/browse', {
    waitUntil: 'domcontentloaded'
  });
  await navigateToScratchDir(page);
  await page.getByText(zarrDirName).click();
};

test.describe('Data Link Operations', () => {
  test.beforeEach(
    'Wait for Zarr directories to load',
    async ({ fileglancerPage: page }) => {
      await expect(
        page.getByText(ZARR_TEST_FILE_INFO.v3_ome.dirname)
      ).toBeVisible();
    }
  );

  test('Create data link via viewer icon, delete via properties panel, recreate via properties panel, then delete via links page', async ({
    fileglancerPage: page
  }) => {
    const zarrDirName = ZARR_TEST_FILE_INFO.v3_ome.dirname;
    await page.getByText(zarrDirName).click();
    await expect(
      page.getByRole('link', { name: 'Neuroglancer logo' })
    ).toBeVisible();

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

      // Navigate back to the zarr directory to check data link status; the above click takes you to Neuroglancer
      await navigateBackToZarrDir(page, zarrDirName);

      // Look for the "Data Link" toggle in the properties panel to be checked
      await expect(dataLinkToggle).toBeVisible();
      await expect(dataLinkToggle).toBeChecked({ timeout: 10000 });
    });

    // Step 2
    await test.step('Delete data link via properties panel', async () => {
      await dataLinkToggle.click();
      await expect(confirmDeleteButton).toBeVisible({ timeout: 5000 });
      await confirmDeleteButton.click();
      await expect(dataLinkToggle).not.toBeChecked({ timeout: 10000 });
    });

    // Step 3
    await test.step('Recreate data link via properties panel', async () => {
      await dataLinkToggle.click();
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();
      // Navigate back to the zarr directory to check data link status; the above click takes you to Neuroglancer
      await navigateBackToZarrDir(page, zarrDirName);
      await expect(dataLinkToggle).toBeChecked({ timeout: 10000 });
    });

    // Step 4
    await test.step('Delete the link via action menu on links page', async () => {
      const linksNavButton = page.getByRole('link', { name: /links/i });
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
      if (await confirmDeleteButton.isVisible()) {
        await confirmDeleteButton.click();
      }

      // Verify the link is removed from the table
      await expect(linkRow).not.toBeVisible({ timeout: 10000 });
    });
  });
});
