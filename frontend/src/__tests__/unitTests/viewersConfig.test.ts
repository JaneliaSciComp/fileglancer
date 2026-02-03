import { describe, it, expect } from 'vitest';
import { parseViewersConfig } from '@/config/viewersConfig';

describe('parseViewersConfig', () => {
  describe('Valid configurations', () => {
    it('should parse valid config with viewers that have manifests', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
  - name: avivator
`;
      const result = parseViewersConfig(yaml, ['neuroglancer', 'avivator']);

      expect(result.valid_ome_zarr_versions).toEqual([0.4, 0.5]);
      expect(result.viewers).toHaveLength(2);
      expect(result.viewers[0].name).toBe('neuroglancer');
      expect(result.viewers[1].name).toBe('avivator');
    });

    it('should support custom valid_ome_zarr_versions', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5, 0.6]
viewers:
  - name: custom-viewer
    url: https://example.com/{dataLink}
    ome_zarr_versions: [0.6]
`;
      const result = parseViewersConfig(yaml, []);

      expect(result.valid_ome_zarr_versions).toEqual([0.4, 0.5, 0.6]);
      expect(result.viewers[0].ome_zarr_versions).toEqual([0.6]);
    });

    it('should parse config with custom viewer with all required fields', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com/{dataLink}
    ome_zarr_versions: [0.4, 0.5]
`;
      const result = parseViewersConfig(yaml, []);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0].name).toBe('custom-viewer');
      expect(result.viewers[0].url).toBe('https://example.com/{dataLink}');
      expect(result.viewers[0].ome_zarr_versions).toEqual([0.4, 0.5]);
    });

    it('should parse config with optional fields', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com/{dataLink}
    ome_zarr_versions: [0.4]
    label: Custom Viewer Label
    logo: custom-logo.png
`;
      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0].label).toBe('Custom Viewer Label');
      expect(result.viewers[0].logo).toBe('custom-logo.png');
    });

    it('should allow viewer with manifest to override url', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
    url: https://custom-neuroglancer.com/{dataLink}
`;
      const result = parseViewersConfig(yaml, ['neuroglancer']);

      expect(result.viewers[0].url).toBe(
        'https://custom-neuroglancer.com/{dataLink}'
      );
    });

    it('should parse mixed config with manifest and non-manifest viewers', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
  - name: custom-viewer
    url: https://example.com/{dataLink}
    ome_zarr_versions: [0.4]
  - name: avivator
`;
      const result = parseViewersConfig(yaml, ['neuroglancer', 'avivator']);

      expect(result.viewers).toHaveLength(3);
      expect(result.viewers[0].name).toBe('neuroglancer');
      expect(result.viewers[1].name).toBe('custom-viewer');
      expect(result.viewers[2].name).toBe('avivator');
    });
  });

  describe('Invalid YAML syntax', () => {
    it('should throw error for malformed YAML', () => {
      const invalidYaml = 'viewers:\n  - name: test\n    invalid: [[[';

      expect(() => parseViewersConfig(invalidYaml, [])).toThrow(
        /Failed to parse viewers configuration YAML/
      );
    });

    it('should throw error for invalid YAML structure', () => {
      const invalidYaml = 'this is not valid yaml [[{]}';

      // js-yaml parses this as a string, which then fails the object check
      expect(() => parseViewersConfig(invalidYaml, [])).toThrow(
        /Configuration must have "valid_ome_zarr_versions" and "viewers" fields/
      );
    });

    it('should throw error for non-object YAML', () => {
      const invalidYaml = 'just a string';

      expect(() => parseViewersConfig(invalidYaml, [])).toThrow(
        /Configuration must have "valid_ome_zarr_versions" and "viewers" fields/
      );
    });

    it('should throw error for empty YAML', () => {
      const invalidYaml = '';

      expect(() => parseViewersConfig(invalidYaml, [])).toThrow(
        /Configuration must have "valid_ome_zarr_versions" and "viewers" fields/
      );
    });
  });

  describe('Missing required fields', () => {
    it('should throw error when valid_ome_zarr_versions is missing', () => {
      const yaml = `
viewers:
  - name: neuroglancer
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Configuration must have a \"valid_ome_zarr_versions\" field containing an array of numbers/
      );
    });

    it('should throw error when valid_ome_zarr_versions is not an array', () => {
      const yaml = `
valid_ome_zarr_versions: "not-an-array"
viewers:
  - name: neuroglancer
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Configuration must have a \"valid_ome_zarr_versions\" field containing an array of numbers/
      );
    });

    it('should throw error when valid_ome_zarr_versions is empty', () => {
      const yaml = `
valid_ome_zarr_versions: []
viewers:
  - name: neuroglancer
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /"valid_ome_zarr_versions" must not be empty/
      );
    });

    it('should throw error when valid_ome_zarr_versions contains non-numbers', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, "0.5"]
viewers:
  - name: neuroglancer
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /"valid_ome_zarr_versions" must contain only numbers/
      );
    });

    it('should throw error when viewers array is missing', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
name: some-config
other_field: value
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Configuration must have a \"viewers\" field containing an array of viewers/
      );
    });

    it('should throw error when viewers is not an array', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers: not-an-array
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Configuration must have a \"viewers\" field containing an array of viewers/
      );
    });

    it('should throw error when viewer is not an object', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - just-a-string
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Each viewer must have a "name" field \(string\)/
      );
    });

    it('should throw error when viewer lacks name field', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - url: https://example.com
    ome_zarr_versions: [0.4]
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Each viewer must have a "name" field \(string\)/
      );
    });

    it('should throw error when viewer name is not a string', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: 123
    url: https://example.com
    ome_zarr_versions: [0.4]
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Each viewer must have a "name" field \(string\)/
      );
    });

    it('should throw error when custom viewer (no manifest) lacks url', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    ome_zarr_versions: [0.4]
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer" does not have a capability manifest and must specify "url"/
      );
    });

    it('should throw error when custom viewer (no manifest) lacks ome_zarr_versions', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com/{dataLink}
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer" does not have a capability manifest and must specify "ome_zarr_versions" \(array of numbers\)/
      );
    });

    it('should throw error when custom viewer has empty ome_zarr_versions array', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com/{dataLink}
    ome_zarr_versions: []
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer" does not have a capability manifest and must specify "ome_zarr_versions" \(array of numbers\)/
      );
    });
  });

  describe('Invalid field types', () => {
    it('should throw error when url is not a string (for custom viewer)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: 123
    ome_zarr_versions: [0.4]
`;

      // The required field check happens first, so if url is wrong type,
      // it's caught by the "must specify url" check
      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer": "url" must be a string/
      );
    });

    it('should throw error when url override is not a string (for manifest viewer)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
    url: 123
`;

      expect(() => parseViewersConfig(yaml, ['neuroglancer'])).toThrow(
        /Viewer "neuroglancer": "url" must be a string/
      );
    });

    it('should throw error when label is not a string', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.4]
    label: 123
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer": "label" must be a string/
      );
    });

    it('should throw error when logo is not a string', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.4]
    logo: 123
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer": "logo" must be a string/
      );
    });

    it('should throw error when ome_zarr_versions is not an array (for custom viewer)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: "not-an-array"
`;

      // The required field check happens first and checks if it's an array
      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /Viewer "custom-viewer": "ome_zarr_versions" must be an array/
      );
    });

    it('should throw error when ome_zarr_versions override is not an array (for manifest viewer)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
    ome_zarr_versions: "not-an-array"
`;

      expect(() => parseViewersConfig(yaml, ['neuroglancer'])).toThrow(
        /Viewer "neuroglancer": "ome_zarr_versions" must be an array/
      );
    });
  });

  describe('OME-Zarr version validation', () => {
    it('should accept valid ome_zarr_versions (0.4 and 0.5)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.4, 0.5]
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0].ome_zarr_versions).toEqual([0.4, 0.5]);
    });

    it('should throw error for invalid ome_zarr_version (0.3)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.3]
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /invalid ome_zarr_version "0.3". Valid versions are: 0.4, 0.5/
      );
    });

    it('should throw error for invalid ome_zarr_version (1.0)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [1.0]
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /invalid ome_zarr_version "1". Valid versions are: 0.4, 0.5/
      );
    });

    it('should throw error when mixing valid and invalid versions', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.3, 0.4, 0.5]
`;

      expect(() => parseViewersConfig(yaml, [])).toThrow(
        /invalid ome_zarr_version "0.3". Valid versions are: 0.4, 0.5/
      );
    });

    it('should throw error for invalid version in manifest viewer override', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
    ome_zarr_versions: [0.3]
`;

      expect(() => parseViewersConfig(yaml, ['neuroglancer'])).toThrow(
        /invalid ome_zarr_version "0.3". Valid versions are: 0.4, 0.5/
      );
    });

    it('should accept only 0.4', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.4]
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0].ome_zarr_versions).toEqual([0.4]);
    });

    it('should accept only 0.5', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom-viewer
    url: https://example.com
    ome_zarr_versions: [0.5]
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0].ome_zarr_versions).toEqual([0.5]);
    });
  });

  describe('Case sensitivity and normalization', () => {
    it('should handle case-insensitive manifest matching', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: Neuroglancer
  - name: AVIVATOR
`;

      // Manifest names are lowercase
      const result = parseViewersConfig(yaml, ['neuroglancer', 'avivator']);

      expect(result.viewers).toHaveLength(2);
      expect(result.viewers[0].name).toBe('Neuroglancer');
      expect(result.viewers[1].name).toBe('AVIVATOR');
    });

    it('should match manifests case-insensitively for mixed case', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: NeuroGlancer
`;

      // Should recognize this has a manifest (neuroglancer)
      const result = parseViewersConfig(yaml, ['neuroglancer']);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0].name).toBe('NeuroGlancer');
      // Should not require url or ome_zarr_versions since it has a manifest
    });
  });

  describe('Edge cases', () => {
    it('should handle empty viewers array', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers: []
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers).toHaveLength(0);
    });

    it('should handle viewer with only name (has manifest)', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
`;

      const result = parseViewersConfig(yaml, ['neuroglancer']);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0]).toEqual({ name: 'neuroglancer' });
    });

    it('should preserve all valid fields in parsed output', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom
    url: https://example.com
    label: Custom Label
    logo: custom.png
    ome_zarr_versions: [0.4, 0.5]
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0]).toEqual({
        name: 'custom',
        url: 'https://example.com',
        label: 'Custom Label',
        logo: 'custom.png',
        ome_zarr_versions: [0.4, 0.5]
      });
    });

    it('should handle multiple valid ome_zarr_versions', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom
    url: https://example.com
    ome_zarr_versions: [0.4, 0.5]
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0].ome_zarr_versions).toEqual([0.4, 0.5]);
    });

    it('should handle single ome_zarr_version in array', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom
    url: https://example.com
    ome_zarr_versions: [0.4]
`;

      const result = parseViewersConfig(yaml, []);

      expect(result.viewers[0].ome_zarr_versions).toEqual([0.4]);
    });
  });

  describe('Default parameter behavior', () => {
    it('should use empty array as default for viewersWithManifests', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: custom
    url: https://example.com
    ome_zarr_versions: [0.4]
`;

      // Not passing second parameter
      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0].name).toBe('custom');
    });

    it('should treat viewer as non-manifest when viewersWithManifests is empty', () => {
      const yaml = `
valid_ome_zarr_versions: [0.4, 0.5]
viewers:
  - name: neuroglancer
`;

      // Even though neuroglancer typically has a manifest,
      // if not in the list, it should require url and versions
      expect(() => parseViewersConfig(yaml, [])).toThrow(/must specify "url"/);
    });
  });
});
