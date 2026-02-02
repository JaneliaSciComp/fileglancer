import yaml from "js-yaml";

/**
 * Viewer entry from viewers.config.yaml
 */
export interface ViewerConfigEntry {
  name: string;
  url?: string;
  label?: string;
  logo?: string;
  ome_zarr_versions?: number[];
}

/**
 * Structure of viewers.config.yaml
 */
export interface ViewersConfigYaml {
  viewers: ViewerConfigEntry[];
}

/**
 * Parse and validate viewers configuration YAML
 * @param yamlContent - The YAML content to parse
 * @param viewersWithManifests - Array of viewer names that have capability manifests (from initializeViewerManifests)
 */
export function parseViewersConfig(
  yamlContent: string,
  viewersWithManifests: string[] = [],
): ViewersConfigYaml {
  let parsed: unknown;

  try {
    parsed = yaml.load(yamlContent);
  } catch (error) {
    throw new Error(
      `Failed to parse viewers configuration YAML: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Configuration must be an object");
  }

  const config = parsed as Record<string, unknown>;

  if (!Array.isArray(config.viewers)) {
    throw new Error('Configuration must have a "viewers" array');
  }

  // Normalize viewer names for comparison (case-insensitive)
  const normalizedManifestViewers = viewersWithManifests.map((name) =>
    name.toLowerCase(),
  );

  // Validate each viewer entry
  for (const viewer of config.viewers) {
    if (!viewer || typeof viewer !== "object") {
      throw new Error("Each viewer must be an object");
    }

    const v = viewer as Record<string, unknown>;

    if (typeof v.name !== "string") {
      throw new Error('Each viewer must have a "name" field (string)');
    }

    // Check if this viewer has a capability manifest
    const hasManifest = normalizedManifestViewers.includes(
      v.name.toLowerCase(),
    );

    // If this viewer doesn't have a capability manifest, require additional fields
    if (!hasManifest) {
      if (typeof v.url !== "string") {
        throw new Error(
          `Viewer "${v.name}" does not have a capability manifest and must specify "url"`,
        );
      }
      if (
        !Array.isArray(v.ome_zarr_versions) ||
        v.ome_zarr_versions.length === 0
      ) {
        throw new Error(
          `Viewer "${v.name}" does not have a capability manifest and must specify "ome_zarr_versions" (array of numbers)`,
        );
      }
    }

    // Validate optional fields if present
    if (v.url !== undefined && typeof v.url !== "string") {
      throw new Error(`Viewer "${v.name}": "url" must be a string`);
    }
    if (v.label !== undefined && typeof v.label !== "string") {
      throw new Error(`Viewer "${v.name}": "label" must be a string`);
    }
    if (v.logo !== undefined && typeof v.logo !== "string") {
      throw new Error(`Viewer "${v.name}": "logo" must be a string`);
    }
    if (
      v.ome_zarr_versions !== undefined &&
      !Array.isArray(v.ome_zarr_versions)
    ) {
      throw new Error(
        `Viewer "${v.name}": "ome_zarr_versions" must be an array`,
      );
    }
  }

  return config as unknown as ViewersConfigYaml;
}
