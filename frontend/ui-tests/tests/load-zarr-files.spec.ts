import { expect, test } from '../fixtures/fileglancer-fixture';
import {
  ZARR_TEST_FILE_INFO,
  ZARR_V2_OME_ZARRAY_METADATA
} from '../mocks/zarrDirs';
import * as path from 'path';
import * as fs from 'fs/promises';

test.describe('Zarr File Type Representation', () => {
  test.beforeEach(
    'Navigate to test directory',
    async ({ fileglancerPage: page }) => {
      // Wait for Zarr directories to load
      await expect(
        page.getByRole('link', { name: ZARR_TEST_FILE_INFO.v2_non_ome.dirname })
      ).toBeVisible();
      // Move mouse away to avoid tooltip interference
      await page.mouse.move(0, 0);
    }
  );

  test('Zarr V3 with no OME metadata should show only neuroglancer', async ({
    fileglancerPage: page
  }) => {
    // Move mouse away to avoid tooltip interference
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page
      .getByRole('link', { name: ZARR_TEST_FILE_INFO.v3_non_ome.dirname })
      .click({ timeout: 15000 });

    // Wait for zarr metadata to load (zarr.json file present indicates loaded)
    await expect(page.getByText('zarr.json')).toBeVisible({ timeout: 10000 });

    await expect(page.getByAltText(/neuroglancer/i)).toBeVisible();
    await expect(page.getByAltText(/vol-e/i)).toHaveCount(0);
  });

  test('Zarr V3 OME-Zarr should show all viewers except avivator', async ({
    fileglancerPage: page
  }) => {
    // Move mouse away to avoid tooltip interference
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page
      .getByRole('link', { name: ZARR_TEST_FILE_INFO.v3_ome.dirname })
      .click({ timeout: 15000 });

    // Wait for zarr metadata to load
    await expect(page.getByText('zarr.json')).toBeVisible({ timeout: 10000 });

    await expect(page.getByAltText(/neuroglancer/i)).toBeVisible();
    await expect(page.getByAltText(/vol-e/i)).toBeVisible();
    await expect(page.getByAltText(/validator/i)).toBeVisible();
    await expect(page.getByAltText(/avivator/i)).toHaveCount(0);
  });

  test('Zarr V2 Array should show only neuroglancer', async ({
    fileglancerPage: page
  }) => {
    // Move mouse away to avoid tooltip interference
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page
      .getByRole('link', { name: ZARR_TEST_FILE_INFO.v2_non_ome.dirname })
      .click({ timeout: 15000 });

    // Wait for zarr metadata to load
    await expect(page.getByText('.zarray')).toBeVisible({ timeout: 10000 });

    await expect(page.getByAltText(/neuroglancer/i)).toBeVisible();
    await expect(page.getByAltText(/vol-e/i)).toHaveCount(0);
  });

  test('Zarr V2 OME-Zarr should display all viewers including avivator', async ({
    fileglancerPage: page
  }) => {
    // Move mouse away to avoid tooltip interference
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page
      .getByRole('link', { name: ZARR_TEST_FILE_INFO.v2_ome.dirname })
      .click({ timeout: 15000 });

    // Wait for zarr metadata to load
    await expect(page.getByText('.zattrs')).toBeVisible({ timeout: 10000 });

    await expect(page.getByAltText(/neuroglancer/i)).toBeVisible();
    await expect(page.getByAltText(/vol-e/i)).toBeVisible();
    await expect(page.getByAltText(/validator/i)).toBeVisible();
    await expect(page.getByAltText(/avivator/i)).toBeVisible();
  });

  test('Refresh button should update zarr metadata when .zattrs is modified', async ({
    fileglancerPage: page,
    testDir
  }) => {
    // Navigate to v2 OME-Zarr directory
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page
      .getByRole('link', { name: ZARR_TEST_FILE_INFO.v2_ome.dirname })
      .click({ timeout: 15000 });

    // Wait for zarr metadata to load
    await expect(page.getByText('.zattrs')).toBeVisible({ timeout: 10000 });

    // Verify initial multiscale levels (should be 1)
    const multiscaleLevelsRow = page
      .getByRole('row')
      .filter({ hasText: 'Multiscale Levels' });
    await expect(multiscaleLevelsRow).toBeVisible({ timeout: 10000 });

    // Get the cell containing the multiscale level count
    const initialLevelCell = multiscaleLevelsRow.locator('td').nth(1);
    await expect(initialLevelCell).toHaveText('1');

    // Construct path to .zattrs file
    const scratchDir = path.join(global.testTempDir, 'scratch');
    const zarrDir = path.join(
      scratchDir,
      testDir,
      ZARR_TEST_FILE_INFO.v2_ome.dirname
    );
    const zattrsPath = path.join(zarrDir, '.zattrs');

    // Read current .zattrs file
    const originalContent = await fs.readFile(zattrsPath, 'utf-8');
    const originalMetadata = JSON.parse(originalContent);

    // Create modified metadata with additional dataset (pyramid level)
    const modifiedMetadata = {
      ...originalMetadata,
      multiscales: [
        {
          ...originalMetadata.multiscales[0],
          datasets: [
            ...originalMetadata.multiscales[0].datasets,
            {
              path: '1',
              coordinateTransformations: [
                {
                  scale: [2.0, 2.0, 2.0],
                  type: 'scale'
                }
              ]
            }
          ]
        }
      ]
    };

    // Create the missing '1' directory with .zarray file for the second dataset
    const dataset1Dir = path.join(zarrDir, '1');
    let createdDataset1Dir = false;

    // Create downsampled .zarray metadata for second pyramid level
    const level1ArrayMetadata = {
      ...ZARR_V2_OME_ZARRAY_METADATA,
      shape: [50, 50, 50] // Half resolution for pyramid level 1
    };

    try {
      // Create directory for second pyramid level
      await fs.mkdir(dataset1Dir, { recursive: true });
      createdDataset1Dir = true;

      // Write .zarray file for the second pyramid level
      await fs.writeFile(
        path.join(dataset1Dir, '.zarray'),
        JSON.stringify(level1ArrayMetadata, null, 2),
        'utf-8'
      );

      // Write modified .zattrs file
      await fs.writeFile(
        zattrsPath,
        JSON.stringify(modifiedMetadata, null, 2),
        'utf-8'
      );

      // Click the refresh button in the toolbar
      // Use title attribute selector since the button is in a tooltip
      const refreshButton = page.getByRole('button', {
        name: 'Refresh file browser'
      });
      await refreshButton.click();

      // Wait for the refresh to complete
      await expect(page.getByText('File browser refreshed!')).toBeVisible({
        timeout: 5000
      });

      // Wait a moment for queries to refetch
      await page.waitForTimeout(1000);

      // Verify the metadata table has been updated
      // The multiscale levels should now show 2 instead of 1
      const updatedLevelCell = multiscaleLevelsRow.locator('td').nth(1);
      await expect(updatedLevelCell).toHaveText('2', { timeout: 5000 });
    } finally {
      // Cleanup: Restore original .zattrs file and remove created directory
      try {
        await fs.writeFile(zattrsPath, originalContent, 'utf-8');
      } catch (error) {
        console.warn('Failed to restore .zattrs file:', error);
      }

      // Remove the '1' directory if we created it
      if (createdDataset1Dir) {
        try {
          await fs.rm(dataset1Dir, { recursive: true, force: true });
        } catch (error) {
          console.warn('Failed to remove dataset 1 directory:', error);
        }
      }
    }
  });
});
