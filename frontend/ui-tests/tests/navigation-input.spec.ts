import { expect, test } from '../fixtures/fileglancer-fixture';
import { join } from 'path';

test.describe('Navigation Input', () => {
  test.beforeEach('Navigate to browse', async ({ fileglancerPage: page }) => {
    await page.goto('/fg/browse', {
      waitUntil: 'domcontentloaded'
    });
  });

  test('navigate to scratch directory using full path', async ({
    fileglancerPage: page
  }) => {
    // Get the scratch directory path from global (set in playwright.config.js)
    const scratchDir = join(global.testTempDir, 'scratch');

    // The navigation input should be visible in the main panel
    const navigationInput = page.getByRole('textbox', {
      name: /path\/to\/folder/i
    });
    await expect(navigationInput).toBeVisible();

    // Fill in the scratch path
    await navigationInput.fill(scratchDir);

    // Click the Go button
    const goButton = page.getByRole('button', { name: /^Go$/i });
    await goButton.click();

    // Verify we navigated to scratch and can see the test files
    await expect(page.getByText('f1')).toBeVisible();
    await expect(page.getByText('f2')).toBeVisible();
    await expect(page.getByText('f3')).toBeVisible();
  });

  test('navigate to subfolder within scratch', async ({
    fileglancerPage: page
  }) => {
    const scratchDir = join(global.testTempDir, 'scratch');
    const subfolderPath = join(scratchDir, 'f1');

    const navigationInput = page.getByRole('textbox', {
      name: /path\/to\/folder/i
    });

    // Navigate to the subfolder
    await navigationInput.fill(subfolderPath);
    await navigationInput.press('Enter');

    // Verify we're in the subfolder (should be empty)
    await expect(
      page.getByText('test content for f1', { exact: true })
    ).toBeVisible();

    // The test files from parent directory should not be visible
    await expect(page.getByText('f2')).not.toBeVisible();
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
