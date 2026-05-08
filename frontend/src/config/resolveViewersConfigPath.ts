import { existsSync } from 'fs';
import path from 'path';

/**
 * Returns the path to the viewers config YAML to use.
 * If a custom viewers.config.yaml exists at the frontend root it takes
 * precedence over the committed default in src/config/.
 *
 * @param frontendDir - Absolute path to the frontend/ directory.
 */
export function resolveViewersConfigPath(frontendDir: string): string {
  const overridePath = path.resolve(frontendDir, 'viewers.config.yaml');
  const defaultPath = path.resolve(
    frontendDir,
    'src/config/viewers.config.yaml'
  );
  return existsSync(overridePath) ? overridePath : defaultPath;
}
