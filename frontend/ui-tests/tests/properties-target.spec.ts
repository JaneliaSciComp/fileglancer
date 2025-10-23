import { expect, test } from '../fixtures/fileglancer-fixture';

test.describe('Properties Panel Navigation', () => {
  test.beforeEach(
    'Navigate to test directory',
    async ({ fileglancerPage: page }) => {
      // Wait for files to load - verify f1 is visible
      await expect(page.getByText('f1')).toBeVisible();
    }
  );

  test('properties panel persists directory info when navigating into subdirectory', async ({
    fileglancerPage: page
  }) => {
    await expect(page.getByText('zarr_v3_ome.zarr')).toBeVisible();
    // Verify properties panel is visible
    const propertiesPanel = page
      .locator('[role="complementary"]')
      .filter({ hasText: 'Properties' });
    await expect(propertiesPanel).toBeVisible();

    // Click on the zarr_v3_ome.zarr row (but not the link) to populate properties panel
    await page
      .getByRole('row', { name: 'zarr_v3_ome.zarr Folder Oct' })
      .getByRole('cell')
      .nth(2)
      .click();
    // The properties panel should show the zarr directory name as the properties target
    await expect(
      propertiesPanel.getByText('zarr_v3_ome.zarr', { exact: true })
    ).toBeVisible();

    // Now navigate into the zarr_v3_ome.zarr directory
    await page
      .getByRole('link')
      .filter({ hasText: 'zarr_v3_ome.zarr' })
      .dblclick();
    // Wait for navigation - verify subdirectory 's0' is visible
    await expect(page.getByText('s0')).toBeVisible();
    // The properties panel should still show the zarr_v3_ome.zarr as the target
    await expect(
      propertiesPanel.getByText('zarr_v3_ome.zarr', { exact: true })
    ).toBeVisible();
  });

  test('properties panel updates when clicking a file after navigating into directory', async ({
    fileglancerPage: page
  }) => {
    await page.getByText('zarr_v2_ome.zarr').dblclick();
    // Wait for navigation - verify subdirectory '0' is visible
    await expect(page.getByText('0', { exact: true })).toBeVisible();

    const propertiesPanel = page.locator('[role="complementary"]').filter({
      has: page.getByText('Properties')
    });
    // Initially, properties should show the zarr_v2_ome.zarr directory
    await expect(
      propertiesPanel.getByText('zarr_v2_ome.zarr', { exact: true })
    ).toBeVisible();

    // Now click on the subdirectory '0'
    await page
      .getByRole('row', { name: '0 Folder Oct' })
      .getByRole('cell')
      .nth(2)
      .click();

    // Properties panel should update to show '0' as the target
    await expect(
      propertiesPanel.getByText('0', { exact: true }).first()
    ).toBeVisible();
  });
});
