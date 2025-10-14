import { expect, test } from '@playwright/test';
import { openFileglancer } from '../testutils.ts';

test.beforeEach('Open fileglancer', async ({ page }) => {
  await openFileglancer(page);
});

test('Local file share becomes visible when Local zone is expanded', async ({
  page
}) => {
  const zonesLocator = page.getByText('Zones', { exact: true });
  const localFspLocator = page.getByRole('link', {
    name: 'local',
    exact: true
  });
  const localZoneLocator = page.getByText('Local');

  await expect(zonesLocator).toBeVisible();
  // the home locator initially is not visible
  await expect(localFspLocator).toHaveCount(0);

  // assume local is visible so click on zones and hide all zones (including local)
  await zonesLocator.click();

  await expect(localZoneLocator).toHaveCount(0);
  // click again on zones to make them visible
  await zonesLocator.click();
  // expect the local zone to be visible
  await expect(localZoneLocator).toBeVisible();
  // click on it to view home
  await localZoneLocator.click();

  await expect(localFspLocator).toBeVisible();
});
