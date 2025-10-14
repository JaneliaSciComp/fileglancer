import { expect, test } from '@jupyterlab/galata';
import { openFileglancer } from '../testutils.ts';

test.beforeEach('Open fileglancer', async ({ page }) => {
  await openFileglancer(page);
});

test('Home becomes visible when Local is expanded', async ({ page }) => {
  const zonesLocator = page.getByText('Zones', { exact: true });
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
