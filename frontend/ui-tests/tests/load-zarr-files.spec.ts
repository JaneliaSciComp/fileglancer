import { expect, test } from '../fixtures/fileglancer-fixture';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';

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

    await expect(
      page.getByRole('link', { name: 'Neuroglancer logo' })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Vol-E logo' })).toHaveCount(0);
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

    await expect(
      page.getByRole('link', { name: 'Neuroglancer logo' })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Vol-E logo' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'OME-Zarr Validator logo' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Avivator logo' })).toHaveCount(
      0
    );
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

    await expect(
      page.getByRole('link', { name: 'Neuroglancer logo' })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Vol-E logo' })).toHaveCount(0);
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

    await expect(
      page.getByRole('link', { name: 'Neuroglancer logo' })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Vol-E logo' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'OME-Zarr Validator logo' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Avivator logo' })
    ).toBeVisible();
  });
});
