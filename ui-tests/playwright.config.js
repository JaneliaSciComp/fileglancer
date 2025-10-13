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
    command: 'pixi run dev-launch',
    url: 'http://localhost:7878/fg/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
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
