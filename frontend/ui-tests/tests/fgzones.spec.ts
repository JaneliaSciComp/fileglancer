import { expect, test } from '../fixtures/fileglancer-fixture';

test('favor entire zone with reload page', async ({
  fileglancerPage: page
}) => {
  // Favor entire Local zone by clicking star btn within Local zone header btn
  await page.getByRole('button', { name: 'Local' }).getByRole('button').click();

  // Test that Local now shows in the favorites
  const localFavorite = page.getByLabel('Favorites list').getByRole('button', {
    name: 'Local'
  });
  await expect(localFavorite).toBeVisible();

  // Reload page to verify favorites persist
  await page.reload();
  await expect(localFavorite).toBeVisible();
});
