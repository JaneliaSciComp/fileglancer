import { expect, test } from '@playwright/test';
import { openFileGlancer } from '../testutils.ts';

test('should load fileglancer app', async ({ page }) => {
  await openFileGlancer(page);

  // Verify main app elements are visible
  await expect(page.getByText('Browse')).toBeVisible();
  await expect(page.getByText('Zones', { exact: true })).toBeVisible();
});

test('should display dashboard on initial load', async ({ page }) => {
  await openFileGlancer(page);

  // The Browse page should be the default view
  await expect(page.getByText('Browse')).toBeVisible();
});
