import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Clean specific tables from the test database before each test
 * This ensures tests start with a clean slate while preserving file share paths
 */
export function cleanDatabase(testTempDir: string): void {
  const dbPath = join(testTempDir, 'test.db');

  if (!existsSync(dbPath)) {
    console.log('[DB Cleanup] Database does not exist yet, skipping cleanup');
    return;
  }

  try {
    const tables = ['proxied_paths', 'tickets', 'user_preferences'];

    for (const table of tables) {
      try {
        execSync(`sqlite3 "${dbPath}" "DELETE FROM ${table};"`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        console.log(`[DB Cleanup] Cleared table: ${table}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Check if it's a "table doesn't exist" error (expected for new databases)
        if (errorMessage.includes('no such table')) {
          console.log(`[DB Cleanup] Skipped ${table} (table does not exist)`);
        } else {
          // Unexpected error - this indicates a real problem (e.g., sqlite3 not installed)
          console.error(
            `[DB Cleanup] Failed to clear ${table}: ${errorMessage}`
          );
          throw new Error(
            `Database cleanup failed for table ${table}: ${errorMessage}`
          );
        }
      }
    }
  } catch (error) {
    console.error(`[DB Cleanup] Fatal error during database cleanup: ${error}`);
    throw error; // Fail tests immediately if cleanup fails
  }
}
