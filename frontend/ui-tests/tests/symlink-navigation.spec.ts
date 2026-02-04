import { expect, test as base } from '@playwright/test';
import { join } from 'path';
import { existsSync } from 'fs';
import { rm, mkdir, writeFile, symlink } from 'fs/promises';
import { navigateToScratchFsp, navigateToTestDir } from '../utils/navigation';
import { mockAPI, teardownMockAPI } from '../mocks/api';
import { cleanDatabase } from '../utils/db-cleanup';
import { randomBytes } from 'crypto';

import type { Page } from '@playwright/test';

type SymlinkFixtures = {
  fileglancerPage: Page;
  testDir: string;
};

/**
 * Create symlink test fixtures in the given directory.
 * Creates:
 * - target_subdir/ (a directory)
 * - target_subdir/target_file.txt (a file)
 * - symlink_to_subdir -> target_subdir (symlink to directory)
 * - symlink_to_file -> target_subdir/target_file.txt (symlink to file)
 * - broken_symlink -> /nonexistent/path (broken symlink)
 * - regular_file.txt (a regular file for comparison)
 */
async function createSymlinkTestFixtures(testDir: string): Promise<void> {
  // Create target directory
  const targetSubdir = join(testDir, 'target_subdir');
  await mkdir(targetSubdir, { recursive: true });

  // Create target file inside target directory
  await writeFile(
    join(targetSubdir, 'target_file.txt'),
    'This is the target file content'
  );

  // Create symlink to directory (same share)
  await symlink(targetSubdir, join(testDir, 'symlink_to_subdir'));

  // Create symlink to file
  await symlink(
    join(targetSubdir, 'target_file.txt'),
    join(testDir, 'symlink_to_file')
  );

  // Create broken symlink - pointing to nonexistent path
  await symlink(
    '/nonexistent/path/that/does/not/exist',
    join(testDir, 'broken_symlink')
  );

  // Create a regular file for comparison
  await writeFile(join(testDir, 'regular_file.txt'), 'Regular file content');

  console.log('[Symlink Fixture] Created symlink test fixtures in', testDir);
}

