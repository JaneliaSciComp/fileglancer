/**
 * Configuration for Playwright for standalone Fileglancer app
 */
import { defineConfig } from '@playwright/test';
import { mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFilesSync } from './mocks/files.js';
import { createZarrDirsSync } from './mocks/zarrDirs.js';

// Create a unique temp directory for this test run ONLY if not already set
// This ensures all workers share the same temp directory
let testTempDir = process.env.TEST_TEMP_DIR;

if (!testTempDir) {
  testTempDir = mkdtempSync(join(tmpdir(), 'fg-playwright-'));
  process.env.TEST_TEMP_DIR = testTempDir;

  const primaryDir = join(testTempDir, 'primary');
  const scratchDir = join(testTempDir, 'scratch');
  mkdirSync(primaryDir, { recursive: true });
  mkdirSync(scratchDir, { recursive: true });

  // Create default test files (f1, f2, f3) for file-operations tests
  writeFilesSync(scratchDir);

  // Create Zarr test directories for load-zarr-files tests
  createZarrDirsSync(scratchDir);
}

const testDbPath = join(testTempDir, 'test.db');
const primaryDir = join(testTempDir, 'primary');
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
      FGC_FILE_SHARE_MOUNTS: JSON.stringify([primaryDir, scratchDir])
    }
  },
  // Clean up temp directory after all tests complete
  globalTeardown: './global-teardown.js'
});
