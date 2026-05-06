/**
 * Verifies that the color groups in Colors.stories.tsx stay in sync
 * with the source of truth in tailwind.config.js (mtConfig plugin).
 *
 * If this test fails, update colorGroups in Colors.stories.tsx to match
 * the current tailwind.config.js values.
 */

import { describe, it, expect } from 'vitest';

import { colorGroups } from '@/components/designSystem/Colors.stories';

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

describe('Colors.stories sync with tailwind.config.js', () => {
  const configColors = getMtConfigArg();

  // Extract grouped color names from tailwind config (those with object values)
  const configGroupNames = Object.entries(configColors.colors)
    .filter(([, value]) => typeof value === 'object')
    .map(([name]) => name);

  it('story covers all color groups from tailwind config', () => {
    const storyGroupNames = Object.keys(colorGroups);
    for (const name of configGroupNames) {
      expect(storyGroupNames).toContain(name);
    }
  });

  it('story does not contain groups missing from tailwind config', () => {
    for (const name of Object.keys(colorGroups)) {
      expect(configGroupNames).toContain(name);
    }
  });

  it('each story group has all four variants', () => {
    const expectedVariants = ['default', 'dark', 'light', 'foreground'];
    for (const [name, variants] of Object.entries(colorGroups)) {
      const variantNames = Object.keys(variants);
      for (const expected of expectedVariants) {
        expect(
          variantNames,
          `${name} is missing variant "${expected}"`
        ).toContain(expected);
      }
    }
  });
});
