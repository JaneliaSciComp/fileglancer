import { expect, test } from '../fixtures/fileglancer-fixture';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';
import { navigateToScratchFsp, navigateToTestDir } from '../utils/navigation';

const navigateToZarrDir = async (
  page: any,
  testDir: string,
  zarrDirName: string
) => {
  await page.goto('/browse', {
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
    await expect(page.getByAltText(/neuroglancer/i)).toBeVisible();

    const dataLinkToggle = page.getByRole('checkbox', { name: /data link/i });
    const confirmButton = page.getByRole('button', {
      name: /confirm|create|yes/i
    });
    const confirmDeleteButton = page.getByRole('button', {
      name: /delete/i
    });

    await test.step('Turn on automatic data links via the data link dialog', async () => {
      const neuroglancerLink = page.getByAltText(/neuroglancer/i);
      await neuroglancerLink.click();

      // Confirm the data link creation in the dialog
      await expect(confirmButton).toBeVisible({ timeout: 5000 });

      // Enable automatic data links
      const autoLinkCheckbox = page.getByRole('checkbox', {
        name: 'Enable automatic data link creation'
      });
      await autoLinkCheckbox.click();
      await expect(autoLinkCheckbox).toBeChecked();
      await expect(
        page.getByText('Enabled automatic data links')
      ).toBeVisible();
    });

    await test.step('Create data link via data link dialog', async () => {
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

    await test.step('Delete data link via properties panel', async () => {
      await dataLinkToggle.click();
      await expect(confirmDeleteButton).toBeVisible({ timeout: 5000 });
      await confirmDeleteButton.click();
      await expect(
        page.getByText('Successfully deleted data link')
      ).toBeVisible();
      await expect(dataLinkToggle).not.toBeChecked({ timeout: 10000 });
    });

    await test.step('Recreate data link via properties panel', async () => {
      await expect(
        page.getByText('Successfully deleted data link')
      ).not.toBeVisible({ timeout: 10000 });
      await dataLinkToggle.click();

      // Navigate back to the zarr directory to check data link status; the above click takes you to Neuroglancer
      await navigateToZarrDir(page, testDir, zarrDirName);
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      await expect(dataLinkToggle).toBeChecked({ timeout: 10000 });
    });

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

    await test.step('Copy link works when automatic links is on and no data link exists yet', async () => {
      await navigateToZarrDir(page, testDir, zarrDirName);
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      await expect(page.getByText('zarr.json')).toBeVisible({ timeout: 10000 });

      const copyLinkIcon = page.getByRole('button', { name: 'Copy data URL' });
      await expect(copyLinkIcon).toBeVisible({ timeout: 10000 });

      await copyLinkIcon.click();
      await expect(page.getByText('Copied!')).toBeVisible();
      await expect(
        page.getByText('Data link created successfully')
      ).toBeVisible();
    });
  });

  test('Data link created for subdirectory clicked from parent shows subdirectory name', async ({
    fileglancerPage: page
  }) => {
    const zarrDirName = ZARR_TEST_FILE_INFO.v3_ome.dirname;

    const propertiesPanel = page
      .locator('[role="complementary"]')
      .filter({ hasText: 'Properties' });

    // Click the row's Type column to select the subdirectory without navigating in
    const zarrRow = page.getByRole('row').filter({ hasText: zarrDirName });
    await zarrRow.getByText('Folder', { exact: true }).click();

    // Wait for properties panel to show the subdirectory name
    await expect(
      propertiesPanel.getByText(zarrDirName, { exact: true })
    ).toBeVisible({ timeout: 10000 });

    // Wait for the data link toggle to appear
    const dataLinkToggle = propertiesPanel.getByRole('checkbox', {
      name: /data link/i
    });
    await expect(dataLinkToggle).toBeVisible({ timeout: 10000 });

    // Click the toggle to create a data link
    await dataLinkToggle.click();

    // Confirm in dialog
    const confirmButton = page.getByRole('button', {
      name: /confirm|create|yes/i
    });
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    await expect(
      page.getByText('Data link created successfully')
    ).toBeVisible();

    // Navigate to the Data links page
    const linksNavButton = page.getByRole('link', { name: 'Data links' });
    await linksNavButton.click();

    await expect(page.getByRole('heading', { name: /links/i })).toBeVisible();

    // Verify the data link has the subdirectory name, not the parent directory name
    const linkRow = page.getByText(zarrDirName, { exact: true });
    await expect(linkRow).toBeVisible({ timeout: 10000 });
  });

  test('Viewer icon creates data link for current directory even when subdirectory row is selected', async ({
    fileglancerPage: page,
    testDir
  }) => {
    const zarrDirName = ZARR_TEST_FILE_INFO.v3_ome.dirname;

    // Navigate into the zarr directory
    await page.getByRole('link', { name: zarrDirName }).click();
    await expect(page.getByText('zarr.json')).toBeVisible({ timeout: 10000 });
    await expect(page.getByAltText(/neuroglancer/i)).toBeVisible();

    // Click on the s0 subdirectory row to select it as the properties target
    const s0Row = page.getByRole('row').filter({ hasText: 's0' });
    await s0Row.getByText('Folder', { exact: true }).click();

    // Verify s0 is selected in properties panel
    const propertiesPanel = page
      .locator('[role="complementary"]')
      .filter({ hasText: 'Properties' });
    await expect(propertiesPanel.getByText('s0', { exact: true })).toBeVisible({
      timeout: 10000
    });

    // Click the Neuroglancer viewer icon — this should create a data link
    // for the zarr directory (currentFileOrFolder), not for s0 (propertiesTarget)
    const neuroglancerLink = page.getByAltText(/neuroglancer/i);
    await neuroglancerLink.click();

    // Confirm in dialog
    const confirmButton = page.getByRole('button', {
      name: /confirm|create|yes/i
    });
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    await expect(
      page.getByText('Data link created successfully')
    ).toBeVisible();

    // Navigate back to check the data link on the links page
    await page.goto('/browse', { waitUntil: 'domcontentloaded' });
    const linksNavButton = page.getByRole('link', { name: 'Data links' });
    await linksNavButton.click();

    await expect(page.getByRole('heading', { name: /links/i })).toBeVisible();

    // The data link should be for the zarr directory, not the s0 subdirectory
    await expect(page.getByText(zarrDirName, { exact: true })).toBeVisible({
      timeout: 10000
    });
    await expect(page.getByText('s0', { exact: true })).not.toBeVisible();
  });
});
