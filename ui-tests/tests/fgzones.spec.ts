import { expect, test } from '@jupyterlab/galata';
import { openFileGlancer } from './testutils';

const TEST_USER = 'testUser';
const TEST_SHARED_PATHS = [
  {
    name: 'groups_z1_homezone',
    zone: 'Z1',
    storage: 'home',
    mount_path: '/z1/home'
  },
  {
    name: 'groups_z1_primaryzone',
    zone: 'Z1',
    storage: 'primary',
    mount_path: '/z1/labarea'
  },
  {
    name: 'groups_z2_scratchzone',
    zone: 'Z2',
    storage: 'scratch',
    mount_path: '/z2/scratch'
  }
];

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

  await page.route(
    `/api/fileglancer/files/${TEST_SHARED_PATHS[2].name}**`,
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: [
            {
              name: 'f1',
              path: 'f1',
              size: 10,
              is_dir: false,
              permissions: '-rw-r--r--',
              owner: 'testuser',
              group: 'test',
              last_modified: 1747865213.768398
            },
            {
              name: 'f2',
              path: 'f2',
              size: 10,
              is_dir: false,
              permissions: '-rw-r--r--',
              owner: 'testuser',
              group: 'test',
              last_modified: 1747855213.768398
            }
          ]
        })
      });
    }
  );
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

  // first file row - check for file name, date and size separately
  await expect(page.getByText('f1')).toBeVisible();
  await expect(page.getByText('May 21, 2025, 6:06 PM')).toBeVisible();
  await expect(page.getByText('10 bytes').first()).toBeVisible();

  const z2ExpandedStarButton = page
    .getByRole('list')
    .filter({ hasText: 'Z1homeprimaryZ2scratch' })
    .getByRole('button')
    .nth(3);

  await expect(
    z2ExpandedStarButton.locator('svg path[fill-rule]') // filled star
  ).toHaveCount(0);
  await expect(
    z2ExpandedStarButton.locator('svg path[stroke-linecap]') // empty star
  ).toHaveCount(1);

  // favor entire Z2
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Z2' })
    .getByRole('button')
    .click();

  const favoritesList = page.getByRole('list', { name: 'favorites-list' });
  const listItem = favoritesList
    .getByRole('listitem')
    .filter({ hasText: /^Z2$/ });
  // test that Z2 now shows in the favorites
  await expect(listItem).toBeVisible();

  // reload page - somehow page.reload hangs so I am going back to jupyterlab page
  await openFileGlancer(page);

  // test Z2 still shows as favorite
  await expect(listItem).toBeVisible();
});
