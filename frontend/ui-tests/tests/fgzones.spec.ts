import { expect, test } from '../fixtures/fileglancer-fixture';

test('favorite list persists after reloading page', async ({
  fileglancerPage: page
}) => {
  // Favor entire Local fsp by clicking star btn within Local zone header btn
  await page
    .getByRole('listitem')
    .filter({ hasText: 'local' })
    .getByRole('button')
    .click();

  // Test that Local now shows in the favorites
  const localFavorite = page
    .getByLabel('Favorites list')
    .getByRole('listitem')
    .filter({ hasText: 'local' });
  await expect(localFavorite).toBeVisible();

  // Reload page to verify favorites persist
  await page.goto('/browse', {
    waitUntil: 'domcontentloaded'
  });
  await expect(localFavorite).toBeVisible();
});
