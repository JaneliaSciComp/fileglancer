import yaml from 'js-yaml';
import { z } from 'zod';

/**
 * Zod schema for viewer entry from viewers.config.yaml
 */
const ViewerConfigEntrySchema = z.object(
  {
    manifest_url: z
      .string({
        message: 'Each viewer must have a "manifest_url" field (string)'
      })
      .refine(val => val.startsWith('/') || URL.canParse(val), {
        message:
          '"manifest_url" must be a valid URL or an absolute path starting with /'
      }),
    instance_template_url: z
      .string({ message: '"instance_template_url" must be a string' })
      .optional(),
    label: z.string({ message: '"label" must be a string' }).optional(),
    logo: z.string({ message: '"logo" must be a string' }).optional()
  },
  {
    error: iss => {
      if (iss.code === 'invalid_type' && iss.expected === 'object') {
        return 'Each viewer must be an object with a "manifest_url" field';
      }
      return undefined;
    }
  }
);

/**
 * Zod schema for viewers.config.yaml structure
 */
const ViewersConfigYamlSchema = z.object(
  {
    viewers: z
      .array(ViewerConfigEntrySchema, {
        message:
          'Configuration must have a "viewers" field containing an array of viewers'
      })
      .min(1, {
        message: '"viewers" must contain at least one viewer'
      })
  },
  {
    error: iss => {
      if (iss.code === 'invalid_type') {
        return {
          message: 'Configuration must have a "viewers" field'
        };
      }
    }
  }
);

// exported for use in ViewersContext
export type ViewerConfigEntry = z.infer<typeof ViewerConfigEntrySchema>;

type ViewersConfigYaml = z.infer<typeof ViewersConfigYamlSchema>;

/**
 * Parse and validate viewers configuration YAML
 * @param yamlContent - The YAML content to parse
 */
export function parseViewersConfig(yamlContent: string): ViewersConfigYaml {
  let parsed: unknown;

  try {
    parsed = yaml.load(yamlContent);
  } catch (error) {
    throw new Error(
      `Failed to parse viewers configuration YAML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  const result = ViewersConfigYamlSchema.safeParse(parsed);

  if (!result.success) {
    const firstError = result.error.issues[0];

    // Check if the error is nested within a specific viewer
    if (firstError.path.length > 0 && firstError.path[0] === 'viewers') {
      const viewerIndex = firstError.path[1];

      if (
        typeof viewerIndex === 'number' &&
        parsed &&
        typeof parsed === 'object'
      ) {
        const configData = parsed as { viewers?: unknown[] };
        const viewer = configData.viewers?.[viewerIndex];

        if (viewer && typeof viewer === 'object' && 'manifest_url' in viewer) {
          const manifestUrl = (viewer as { manifest_url: unknown })
            .manifest_url;
          if (typeof manifestUrl === 'string') {
            throw new Error(`Viewer "${manifestUrl}": ${firstError.message}`);
          }
        }
      }
    }

    throw new Error(firstError.message);
  }

  return result.data;
}