const openFileglancer = async (page: Page) => {
  await page.goto('/', {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForSelector('text=Log In', { timeout: 10000 });

  const loginForm = page.getByRole('textbox', { name: 'Username' });
  const loginSubmitBtn = page.getByRole('button', { name: 'Log In' });
  await loginForm.fill('testUser');
  await loginSubmitBtn.click();

  await page.waitForSelector('text=Zones', { timeout: 10000 });
};

/**
 * Custom Playwright fixture for symlink tests.
 *
 * Similar to the main fileglancer-fixture but creates symlink test data
 * instead of the standard test files and zarr directories.
 */
const test = base.extend<SymlinkFixtures>({
  testDir: async ({}, use) => {
    const scratchDir = join(global.testTempDir, 'scratch');
    const uniqueId = randomBytes(8).toString('hex');
    const testDir = `symlink-test-${uniqueId}`;
    const fullPath = join(scratchDir, testDir);

    console.log(
      `[Symlink Fixture] Creating unique test directory: ${fullPath}`
    );

    // Create test directory and populate with symlink fixtures
    await mkdir(fullPath, { recursive: true });
    await createSymlinkTestFixtures(fullPath);

    // Provide test directory NAME (not full path) to the test
    await use(testDir);

    // Cleanup test directory after test completes
    console.log(`[Symlink Fixture] Cleaning up test directory: ${fullPath}`);
    if (existsSync(fullPath)) {
      await rm(fullPath, { recursive: true, force: true });
    }
  },

  fileglancerPage: async ({ page, testDir }, use) => {
    const fullTestPath = join(global.testTempDir, 'scratch', testDir);
    console.log(`[Symlink Fixture] Test temp dir: ${global.testTempDir}`);
    console.log(`[Symlink Fixture] Test directory: ${fullTestPath}`);

    // Clean user-specific database tables
    cleanDatabase(global.testTempDir);

    await mockAPI(page);
    await openFileglancer(page);
    await navigateToScratchFsp(page);
    await navigateToTestDir(page, fullTestPath);

    // Provide the page to the test
    await use(page);

    // Teardown
    await teardownMockAPI(page);
    await page.waitForTimeout(100);
  }
});

test.describe('Symlink Navigation and Display', () => {
  test.beforeEach(
    'Verify symlink test environment is loaded',
    async ({ fileglancerPage: page }) => {
      await expect(
        page.getByText('regular_file.txt', { exact: true })
      ).toBeVisible({ timeout: 10000 });
    }
  );

  test('displays symlink icon and type', async ({ fileglancerPage: page }) => {
    // Look for a symlink in the file table - symlink_to_file should exist
    const symlinkRow = page
      .getByRole('row')
      .filter({ hasText: 'symlink_to_file' });
    await expect(symlinkRow).toBeVisible();

    // Verify symlink icon is visible (TbLink icon renders as svg with text-primary class)
    await expect(symlinkRow.locator('svg.text-primary')).toBeVisible();

    // Verify Type column shows "Symlink" (use exact match to avoid matching filename)
    await expect(
      symlinkRow.getByText('Symlink', { exact: true })
    ).toBeVisible();
  });

  test('navigates to symlink target within same share', async ({
    fileglancerPage: page
  }) => {
    await page.getByRole('link', { name: 'symlink_to_subdir' }).dblclick();
    const targetFileRow = page
      .getByRole('row')
      .filter({ hasText: 'target_file' });
    await expect(targetFileRow).toBeVisible();
  });

  test('directory symlink displays as Symlink type, not Folder', async ({
    fileglancerPage: page
  }) => {
    // The symlink to a directory should still show as Symlink type, not Folder
    const symlinkDirRow = page
      .getByRole('row')
      .filter({ hasText: 'symlink_to_subdir' });
    await expect(symlinkDirRow).toBeVisible();

    // Should show "Symlink" type even though it points to a directory (use exact match)
    await expect(
      symlinkDirRow.getByText('Symlink', { exact: true })
    ).toBeVisible();

    // Verify the regular directory shows as "Folder"
    const regularDirRow = page
      .getByRole('row')
      .filter({ hasText: 'target_subdir' });
    await expect(
      regularDirRow.getByText('Folder', { exact: true })
    ).toBeVisible();
  });

  test('context menu works on symlinks', async ({ fileglancerPage: page }) => {
    // Right-click on the symlink text in the table to open context menu
    // Following the pattern from file-operations.spec.ts
    await page
      .getByText('symlink_to_file', { exact: true })
      .click({ button: 'right' });

    // Verify context menu appears - wait for it to be visible
    await expect(page.getByRole('menuitem', { name: /rename/i })).toBeVisible({
      timeout: 5000
    });
    await expect(page.getByRole('menuitem', { name: /delete/i })).toBeVisible();

    // Close the menu by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('broken symlinks are not displayed', async ({
    fileglancerPage: page
  }) => {
    // The broken_symlink was created pointing to /nonexistent/path
    // It should NOT appear in the file list because os.stat() fails on broken symlinks
    // and the backend catches that error and skips the entry
    await expect(
      page.getByText('broken_symlink', { exact: true })
    ).not.toBeVisible();

    // But valid files should still be visible
    await expect(
      page.getByText('regular_file.txt', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('symlink_to_file', { exact: true })
    ).toBeVisible();
  });

  test('clicking a directory symlink row selects it and shows in properties panel', async ({
    fileglancerPage: page
  }) => {
    // Verify properties panel is visible first
    const propertiesPanel = page
      .locator('[role="complementary"]')
      .filter({ hasText: 'Properties' });
    await expect(propertiesPanel).toBeVisible();

    // Click on the "Type" column to select without triggering the hyperlink
    const symlinkRow = page
      .getByRole('row')
      .filter({ hasText: 'symlink_to_subdir' });
    await symlinkRow.getByText('Symlink', { exact: true }).click();

    // Verify properties panel shows the symlink name in the header
    await expect(
      propertiesPanel.getByText('symlink_to_subdir', { exact: true })
    ).toBeVisible({ timeout: 10000 });
  });
});
