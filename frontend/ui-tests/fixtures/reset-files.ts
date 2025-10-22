/**
 * Utility to reset test files to their initial state
 * Used by fixtures to provide test isolation
 */
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { writeFilesSync } from '../mocks/files.js';
import { createZarrDirsSync } from '../mocks/zarrDirs.js';

/**
 * Resets test files in the scratch directory to their initial state
 * This ensures each test starts with a clean slate
 */
export async function resetTestFiles(): Promise<void> {
  const testTempDir = process.env.TEST_TEMP_DIR || global.testTempDir;

  if (!testTempDir) {
    throw new Error(
      'TEST_TEMP_DIR not found. Ensure playwright.config.js has run.'
    );
  }

  const scratchDir = join(testTempDir, 'scratch');

  // Remove and recreate scratch directory to ensure clean state
  if (existsSync(scratchDir)) {
    await rm(scratchDir, { recursive: true, force: true });
  }

  await mkdir(scratchDir, { recursive: true });

  // Recreate test files
  writeFilesSync(scratchDir);

  // Recreate Zarr test directories
  createZarrDirsSync(scratchDir);
}
