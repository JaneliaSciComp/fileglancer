import * as fs from 'fs/promises';
import * as path from 'path';

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

export { writeFiles, writeFilesSync };
