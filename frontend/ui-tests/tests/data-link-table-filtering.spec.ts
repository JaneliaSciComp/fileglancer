import { expect, test } from '../fixtures/fileglancer-fixture';
import { Page } from '@playwright/test';
import type { ProxiedPath } from '../../src/contexts/ProxiedPathContext';
import { ZARR_TEST_FILE_INFO } from '../mocks/zarrDirs';
import { navigateToScratchFsp, navigateToTestDir } from '../utils/navigation';

/**
 * Generates mock data links for testing
 */
function generateMockDataLinks(count: number): ProxiedPath[] {
  const mockLinks: ProxiedPath[] = [];
  const baseDate = new Date('2025-11-10T10:00:00Z');

  for (let i = 0; i < count; i++) {
    const created = new Date(baseDate.getTime() + i * 60000); // 1 minute apart
    mockLinks.push({
      username: 'testUser',
      sharing_key: `mock-key-${i + 1}`,
      sharing_name: `Mock Link ${i + 1}`,
      path: `/mock/path/to/file${i + 1}.zarr`,
      fsp_name: 'scratch',
      created_at: created.toISOString(),
      updated_at: created.toISOString(),
      url: `http://example.com/mock-link-${i + 1}`
    });
  }

  return mockLinks;
}

/**
 * Setup mock API route for proxied paths that adds mock data to existing real data
 */
async function setupMockProxiedPathsAPI(
  page: Page,
  additionalMockLinks: ProxiedPath[]
) {
  await page.route('/api/proxied-path', async (route, request) => {
    // Only mock GET requests for listing all proxied paths (no query params)
    if (request.method() === 'GET' && !request.url().includes('fsp_name=')) {
      // Fetch the original response to get real data links
      const response = await route.fetch();
      const originalData = await response.json();
      const realPaths = (originalData as { paths?: ProxiedPath[] }).paths || [];

      // Combine real paths with mock data
      const combinedPaths = [...realPaths, ...additionalMockLinks];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ paths: combinedPaths })
      });
    } else {
      // For all other requests (POST, DELETE, or GET with query params), continue normally
      await route.continue();
    }
  });
}

