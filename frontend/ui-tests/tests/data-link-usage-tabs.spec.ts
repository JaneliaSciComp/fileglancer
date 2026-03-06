import { expect, test } from '../fixtures/fileglancer-fixture';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';

import type { Page } from '@playwright/test';

/**
 * Helper: select a directory row by clicking its Type column (avoids navigating into it),
 * create a data link via the properties panel toggle, then open the DataLinkUsage dialog.
 * Returns the dialog locator for further assertions.
 */
async function openDataLinkUsageDialog(page: Page, dirName: string) {
  const propertiesPanel = page
    .locator('[role="complementary"]')
    .filter({ hasText: 'Properties' });

  // Click the row's Type column to select the directory without navigating in
  const row = page.getByRole('row').filter({ hasText: dirName });
  await row.getByText('Folder', { exact: true }).click();

  // Wait for properties panel to show the directory name
  await expect(propertiesPanel.getByText(dirName, { exact: true })).toBeVisible(
    { timeout: 10000 }
  );

  // Wait for the data link toggle to appear and create a data link
  const dataLinkToggle = propertiesPanel.getByRole('checkbox', {
    name: /data link/i
  });
  await expect(dataLinkToggle).toBeVisible({ timeout: 10000 });
  await dataLinkToggle.click();

  // Confirm data link creation in the dialog
  const confirmButton = page.getByRole('button', {
    name: /confirm|create|yes/i
  });
  await expect(confirmButton).toBeVisible({ timeout: 5000 });
  await confirmButton.click();

  await expect(page.getByText('Data link created successfully')).toBeVisible();

  // Click "How to use your data link" button
  const usageButton = propertiesPanel.getByRole('button', {
    name: 'How to use your data link'
  });
  await expect(usageButton).toBeVisible({ timeout: 10000 });
  await usageButton.click();

  // Wait for the DataLinkUsage dialog to open and tabs to load
  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: 'How to use your data link' });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog.getByRole('tab').first()).toBeVisible({ timeout: 10000 });
}

/**
 * Get all visible tab names from the DataLinkUsage dialog.
 */
async function getTabNames(page: Page): Promise<string[]> {
  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: 'How to use your data link' });
  const tabs = dialog.getByRole('tab');
  const count = await tabs.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).textContent();
    if (text) names.push(text.trim());
  }
  return names;
}

test.describe('DataLinkUsage Dialog Tabs', () => {
  test('Regular directory shows Java and Python tabs', async ({
    fileglancerPage: page
  }) => {
    await openDataLinkUsageDialog(page, ZARR_TEST_FILE_INFO.plain_dir.dirname);
    const tabs = await getTabNames(page);
    expect(tabs).toEqual(expect.arrayContaining(['Java', 'Python']));
    expect(tabs).toHaveLength(2);
  });

  test('Zarr v2 array shows Java, N5 Viewer, and Python tabs', async ({
    fileglancerPage: page
  }) => {
    await openDataLinkUsageDialog(page, ZARR_TEST_FILE_INFO.v2_non_ome.dirname);
    const tabs = await getTabNames(page);
    expect(tabs).toEqual(
      expect.arrayContaining(['Java', 'N5 Viewer', 'Python'])
    );
    expect(tabs).toHaveLength(3);
  });

  test('Zarr v3 array shows Java and Python tabs', async ({
    fileglancerPage: page
  }) => {
    await openDataLinkUsageDialog(page, ZARR_TEST_FILE_INFO.v3_non_ome.dirname);
    const tabs = await getTabNames(page);
    expect(tabs).toEqual(expect.arrayContaining(['Java', 'Python']));
    expect(tabs).toHaveLength(2);
  });

  test('OME-Zarr v0.4 (Zarr v2) shows Java, N5 Viewer, Napari, Python, and VVDViewer tabs', async ({
    fileglancerPage: page
  }) => {
    await openDataLinkUsageDialog(page, ZARR_TEST_FILE_INFO.v2_ome.dirname);
    const tabs = await getTabNames(page);
    expect(tabs).toEqual(
      expect.arrayContaining([
        'Java',
        'N5 Viewer',
        'Napari',
        'Python',
        'VVDViewer'
      ])
    );
    expect(tabs).toHaveLength(5);
  });

  test('OME-Zarr v0.5 (Zarr v3) shows Java, Napari, and Python tabs', async ({
    fileglancerPage: page
  }) => {
    await openDataLinkUsageDialog(page, ZARR_TEST_FILE_INFO.v3_ome.dirname);
    const tabs = await getTabNames(page);
    expect(tabs).toEqual(expect.arrayContaining(['Java', 'Napari', 'Python']));
    expect(tabs).toHaveLength(3);
  });

  test('N5 dataset shows Java, N5 Viewer, and Python tabs', async ({
    fileglancerPage: page
  }) => {
    await openDataLinkUsageDialog(page, ZARR_TEST_FILE_INFO.n5.dirname);
    const tabs = await getTabNames(page);
    expect(tabs).toEqual(
      expect.arrayContaining(['Java', 'N5 Viewer', 'Python'])
    );
    expect(tabs).toHaveLength(3);
  });
});
