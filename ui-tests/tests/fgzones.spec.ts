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

test.skip('favor entire zone with reload page', async ({ page }) => {
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

  await expect(page.getByText(`${TEST_SHARED_PATHS[2].name}`)).toBeVisible();

  // first file row
  await expect(page.getByText('f1FileMay 21, 202510 bytes')).toBeVisible();

  // second file row
  await expect(page.getByText('f2FileMay 21, 202510 bytes')).toBeVisible();

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
  // test that Z2 now shows in the favorites
  await expect(
    page.getByRole('list').filter({ hasText: /^Z2$/ }).getByRole('paragraph')
  ).toBeVisible();
  // test that the star appear next to favorite Z2
  await expect(
    page.getByRole('list').filter({ hasText: /^Z2$/ }).getByRole('button')
  ).toBeVisible();

  await expect(
    z2ExpandedStarButton.locator('svg path[fill-rule]') // filled star
  ).toHaveCount(1);
  await expect(
    z2ExpandedStarButton.locator('svg path[stroke-linecap]') // empty star
  ).toHaveCount(0);

  // reload page - somehow page.reload hangs so I am going back to jupyterlab page
  await openFileGlancer(page);

  const z2CollapsedStarButton = page.getByRole('button').nth(4);
  // test Z2 still shows as favorite
  await expect(
    z2CollapsedStarButton.locator('svg path[fill-rule]') // filled star
  ).toHaveCount(1);
  await expect(
    z2CollapsedStarButton.locator('svg path[stroke-linecap]') // empty star
  ).toHaveCount(0);
});
