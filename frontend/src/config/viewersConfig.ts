import yaml from 'js-yaml';
import { z } from 'zod';

/**
 * Zod schema for viewer entry from viewers.config.yaml
 */
const ViewerConfigEntrySchema = z.object(
  {
    name: z.string({
      message: 'Each viewer must have a "name" field (string)'
    }),
    url: z.string({ message: '"url" must be a string' }).optional(),
    label: z.string({ message: '"label" must be a string' }).optional(),
    logo: z.string({ message: '"logo" must be a string' }).optional(),
    ome_zarr_versions: z
      .array(z.number(), { message: '"ome_zarr_versions" must be an array' })
      .optional()
  },
  {
    error: iss => {
      // When the viewer entry itself isn't an object
      if (iss.code === 'invalid_type' && iss.expected === 'object') {
        return 'Each viewer must have a "name" field (string)';
      }
      // Return undefined to use default behavior for other errors
      return undefined;
    }
  }
);

/**
 * Zod schema for viewers.config.yaml structure
 */
const ViewersConfigYamlSchema = z.object(
  {
    valid_ome_zarr_versions: z
      .array(
        z.number({
          message: '"valid_ome_zarr_versions" must contain only numbers'
        }),
        {
          message:
            'Configuration must have a "valid_ome_zarr_versions" field containing an array of numbers'
        }
      )
      .min(1, {
        message: '"valid_ome_zarr_versions" must not be empty'
      }),
    viewers: z.array(ViewerConfigEntrySchema, {
      message:
        'Configuration must have a "viewers" field containing an array of viewers'
    })
  },
  {
    error: iss => {
      if (iss.code === 'invalid_type') {
        return {
          message:
            'Configuration must have "valid_ome_zarr_versions" and "viewers" fields'
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
 * @param viewersWithManifests - Array of viewer names that have capability manifests (from initializeViewerManifests)
 */
export function parseViewersConfig(
  yamlContent: string,
  viewersWithManifests: string[] = []
): ViewersConfigYaml {
  let parsed: unknown;

  try {
    parsed = yaml.load(yamlContent);
  } catch (error) {
    throw new Error(
      `Failed to parse viewers configuration YAML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // First pass: validate basic structure with Zod
  const baseValidation = ViewersConfigYamlSchema.safeParse(parsed);

  if (!baseValidation.success) {
    // Extract the first error message with path context to extract viewer name if possible
    const firstError = baseValidation.error.issues[0];

    // Check if the error is nested within a specific viewer
    if (firstError.path.length > 0 && firstError.path[0] === 'viewers') {
      // Extract viewer index from path (e.g., ['viewers', 0, 'ome_zarr_versions'])
      const viewerIndex = firstError.path[1];

      if (
        typeof viewerIndex === 'number' &&
        parsed &&
        typeof parsed === 'object'
      ) {
        const configData = parsed as { viewers?: unknown[] };
        const viewer = configData.viewers?.[viewerIndex];

        // Try to get viewer name if it exists
        if (viewer && typeof viewer === 'object' && 'name' in viewer) {
          const viewerName = (viewer as { name: unknown }).name;
          if (typeof viewerName === 'string') {
            throw new Error(`Viewer "${viewerName}": ${firstError.message}`);
          }
        }
      }
    }

    // Fallback to original error message
    throw new Error(firstError.message);
  }

  const config = baseValidation.data;

  // Normalize viewer names for comparison (case-insensitive)
  const normalizedManifestViewers = viewersWithManifests.map(name =>
    name.toLowerCase()
  );

  // Second pass: validate manifest-dependent requirements and cross-field constraints
  for (let i = 0; i < config.viewers.length; i++) {
    const viewer = config.viewers[i];

    // Check if this viewer has a capability manifest
    const hasManifest = normalizedManifestViewers.includes(
      viewer.name.toLowerCase()
    );

    // If this viewer doesn't have a capability manifest, require additional fields
    if (!hasManifest) {
      if (!viewer.url) {
        throw new Error(
          `Viewer "${viewer.name}" does not have a capability manifest and must specify "url"`
        );
      }
      if (!viewer.ome_zarr_versions || viewer.ome_zarr_versions.length === 0) {
        throw new Error(
          `Viewer "${viewer.name}" does not have a capability manifest and must specify "ome_zarr_versions" (array of numbers)`
        );
      }
    }

    // Validate ome_zarr_versions values if present
    if (viewer.ome_zarr_versions) {
      for (const version of viewer.ome_zarr_versions) {
        if (!config.valid_ome_zarr_versions.includes(version)) {
          throw new Error(
            `Viewer "${viewer.name}": invalid ome_zarr_version "${version}". Valid versions are: ${config.valid_ome_zarr_versions.join(', ')}`
          );
        }
      }
    }
  }

  return config;
}
