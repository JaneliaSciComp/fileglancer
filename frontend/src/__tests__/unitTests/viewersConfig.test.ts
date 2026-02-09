import { describe, it, expect } from 'vitest';
import { parseViewersConfig } from '@/config/viewersConfig';

describe('parseViewersConfig', () => {
  describe('Valid configurations', () => {
    it('should parse config with single manifest_url viewer', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/neuroglancer.yaml
`;
      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0].manifest_url).toBe(
        'https://example.com/neuroglancer.yaml'
      );
      expect(result.viewers[0].instance_template_url).toBeUndefined();
      expect(result.viewers[0].label).toBeUndefined();
      expect(result.viewers[0].logo).toBeUndefined();
    });

    it('should parse config with multiple viewers', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/neuroglancer.yaml
  - manifest_url: https://example.com/avivator.yaml
  - manifest_url: https://example.com/validator.yaml
`;
      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(3);
      expect(result.viewers[0].manifest_url).toBe(
        'https://example.com/neuroglancer.yaml'
      );
      expect(result.viewers[1].manifest_url).toBe(
        'https://example.com/avivator.yaml'
      );
      expect(result.viewers[2].manifest_url).toBe(
        'https://example.com/validator.yaml'
      );
    });

    it('should parse config with all optional fields', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    instance_template_url: https://example.com/viewer?url={dataLink}
    label: Custom Viewer Label
    logo: custom-logo.png
`;
      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0].manifest_url).toBe(
        'https://example.com/viewer.yaml'
      );
      expect(result.viewers[0].instance_template_url).toBe(
        'https://example.com/viewer?url={dataLink}'
      );
      expect(result.viewers[0].label).toBe('Custom Viewer Label');
      expect(result.viewers[0].logo).toBe('custom-logo.png');
    });

    it('should parse config with manifest_url only (no optional fields)', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/simple-viewer.yaml
`;
      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0]).toEqual({
        manifest_url: 'https://example.com/simple-viewer.yaml'
      });
    });
  });

  describe('Invalid YAML syntax', () => {
    it('should throw error for malformed YAML', () => {
      const invalidYaml = 'viewers:\n  - manifest_url: test\n    invalid: [[[';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
        /Failed to parse viewers configuration YAML/
      );
    });

    it('should throw error for non-object YAML (string)', () => {
      const invalidYaml = 'just a string';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
        /Configuration must have a "viewers" field/
      );
    });

    it('should throw error for non-object YAML (number)', () => {
      const invalidYaml = '123';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
        /Configuration must have a "viewers" field/
      );
    });

    it('should throw error for non-object YAML (array)', () => {
      const invalidYaml = '[1, 2, 3]';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
        /Configuration must have a "viewers" field/
      );
    });

    it('should throw error for empty YAML', () => {
      const invalidYaml = '';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
        /Configuration must have a "viewers" field/
      );
    });

    it('should throw error for null YAML', () => {
      const invalidYaml = 'null';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
        /Configuration must have a "viewers" field/
      );
    });
  });

  describe('Missing required fields', () => {
    it('should throw error when viewers array is missing', () => {
      const yaml = `
name: some-config
other_field: value
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /Configuration must have a "viewers" field containing an array/
      );
    });

    it('should throw error when viewer is missing manifest_url', () => {
      const yaml = `
viewers:
  - label: Custom Label
    logo: custom.png
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /Each viewer must have a "manifest_url" field/
      );
    });

    it('should throw error when viewers array is empty', () => {
      const yaml = `
viewers: []
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /"viewers" must contain at least one viewer/
      );
    });
  });

  describe('Invalid field types', () => {
    it('should throw error when manifest_url is not a string', () => {
      const yaml = `
viewers:
  - manifest_url: 123
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /Each viewer must have a "manifest_url" field/
      );
    });

    it('should throw error when manifest_url is not a valid URL', () => {
      const yaml = `
viewers:
  - manifest_url: not-a-valid-url
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /"manifest_url" must be a valid URL/
      );
    });

    it('should throw error when label is not a string', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    label: 123
`;

      expect(() => parseViewersConfig(yaml)).toThrow(/"label" must be a string/);
    });

    it('should throw error when logo is not a string', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    logo: 123
`;

      expect(() => parseViewersConfig(yaml)).toThrow(/"logo" must be a string/);
    });

    it('should throw error when instance_template_url is not a string', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    instance_template_url: 123
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /"instance_template_url" must be a string/
      );
    });

    it('should throw error when viewer entry is not an object (string in array)', () => {
      const yaml = `
viewers:
  - just-a-string
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /Each viewer must be an object with a "manifest_url" field/
      );
    });

    it('should throw error when viewer entry is not an object (number in array)', () => {
      const yaml = `
viewers:
  - 123
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /Each viewer must be an object with a "manifest_url" field/
      );
    });

    it('should throw error when viewers is not an array', () => {
      const yaml = `
viewers: not-an-array
`;

      expect(() => parseViewersConfig(yaml)).toThrow(
        /Configuration must have a "viewers" field containing an array/
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle single viewer with only manifest_url', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
`;

      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(1);
      expect(result.viewers[0]).toEqual({
        manifest_url: 'https://example.com/viewer.yaml'
      });
    });

    it('should preserve all valid optional fields in output', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    instance_template_url: https://example.com/viewer?url={dataLink}
    label: Custom Label
    logo: custom.png
`;

      const result = parseViewersConfig(yaml);

      expect(result.viewers[0]).toEqual({
        manifest_url: 'https://example.com/viewer.yaml',
        instance_template_url: 'https://example.com/viewer?url={dataLink}',
        label: 'Custom Label',
        logo: 'custom.png'
      });
    });

    it('should strip/ignore unknown fields', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    unknown_field: some-value
    another_unknown: 123
`;

      const result = parseViewersConfig(yaml);

      // Zod should strip unknown fields
      expect(result.viewers[0]).toEqual({
        manifest_url: 'https://example.com/viewer.yaml'
      });
      expect(result.viewers[0]).not.toHaveProperty('unknown_field');
      expect(result.viewers[0]).not.toHaveProperty('another_unknown');
    });

    it('should accept http and https URLs', () => {
      const yaml = `
viewers:
  - manifest_url: http://example.com/viewer.yaml
  - manifest_url: https://example.com/viewer.yaml
`;

      const result = parseViewersConfig(yaml);

      expect(result.viewers).toHaveLength(2);
      expect(result.viewers[0].manifest_url).toBe(
        'http://example.com/viewer.yaml'
      );
      expect(result.viewers[1].manifest_url).toBe(
        'https://example.com/viewer.yaml'
      );
    });

    it('should handle URL with special characters', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer-config_v2.yaml?version=1.0&format=yaml
`;

      const result = parseViewersConfig(yaml);

      expect(result.viewers[0].manifest_url).toBe(
        'https://example.com/viewer-config_v2.yaml?version=1.0&format=yaml'
      );
    });

    it('should handle empty optional strings', () => {
      const yaml = `
viewers:
  - manifest_url: https://example.com/viewer.yaml
    label: ""
    logo: ""
    instance_template_url: ""
`;

      const result = parseViewersConfig(yaml);

      expect(result.viewers[0]).toEqual({
        manifest_url: 'https://example.com/viewer.yaml',
        label: '',
        logo: '',
        instance_template_url: ''
      });
    });
  });
});
