import { expect, test } from '@jupyterlab/galata';
import { openFileGlancer } from './testutils';

test.use({ autoGoto: false });

test.beforeEach('Open fileglancer', async ({ page }) => {
  // Log API responses for debugging
  page.on('response', async response => {
    if (response.url().includes('/api/fileglancer/file-share-paths')) {
      console.log('file-share-paths response status:', response.status());
      console.log('file-share-paths response:', await response.text());
    }
  });

  await openFileGlancer(page);
});

test.afterAll('Close browser', ({ browser }) => {
  browser.close();
});

test('Home becomes visible when Local is expanded', async ({ page }) => {
  const zonesLocator = page.getByText('Zones');
  const homeLocator = page.getByRole('link', { name: 'home', exact: true });
  const localZoneLocator = page.getByText('Local');

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
