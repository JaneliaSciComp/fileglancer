import { expect, test } from '@jupyterlab/galata';
import { openFileglancer } from '../testutils.ts';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';

/**
 * Don't load JupyterLab webpage before running the tests.
 * This is required to ensure we capture all log messages.
 */
test.use({ autoGoto: false });

test('should emit an activation console message', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', message => {
    logs.push(message.text());
  });

  await page.goto();

  expect(
    logs.filter(s => s === 'JupyterLab extension fileglancer is activated!')
  ).toHaveLength(1);
});

test('when fg icon clicked should open fileglancer extension', async ({
  page
}) => {
  const logs: string[] = [];

  page.on('console', message => {
    logs.push(message.text());
  });

  await openFileglancer(page);
  await expect(page.getByText('Browse')).toBeVisible();
});
