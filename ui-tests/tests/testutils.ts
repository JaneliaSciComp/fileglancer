import { Page } from '@playwright/test';

const sleepInSecs = (secs: number) =>
  new Promise(resolve => setTimeout(resolve, secs * 1000));

const openFileGlancer = async (page: Page) => {
  // Navigate directly to Fileglancer standalone app
  await page.goto('/fg/', {
    waitUntil: 'domcontentloaded'
  });
  // Wait for the app to be ready
  await page.waitForSelector('text=Browse', { timeout: 10000 });
};

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

const mockAPI = async (page: Page) => {
  await page.route('/api/profile', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: TEST_USER
      })
    });
  });

  await page.route('/api/file-share-paths', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        paths: TEST_SHARED_PATHS
      })
    });
  });

  await page.route(`/api/files/${TEST_SHARED_PATHS[2].name}**`, async route => {
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
            last_modified: 1758924043.768398
          }
        ]
      })
    });
  });
};

const teardownMockAPI = async (page: Page) => {
  // remove all route handlers
  await page.unroute('/api/profile');
  await page.unroute('/api/file-share-paths');
  await page.unroute(`/api/files/${TEST_SHARED_PATHS[2].name}**`);
};

export {
  sleepInSecs,
  openFileGlancer,
  mockAPI,
  teardownMockAPI,
  TEST_SHARED_PATHS
};
