import { Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const sleepInSecs = (secs: number) =>
  new Promise(resolve => setTimeout(resolve, secs * 1000));

async function getTestTempDir(): Promise<string> {
  const tempDir = os.tmpdir();
  const entries = await fs.readdir(tempDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('fg-playwright-')) {
      return path.join(tempDir, entry.name);
    }
  }
  throw new Error('Test temp directory not found');
}

async function createTestFilesInScratchDir(): Promise<void> {
  const testTempDir = await getTestTempDir();
  const scratchDir = path.join(testTempDir, 'scratch');
  await writeFiles(scratchDir);
}

const TEST_FILES = [
  { name: 'f1', content: 'test content for f1' },
  { name: 'f2', content: 'test content for f2' },
  { name: 'f3', content: 'test content for f3' }
] as const;

// Async, for use in tests
async function writeFiles(dir: string): Promise<void> {
  for (const file of TEST_FILES) {
    await fs.writeFile(path.join(dir, file.name), file.content);
  }
}

// Sync, for use in playwright.config.js (runs synchronously during initial setup)
function writeFilesSync(dir: string): void {
  const fsSync = require('fs');
  for (const file of TEST_FILES) {
    fsSync.writeFileSync(path.join(dir, file.name), file.content);
  }
}

const openFileglancer = async (page: Page) => {
  // Navigate directly to Fileglancer standalone app
  await page.goto('/fg/', {
    waitUntil: 'domcontentloaded'
  });
  // Wait for the app to be ready
  await page.waitForSelector('text=Log In', { timeout: 10000 });

  // Perform login
  const loginForm = page.getByRole('textbox', { name: 'Username' });
  const loginSubmitBtn = page.getByRole('button', { name: 'Log In' });
  await loginForm.fill('testUser');
  await loginSubmitBtn.click();

  // Wait for the main UI to load
  await page.waitForSelector('text=Zones', { timeout: 10000 });
};

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

export {
  sleepInSecs,
  openFileglancer,
  mockAPI,
  teardownMockAPI,
  createTestFilesInScratchDir,
  writeFilesSync
};
