import { expect, test } from '@playwright/test';
import {
  openFileglancer,
  mockAPI,
  teardownMockAPI,
  TEST_SHARED_PATHS
} from '../testutils.ts';

test.beforeEach('setup API endpoints BEFORE opening page', async ({ page }) => {
  // CRITICAL: Set up mocks BEFORE navigating to make sure they are registered before any requests are made
  await mockAPI(page);
});

test.beforeEach('Open Fileglancer', async ({ page }) => {
  await openFileglancer(page);
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

  // favor entire Z2
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Z2', hasNotText: 'scratch' })
    .getByRole('button')
    .click();

  const Z2favorite = page
    .getByRole('list')
    .filter({ hasText: /^Z2$/ })
    .getByRole('listitem');
  // test that Z2 now shows in the favorites
  await expect(Z2favorite).toBeVisible();

  // reload page to verify favorites persist
  await page.reload();

  // test Z2 still shows as favorite
  await expect(Z2favorite).toBeVisible();
});