test.describe('Data Link Table Filtering', () => {
  test('filtering table and interacting with action menu and links preserves filter state', async ({
    fileglancerPage: page,
    testDir
  }) => {
    const zarrDirName = ZARR_TEST_FILE_INFO.v3_ome.dirname;

    await test.step('Setup mock API with 10 links', async () => {
      const mockLinks = generateMockDataLinks(10);
      await setupMockProxiedPathsAPI(page, mockLinks);

      // Reload page to force refetching of proxied paths
      await page.reload();

      // Navigate to Links page
      const linksNavButton = page.getByRole('link', { name: 'Data links' });
      await linksNavButton.click();
      await expect(page.getByRole('heading', { name: /links/i })).toBeVisible();

      // Check for mock links
      await expect(
        page.getByText('Mock Link 1', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('Mock Link 10', { exact: true })
      ).toBeVisible();
    });

    await test.step('Create a real data link', async () => {
      // Navigate to a zarr directory
      await page.goto('/fg/browse', {
        waitUntil: 'domcontentloaded'
      });
      await navigateToScratchFsp(page);

      const testDirName = testDir.split('/').pop() || testDir;
      const fullTestPath = testDirName.startsWith('test-')
        ? global.testTempDir + '/scratch/' + testDirName
        : testDir;
      await navigateToTestDir(page, fullTestPath);

      await page.getByRole('link', { name: zarrDirName }).click();
      await page.waitForLoadState('domcontentloaded');

      // Wait for the data link toggle to be visible in properties panel
      const dataLinkToggle = page.getByRole('checkbox', { name: /data link/i });
      await expect(dataLinkToggle).toBeVisible({ timeout: 10000 });

      // Create the data link
      await dataLinkToggle.click();
      const confirmButton = page.getByRole('button', {
        name: /confirm|create|yes/i
      });
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();
      await expect(
        page.getByText('Data link created successfully')
      ).toBeVisible();
    });

    await test.step('Fetch real data link', async () => {
      // Make an API call to get the real data link
      const response = await page.request.get('/api/proxied-path');
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      const paths = (data as { paths?: ProxiedPath[] }).paths || [];
      expect(paths.length).toBe(1);
    });

    await test.step('Verify new data is visible in table', async () => {
      // Navigate to Links page
      const linksNavButton = page.getByRole('link', { name: 'Data links' });
      await linksNavButton.click();
      await expect(page.getByRole('heading', { name: /links/i })).toBeVisible();

      // Check for the real link (zarr_v3_ome.zarr should be in the table)
      await expect(page.getByText(zarrDirName, { exact: true })).toBeVisible();
    });

    await test.step('Verify Mock Link 1 is now on Page 2 of the table', async () => {
      const nextPageButton = page
        .locator('div')
        .filter({ hasText: /^Page1 of 210\/page$/ })
        .getByRole('button')
        .nth(2);
      await nextPageButton.click();

      // Verify we're on page 2
      await expect(
        page
          .locator('div')
          .filter({ hasText: /^Page2 of 210\/page$/ })
          .first()
      ).toBeVisible();

      // Check that Mock Link 1 is visible on page 2
      await expect(
        page.getByText('Mock Link 1', { exact: true })
      ).toBeVisible();
    });

    await test.step('Sort table by name A-Z', async () => {
      // Navigate back to Page 1
      const prevPageButton = page
        .locator('div')
        .filter({ hasText: /^Page2 of 210\/page$/ })
        .getByRole('button')
        .nth(1);
      await prevPageButton.click();

      // Verify we're back on page 1
      await expect(
        page
          .locator('div')
          .filter({ hasText: /^Page1 of 210\/page$/ })
          .first()
      ).toBeVisible();

      // Click on the Name sort icon to sort A-Z
      const nameSortIcon = page.locator('div > .icon-default').first();
      await nameSortIcon.click();

      // Verify Mock Link 1 is now visible on Page 1
      await expect(
        page.getByText('Mock Link 1', { exact: true })
      ).toBeVisible();

      // Verify the real data link is no longer on Page 1
      await expect(
        page.getByText(zarrDirName, { exact: true })
      ).not.toBeVisible();
    });

    await test.step('Filter table to show only real data link', async () => {
      // Click on search input
      const searchInput = page.getByRole('searchbox', {
        name: 'Search all columns...'
      });
      await searchInput.click();

      // Type the filter text to show only the real zarr directory
      await searchInput.fill(zarrDirName);

      // Verify only the real data link is visible
      await expect(page.getByText(zarrDirName, { exact: true })).toBeVisible();
      await expect(
        page.getByText('Mock Link 1', { exact: true })
      ).not.toBeVisible();
    });

    await test.step('Click action menu - table should not reset', async () => {
      const actionMenuButton = page
        .getByTestId('data-link-actions-cell')
        .getByRole('button');
      await actionMenuButton.click();

      // Verify the menu is open
      await expect(
        page.getByRole('menuitem', { name: /copy path/i })
      ).toBeVisible();

      // Verify the filter is still active (only real link visible)
      await expect(page.getByText(zarrDirName, { exact: true })).toBeVisible();
      await expect(page.getByText('Mock Link 1')).not.toBeVisible();
    });

    await test.step('Click menu item - table should not reset', async () => {
      // Click "Copy path" menu item
      const copyPathMenuItem = page.getByRole('menuitem', {
        name: /copy path/i
      });
      await copyPathMenuItem.click();

      // Wait for the action to complete
      await page.waitForTimeout(500);

      // Verify the filter is still active (only real link visible)
      await expect(page.getByText(zarrDirName, { exact: true })).toBeVisible();
      await expect(page.getByText('Mock Link 1')).not.toBeVisible();
    });

    await test.step('Click file path - should navigate to file browser', async () => {
      // Get the current URL to verify navigation
      const currentUrl = page.url();
      expect(currentUrl).toContain('/links');

      // Click on the file path link
      const filePathLink = page
        .getByRole('link')
        .filter({ hasText: zarrDirName });
      await filePathLink.click();

      // Wait for navigation to complete
      await page.waitForLoadState('domcontentloaded');

      // Verify we navigated to the browse page
      const newUrl = page.url();
      expect(newUrl).toContain('/browse');
      expect(newUrl).toContain(zarrDirName);

      // Verify we're not on the links page anymore
      expect(newUrl).not.toContain('/links');
    });
  });
});
