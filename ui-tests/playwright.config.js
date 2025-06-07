/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

module.exports = {
  ...baseConfig,
  use: {
    trace: 'on-first-retry',
    video: 'on',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:8888/lab',
    timeout: 20 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
