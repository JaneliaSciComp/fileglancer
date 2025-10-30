/**
 * Configuration for Playwright for standalone Fileglancer app
 */
import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Create temp directory for this test run
// Use fixed directory path so file share paths remain consistent across runs
// This is especially important in non-CI mode when reuseExistingServer is true
let testTempDir = process.env.TEST_TEMP_DIR;

if (!testTempDir) {
  testTempDir = join(tmpdir(), 'fg-playwright-test');
  process.env.TEST_TEMP_DIR = testTempDir;

  const scratchDir = join(testTempDir, 'scratch');
  mkdirSync(scratchDir, { recursive: true });
}

const testDbPath = join(testTempDir, 'test.db');
const scratchDir = join(testTempDir, 'scratch');

// Export temp directory path for tests and global teardown
global.testTempDir = testTempDir;

export default defineConfig({
  reporter: [['html', { open: process.env.CI ? 'never' : 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:7879',
    trace: 'on-first-retry',
    video: 'on',
    screenshot: 'only-on-failure'
  },
  timeout: process.env.CI ? 90_000 : 10_000,
  navigationTimeout: process.env.CI ? 90_000 : 10_000,
  workers: process.env.CI ? 1 : undefined,
  webServer: {
    command: 'pixi run test-launch',
    url: 'http://localhost:7879/fg/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      FGC_DB_URL: `sqlite:///${testDbPath}`,
      FGC_FILE_SHARE_MOUNTS: JSON.stringify([scratchDir])
    }
  }
});
