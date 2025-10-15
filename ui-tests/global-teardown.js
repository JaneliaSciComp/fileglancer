/**
 * Global teardown script for Playwright tests
 * Cleans up temporary test database directory
 */
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readdirSync } from 'fs';

export default async function globalTeardown() {
  try {
    // Find and remove all fg-playwright-* directories in temp
    const tempDir = tmpdir();
    const entries = readdirSync(tempDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('fg-playwright-')) {
        const fullPath = join(tempDir, entry.name);
        rmSync(fullPath, { recursive: true, force: true });
        console.log(`Cleaned up test database directory: ${fullPath}`);
      }
    }
  } catch (error) {
    console.warn(`Failed to clean up test directories: ${error}`);
  }
}
