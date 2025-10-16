/**
 * Configuration for Playwright for standalone Fileglancer app
 */
import { defineConfig } from '@playwright/test';
import { mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFilesSync } from './tests/testutils';

// Create a unique temp directory for this test run
const testTempDir = mkdtempSync(join(tmpdir(), 'fg-playwright-'));
const testDbPath = join(testTempDir, 'test.db');

const homeDir = join(testTempDir, 'home');
const primaryDir = join(testTempDir, 'primary');
const scratchDir = join(testTempDir, 'scratch');

mkdirSync(homeDir, { recursive: true });
mkdirSync(primaryDir, { recursive: true });
mkdirSync(scratchDir, { recursive: true });

writeFilesSync(scratchDir);

// Export temp directory path for global teardown
global.testTempDir = testTempDir;

export default defineConfig({
  reporter: [['html', { open: process.env.CI ? 'never' : 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:7878',
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
    timeout: 120_000,
    env: {
      FGC_DB_URL: `sqlite:///${testDbPath}`,
      FGC_FILE_SHARE_MOUNTS: JSON.stringify([homeDir, primaryDir, scratchDir])
    }
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
  ],

  // Clean up temp directory after all tests complete
  globalTeardown: './global-teardown.js'
});
