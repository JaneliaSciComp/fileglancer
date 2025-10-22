import { expect, test } from '../fixtures/fileglancer-fixture';

test.describe('File Operations', () => {
  test.beforeEach(
    'Navigate to test directory',
    async ({ fileglancerPage: page }) => {
      // Wait for files to load - verify f1 is visible
      await expect(page.getByText('f1')).toBeVisible();
    }
  );

  test('rename file via context menu', async ({
    fileglancerPage: page,
    freshFiles
  }) => {
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

  test('delete file via context menu', async ({
    fileglancerPage: page,
    freshFiles
  }) => {
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

  test('create new folder via toolbar', async ({
    fileglancerPage: page,
    freshFiles
  }) => {
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
