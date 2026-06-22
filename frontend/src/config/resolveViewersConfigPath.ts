import { existsSync } from 'fs';
import path from 'path';

/**
 * Returns the path to the viewers config YAML to use.
 * If a custom viewers.config.yaml exists at the frontend root it takes
 * precedence over the committed default in src/config/.
 *
 * @param frontendDir - Absolute path to the frontend/ directory.
 * @param fileExists - Existence check, injectable for testing. Defaults to
 *   fs.existsSync. Mocking fs directly is unreliable here because
 *   vite-plugin-node-polyfills rewrites the bare `fs` import, so injection is
 *   used instead.
 */
export function resolveViewersConfigPath(
  frontendDir: string,
  fileExists: (filePath: string) => boolean = existsSync
): string {
  const overridePath = path.resolve(frontendDir, 'viewers.config.yaml');
  const defaultPath = path.resolve(
    frontendDir,
    'src/config/viewers.config.yaml'
  );
  return fileExists(overridePath) ? overridePath : defaultPath;
}
