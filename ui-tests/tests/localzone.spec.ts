import { expect, test } from '@jupyterlab/galata';
import { openFileGlancer } from './testutils';

const TEST_USER = 'testUser';
const TEST_SHARED_PATHS = [
  {
    name: 'groups_local_homezone',
    zone: 'local',
    storage: 'home',
    mount_path: '/local/home'
  }
];

test.use({ autoGoto: false });

test.beforeEach('Open fileglancer', async ({ page }) => {
  await openFileGlancer(page);
});

test.beforeEach('setup API endpoints', async ({ page }) => {
  // mock API calls
  await page.route('/api/fileglancer/profile', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: TEST_USER
      })
    });
  });

  await page.route('/api/fileglancer/file-share-paths', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        paths: TEST_SHARED_PATHS
      })
    });
  });
});

test.afterAll('Close browser', ({ browser }) => {
  browser.close();
});

test('Home becomes visible when Local is expanded', async ({ page }) => {
  const zonesLocator = page.getByText('Zones');
  const homeLocator = page.getByText('home');
  const localZoneLocator = page.getByText('local');

  await expect(zonesLocator).toBeVisible();
  // the home locator initially is not visible
  await expect(homeLocator).toHaveCount(0);

  // assume local is visible so click on zones and hide all zones (including local)
  await zonesLocator.click();

  await expect(localZoneLocator).toHaveCount(0);
  // click again on zones to make them visible
  await zonesLocator.click();
  // expect the local zone to be visible
  await expect(localZoneLocator).toBeVisible();
  // click on it to view home
  await localZoneLocator.click();

  await expect(homeLocator).toBeVisible();
});
