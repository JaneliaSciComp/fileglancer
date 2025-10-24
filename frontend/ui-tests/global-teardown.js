/**
 * Global teardown script for Playwright tests
 * Cleans up temporary test database directory and test files
 */
import { rmSync, existsSync } from 'fs';

export default async function globalTeardown() {
  try {
    // Clean up the specific test directory created for this test run
    const testTempDir = process.env.TEST_TEMP_DIR;

    if (testTempDir && existsSync(testTempDir)) {
      rmSync(testTempDir, { recursive: true, force: true });
      console.log(
        `Cleaned up test directory (database + file shares): ${testTempDir}`
      );
    }
  } catch (error) {
    console.warn(`Failed to clean up test directory: ${error}`);
  }
}
