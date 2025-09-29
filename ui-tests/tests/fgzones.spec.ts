import { expect, test } from '@jupyterlab/galata';
import {
  openFileGlancer,
  mockAPI,
  teardownMockAPI,
  TEST_SHARED_PATHS
} from './testutils';

test.beforeEach('Open fileglancer', async ({ page }) => {
  await openFileGlancer(page);
});

test.beforeEach('setup API endpoints', async ({ page }) => {
  await mockAPI(page);
});

test.afterEach(async ({ page }) => {
  await teardownMockAPI(page);
});

test('favor entire zone with reload page', async ({ page }) => {
  // click on Z1
  await page.getByText('Z1', { exact: true }).click();

  await expect(
    page.getByRole('link', { name: `${TEST_SHARED_PATHS[0].storage}` })
  ).toBeVisible();

  await expect(
    page.getByRole('link', { name: `${TEST_SHARED_PATHS[1].storage}` })
  ).toBeVisible();

  // click on Z2
  await page.getByText('Z2', { exact: true }).click();

  await expect(
    page.getByRole('link', { name: `${TEST_SHARED_PATHS[2].storage}` })
  ).toBeVisible();

  // click on the path to fill the files panel
  await page
    .getByRole('link', { name: `${TEST_SHARED_PATHS[2].storage}` })
    .click();

  // first file row - check for file name and size separately
  await expect(page.getByText('f1')).toBeVisible();
  await expect(page.getByText('May 21, 2025')).toBeVisible();
  await expect(page.getByText('10 bytes').first()).toBeVisible();

  const z2ExpandedStarButton = page
    .getByRole('list')
    .filter({ hasText: 'Z1homeprimaryZ2scratch' })
    .getByRole('button')
    .nth(3);

  await expect(
    z2ExpandedStarButton.locator('svg path[fill-rule]') // filled star
  ).toHaveCount(0);
  await expect(
    z2ExpandedStarButton.locator('svg path[stroke-linecap]') // empty star
  ).toHaveCount(1);

  // favor entire Z2
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Z2' })
    .getByRole('button')
    .click();

  const Z2favorite = page
    .getByRole('list')
    .filter({ hasText: /^Z2$/ })
    .getByRole('listitem');
  // test that Z2 now shows in the favorites
  await expect(Z2favorite).toBeVisible();

  // reload page - somehow page.reload hangs so I am going back to jupyterlab page
  await openFileGlancer(page);

  // test Z2 still shows as favorite
  await expect(Z2favorite).toBeVisible();
});
