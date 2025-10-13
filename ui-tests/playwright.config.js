/**
 * Configuration for Playwright for standalone Fileglancer app
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    trace: 'on-first-retry',
    video: 'on',
    screenshot: 'only-on-failure'
  },
  timeout: process.env.CI ? 90_000 : 30_000,
  navigationTimeout: process.env.CI ? 90_000 : 30_000,
  workers: process.env.CI ? 1 : undefined,
  webServer: {
    command: 'npm start',
    url: 'http://localhost:8888/lab',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: 'local-app',
      testDir: './tests/localApp'
    },
    {
      name: 'mocked-fg-central-app',
      testDir: './tests/mockedFgCentralApp'
    }
  ]
});
