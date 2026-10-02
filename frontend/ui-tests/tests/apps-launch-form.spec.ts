import { expect, test } from '../fixtures/fileglancer-fixture';

test('number input does not collapse zero values', async ({
  fileglancerPage: page
}) => {
  await page.route('/api/apps/manifest', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'Test App',
        description: 'A test app.',
        runnables: [
          {
            id: 'run',
            name: 'Run Test App',
            type: 'job',
            description: 'Test app.',
            command: 'pixi run python demo.py',
            parameters: [
              {
                flag: '--threshold',
                key: 'threshold',
                name: 'Threshold',
                type: 'number',
                description:
                  'A decimal value that is only logged, for testing number input',
                required: false,
                default: 0.05
              }
            ]
          }
        ]
      })
    });
  });
  await page.goto('/apps/launch/testUser/testApp/main', {
    waitUntil: 'domcontentloaded'
  });
  const thresholdInput = page.getByRole('spinbutton', { name: 'Threshold' });
  await expect(thresholdInput).toBeVisible();
  await thresholdInput.clear();
  await thresholdInput.pressSequentially('0.01');
  // collapses to 1 if the input is not handled correctly, so we check that it remains 0.01
  await expect(thresholdInput).toHaveValue('0.01');
});
