import { expect, test } from '../fixtures/fileglancer-fixture';
import { join } from 'path';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';

test.describe('Navigation Input', () => {
  test.beforeEach('Navigate to browse', async ({ fileglancerPage: page }) => {
    await page.goto('/browse', {
      waitUntil: 'domcontentloaded'
    });
  });

  test('navigate to test directory', async ({
    fileglancerPage: page,
    testDir
  }) => {
    const testDirFullPath = join(global.testTempDir, 'scratch', testDir);

    // The navigation input should be visible in the main panel
    const navigationInput = page.getByRole('textbox', {
      name: /path\/to\/folder/i
    });
    await expect(navigationInput).toBeVisible();

    // Fill in the test path
    await navigationInput.fill(testDirFullPath);

    // Click the Go button
    const goButton = page.getByRole('button', { name: /^Go$/i });
    await goButton.click();

    // Verify we navigated to the test directory and can see the test files
    await expect(
      page.getByRole('link', {
        name: ZARR_TEST_FILE_INFO.v3_non_ome.dirname
      })
    ).toBeVisible({ timeout: 10000 });
  });

  test('navigate to subfolder within scratch', async ({
    fileglancerPage: page,
    testDir
  }) => {
    const testDirFullPath = join(global.testTempDir, 'scratch', testDir);
    const subfolderPath = join(
      testDirFullPath,
      ZARR_TEST_FILE_INFO.v2_ome.dirname
    );

    const navigationInput = page.getByRole('textbox', {
      name: /path\/to\/folder/i
    });

    // Navigate to the subfolder
    await navigationInput.fill(subfolderPath);
    await navigationInput.press('Enter');

    // Verify we're viewing the zarr v2 ome zarr contents
    // Only Zarr type to have .zattrs file at top level
    await expect(page.getByText('.zattrs')).toBeVisible({ timeout: 10000 });
  });

  test('show error toast for invalid path', async ({
    fileglancerPage: page
  }) => {
    const navigationInput = page.getByRole('textbox', {
      name: /path\/to\/folder/i
    });

    // Try to navigate to a non-existent path
    await navigationInput.fill('/nonexistent/path/that/does/not/exist');

    const goButton = page.getByRole('button', { name: /^Go$/i });
    await goButton.click();

    // Wait for error toast to appear
    // react-hot-toast shows error messages
    await expect(
      page.locator('[role="status"], [role="alert"]').filter({
        hasText: /.+/
      })
    ).toBeVisible({ timeout: 5000 });
  });
});
