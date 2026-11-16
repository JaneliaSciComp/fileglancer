import { test, expect } from '@playwright/test';

test('jobs list is only fetched on the jobs page', async ({ page }) => {
  const jobRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/jobs')) {
      jobRequests.push(url.pathname);
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Log In', { timeout: 10000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('playwright');
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.waitForSelector('text=Zones', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Initial load (browse page): only the lightweight count is fetched.
  expect(jobRequests).toContain('/api/jobs/active-count');
  expect(jobRequests).not.toContain('/api/jobs');

  // The full listing is fetched once the jobs page is opened.
  await page.goto('/apps/jobs', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('You have not created any jobs yet')
  ).toBeVisible();
  expect(jobRequests).toContain('/api/jobs');
});
