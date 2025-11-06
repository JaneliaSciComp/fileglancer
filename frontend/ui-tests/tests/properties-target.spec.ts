import { expect, test } from '../fixtures/fileglancer-fixture';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';

test.describe('Properties Panel Navigation', () => {
  test.beforeEach(
    'Navigate to test directory',
    async ({ fileglancerPage: page }) => {
      // Verify files are visible
      await expect(
        page.getByRole('link', { name: ZARR_TEST_FILE_INFO.v2_non_ome.dirname })
      ).toBeVisible();
    }
  );

  test('properties panel persists directory info when navigating into subdirectory', async ({
    fileglancerPage: page
  }) => {
    // Verify properties panel is visible
    const propertiesPanel = page
      .locator('[role="complementary"]')
      .filter({ hasText: 'Properties' });
    await expect(propertiesPanel).toBeVisible();

    // Click on the zarr_v3_ome.zarr row (but not the link) to populate properties panel
    await page
      .getByRole('cell', { name: 'zarr_v3_ome.zarr' })
      .locator('svg')
      .click();
    // The properties panel should show the zarr directory name as the properties target
    await expect(
      propertiesPanel.getByLabel('zarr_v3_ome.zarr', { exact: true })
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
      propertiesPanel.getByLabel('zarr_v3_ome.zarr', { exact: true })
    ).toBeVisible();
  });

  test('properties panel updates when clicking a file after navigating into directory', async ({
    fileglancerPage: page
  }) => {
    // Click the zarr directory row first to populate properties panel
    await page
      .getByRole('cell', { name: 'zarr_v2_ome.zarr' })
      .locator('svg')
      .click();

    // Then double-click the link to navigate
    await page.getByRole('link', { name: 'zarr_v2_ome.zarr' }).dblclick();

    // Wait for navigation - verify subdirectory '0' is visible and zarr metadata is loaded
    await expect(page.getByText('.zattrs')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('0', { exact: true })).toBeVisible();

    const propertiesPanel = page.locator('[role="complementary"]').filter({
      has: page.getByText('Properties')
    });

    // Wait for properties panel to stabilize after navigation
    await page.waitForTimeout(300);

    // Properties should still show the zarr_v2_ome.zarr directory after navigation
    await expect(
      propertiesPanel.getByLabel('zarr_v2_ome.zarr', { exact: true })
    ).toBeVisible({ timeout: 10000 });

    // Now click on the subdirectory '0'
    await page.getByRole('cell', { name: '0' }).locator('svg').click();

    // Properties panel should update to show '0' as the target
    await expect(
      propertiesPanel.getByText('0', { exact: true }).first()
    ).toBeVisible();
  });
});
