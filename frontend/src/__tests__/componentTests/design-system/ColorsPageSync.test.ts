/**
 * Verifies that the hardcoded hex values in ColorsPage stay in sync
 * with the source of truth in tailwind.config.js (mtConfig plugin).
 *
 * If this test fails, update the color data in ColorsPage.tsx to match
 * the current tailwind.config.js values.
 */

import { describe, it, expect } from 'vitest';

import {
  lightModeColors,
  darkModeColors
} from '@/components/designSystem/previewRoutes/ColorsPage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import tailwindConfig from '../../../../tailwind.config.js';

// Colors are passed to mtConfig() in tailwind.config.js as arguments.
// Since we can't introspect plugin args, we'll read the
// config file source and extract the color objects.
function getMtConfigArg(): {
  colors: Record<string, string | Record<string, string>>;
  darkColors: Record<string, string | Record<string, string>>;
} {
  void tailwindConfig; // ensure the import isn't tree-shaken

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');

  const configPath = path.resolve(__dirname, '../../../../tailwind.config.js');
  const source = fs.readFileSync(configPath, 'utf-8');

  // Extract the mtConfig({ ... }) call. It spans from `mtConfig({` to the
  // matching `})`. We use a simple brace-counting parser.
  const mtStart = source.indexOf('mtConfig({');
  if (mtStart === -1) throw new Error('Could not find mtConfig call');

  let depth = 0;
  let objStart = -1;
  for (let i = mtStart + 'mtConfig'.length; i < source.length; i++) {
    if (source[i] === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        const objSource = source.slice(objStart, i + 1);
        // Convert JS object literal to JSON-parseable string:
        // - strip comments
        // - add quotes around keys
        // - remove trailing commas
        const jsonStr = objSource
          .replace(/\/\/.*$/gm, '') // strip line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
          .replace(/(?<=[{,]\s*)(\w+)(?=\s*:)/g, '"$1"') // quote unquoted keys
          .replace(/,(\s*[}\]])/g, '$1') // remove trailing commas
          .replace(/'/g, '"'); // single quotes to double

        return JSON.parse(jsonStr);
      }
    }
  }
  throw new Error('Could not parse mtConfig argument');
}

function normalizeHex(hex: string): string {
  return hex.toUpperCase();
}

describe('ColorsPage sync with tailwind.config.js', () => {
  const configColors = getMtConfigArg();

  it('light mode simple colors match tailwind config', () => {
    for (const simple of lightModeColors.simpleColors) {
      const configValue = configColors.colors[simple.name];
      expect(configValue).toBeDefined();
      expect(normalizeHex(simple.hex)).toBe(
        normalizeHex(configValue as string)
      );
    }
  });

  it('light mode color groups match tailwind config', () => {
    for (const group of lightModeColors.colorGroups) {
      const configGroup = configColors.colors[group.name];
      expect(configGroup).toBeDefined();
      expect(typeof configGroup).toBe('object');
      const configVariants = configGroup as Record<string, string>;

      for (const variant of [
        'default',
        'dark',
        'light',
        'foreground'
      ] as const) {
        expect(normalizeHex(group.variants[variant])).toBe(
          normalizeHex(configVariants[variant])
        );
      }
    }
  });

  it('dark mode simple colors match tailwind config', () => {
    for (const simple of darkModeColors.simpleColors) {
      const configValue = configColors.darkColors[simple.name];
      expect(configValue).toBeDefined();
      expect(normalizeHex(simple.hex)).toBe(
        normalizeHex(configValue as string)
      );
    }
  });

  it('dark mode color groups match tailwind config', () => {
    for (const group of darkModeColors.colorGroups) {
      const configGroup = configColors.darkColors[group.name];
      expect(configGroup).toBeDefined();
      expect(typeof configGroup).toBe('object');
      const configVariants = configGroup as Record<string, string>;

      for (const variant of [
        'default',
        'dark',
        'light',
        'foreground'
      ] as const) {
        expect(normalizeHex(group.variants[variant])).toBe(
          normalizeHex(configVariants[variant])
        );
      }
    }
  });

  it('ColorsPage covers all color groups from tailwind config', () => {
    const lightGroupNames = lightModeColors.colorGroups.map(g => g.name);
    const darkGroupNames = darkModeColors.colorGroups.map(g => g.name);

    // Every grouped color in the config should appear in ColorsPage
    for (const [name, value] of Object.entries(configColors.colors)) {
      if (typeof value === 'object') {
        expect(lightGroupNames).toContain(name);
      }
    }
    for (const [name, value] of Object.entries(configColors.darkColors)) {
      if (typeof value === 'object') {
        expect(darkGroupNames).toContain(name);
      }
    }
  });
});
