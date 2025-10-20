import { Page } from '@playwright/test';

const TEST_USER = 'testUser';

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
};

const teardownMockAPI = async (page: Page) => {
  await page.unroute('/api/profile');
};

export { mockAPI, teardownMockAPI };
