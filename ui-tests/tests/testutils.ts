const sleepInSecs = (secs: number) =>
  new Promise(resolve => setTimeout(resolve, secs * 1000));

const openFileGlancer = async (page: IJupyterLabPageFixture) => {
  // open jupyter lab
  await page.goto('http://localhost:8888/lab', {
    waitUntil: 'domcontentloaded'
  });
  // click on Fileglancer icon
  await page.getByText('Fileglancer', { exact: true }).click();
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

const mockAPI = async page => {
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
              last_modified: 1758924043.768398
            }
          ]
        })
      });
    }
  );
};

const teardownMockAPI = async page => {
  // remove all route handlers
  await page.unroute('/api/fileglancer/profile');
  await page.unroute('/api/fileglancer/file-share-paths');
  await page.unroute(`/api/fileglancer/files/${TEST_SHARED_PATHS[2].name}**`);
};

export {
  sleepInSecs,
  openFileGlancer,
  mockAPI,
  teardownMockAPI,
  TEST_SHARED_PATHS
};
