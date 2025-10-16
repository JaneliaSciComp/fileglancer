import { expect, test } from '@playwright/test';
import {
  openFileglancer,
  mockAPI,
  teardownMockAPI,
  createTestFilesInScratchDir
} from './testutils.ts';

test.beforeEach('Recreate test files before each test', async () => {
  // Recreate test files before each test (since operations may modify/delete them)
  await createTestFilesInScratchDir();
});

test.beforeEach('setup API endpoints BEFORE opening page', async ({ page }) => {
  // CRITICAL: Set up mocks BEFORE navigating
  await mockAPI(page);
});

test.beforeEach('Open Fileglancer', async ({ page }) => {
  await openFileglancer(page);
});

test.afterEach(async ({ page }) => {
  await teardownMockAPI(page);
});

test.describe('File Operations', () => {
  test.beforeEach('Navigate to test directory', async ({ page }) => {
    // Navigate to Local zone - find it under Zones, not in Favorites
    const localZone = page
      .getByLabel('List of file share paths')
      .getByRole('button', { name: 'Local' });
    await localZone.click();

    await expect(page.getByRole('link', { name: /scratch/i })).toBeVisible();
    await page.getByRole('link', { name: /scratch/i }).click();

    // Wait for files to load - verify f1 is visible
    await expect(page.getByText('f1')).toBeVisible();
  });

  test('rename file via context menu', async ({ page }) => {
    // Right-click to open context menu, select Rename. Wait for dialog.
    await page.getByText('f3').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /rename/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in new name, submit
    const renameInput = page.getByRole('textbox', { name: /name/i });
    await renameInput.fill('f3_renamed');
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify new name is in file list; old name no longer be visible
    await expect(page.getByText('f3_renamed')).toBeVisible();
    await expect(
      page.getByText('f3').filter({ hasNotText: 'f3_renamed' })
    ).not.toBeVisible();
  });

  test('delete file via context menu', async ({ page }) => {
    // Right-click to open context menu, select Delete. Wait for dialog.
    await page.getByText('f2').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /delete/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Confirm delete
    await page.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify f2 is no longer visible; f1 still is
    await expect(page.getByText('f2')).not.toBeVisible();
    await expect(page.getByText('f1')).toBeVisible();
  });

  test('create new folder via toolbar', async ({ page }) => {
    const newFolderName = 'new_test_folder';

    // Click on "New Folder" button in toolbar. Wait for dialog.
    await page.getByRole('button', { name: /new folder/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in folder name
    const folderNameInput = page.getByRole('textbox', {
      name: /Create a new folder/i
    });
    await folderNameInput.fill(newFolderName);

    // Submit
    await page
      .getByRole('button', { name: /submit/i })
      .filter({ hasNotText: /cancel/i })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify the new folder appears in the file list
    await expect(page.getByText(newFolderName)).toBeVisible();
  });
});
