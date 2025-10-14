import { expect, test } from '@playwright/test';
import { openFileglancer } from '../testutils.ts';

test('should load fileglancer app', async ({ page }) => {
  await openFileglancer(page);

  // Verify main app elements are visible
  await expect(page.getByText('Browse Files')).toBeVisible();
  await expect(page.getByText('Zones', { exact: true })).toBeVisible();
});

test('should display dashboard on initial load', async ({ page }) => {
  await openFileglancer(page);

  // The Browse page should be the default view
  await expect(page.getByText('Recently Viewed')).toBeVisible();
});
