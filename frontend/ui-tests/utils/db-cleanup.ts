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
        console.log(`[DB Cleanup] Skipped ${table} (table may not exist)`);
      }
    }
  } catch (error) {
    console.warn(`[DB Cleanup] Failed to clean database: ${error}`);
  }
}
