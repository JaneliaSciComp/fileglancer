# Viewers Configuration Guide

Fileglancer supports dynamic configuration of OME-Zarr viewers. This allows administrators to customize which viewers are available in their deployment, override viewer URLs, and control how compatibility is determined.

## Overview

The viewer system is built on capability manifests:

- **`viewers.config.yaml`**: Configuration file listing viewers and their manifest URLs
- **Capability manifest files**: YAML files describing each viewer's name, URL template, and capabilities
- **`@bioimagetools/capability-manifest`**: Library that loads manifests and checks dataset compatibility
- **`ViewersContext`**: React context that provides viewer information to the application

Each viewer is defined by a **capability manifest** hosted at a URL. The configuration file simply lists manifest URLs and optional overrides. At runtime, the manifests are fetched, and the `@bioimagetools/capability-manifest` library determines which viewers are compatible with a given dataset based on the manifest's declared capabilities.

## Customize Viewers

**Note:** No configuration is required to use the default viewers defined in `frontend/src/config/viewers.config.yaml`.

1. Copy the default config: `cp frontend/src/config/viewers.config.yaml frontend/viewers.config.yaml`
2. Edit `frontend/viewers.config.yaml` to customize viewers
3. Rebuild the application: `pixi run node-build`

## Runtime Configuration (System Deployments)

For deployments where Fileglancer is installed from PyPI and the frontend is pre-built, you can override the viewers configuration at runtime without rebuilding.

Set the `FGC_VIEWERS_CONFIG` environment variable (or `viewers_config` in `config.yaml`) to the absolute path of a `viewers.config.yaml` file on disk:

```env
FGC_VIEWERS_CONFIG=/opt/deploy/viewers.config.yaml
```

Or in `config.yaml`:

```yaml
viewers_config: /opt/deploy/viewers.config.yaml
```

When set, the application serves this file via the API and the frontend uses it instead of the bundled config. The file follows the same format as the build-time `viewers.config.yaml`.

### Precedence

The viewers configuration is resolved in the following order (highest priority first):

1. **Runtime API config** — served from the path in `FGC_VIEWERS_CONFIG` (no rebuild required)
2. **Build-time override** — `frontend/viewers.config.yaml` (requires rebuild)
3. **Build-time default** — `frontend/src/config/viewers.config.yaml` (requires rebuild)

## Configuration File

### Location

There are three config locations, resolved in order of precedence:

| Location | Purpose |
| -------- | ------- |
| Path in `FGC_VIEWERS_CONFIG` | **Runtime override** — served via API, no rebuild required; ideal for system deployments |
| `frontend/viewers.config.yaml` | **Build-time override** — gitignored, safe to customize without merge conflicts |
| `frontend/src/config/viewers.config.yaml` | **Default config** — committed source file, used when no override exists |

Copy `frontend/src/config/viewers.config.yaml` to `frontend/viewers.config.yaml` to create a local override. This file is listed in `.gitignore` so your customizations will not conflict with upstream updates.

**Important:** The build-time configs are bundled at build time and changes require rebuilding the application. Runtime config via `FGC_VIEWERS_CONFIG` does **not** require rebuilding.

### Structure

The configuration file has a single top-level key, `viewers`, containing a list of viewer entries. Each entry requires a `manifest_url` and supports optional overrides.

#### Viewer Entry Fields

| Field                   | Required | Description                                                                      |
| ----------------------- | -------- | -------------------------------------------------------------------------------- |
| `manifest_url`          | Yes      | URL to a capability manifest YAML file                                           |
| `instance_template_url` | No       | Override the viewer's `template_url` from the manifest                           |
| `label`                 | No       | Custom tooltip text (defaults to "View in {Name}")                               |

### Default Configuration

The default `viewers.config.yaml` configures four viewers:

```yaml
viewers:
  - manifest_url: "https://raw.githubusercontent.com/BioImageTools/capability-manifest/host-manifests-and-docs/manifests/neuroglancer.yaml"

  - manifest_url: "https://raw.githubusercontent.com/BioImageTools/capability-manifest/host-manifests-and-docs/manifests/avivator.yaml"

  - manifest_url: "https://raw.githubusercontent.com/BioImageTools/capability-manifest/host-manifests-and-docs/manifests/validator.yaml"

  - manifest_url: "https://raw.githubusercontent.com/BioImageTools/capability-manifest/host-manifests-and-docs/manifests/vole.yaml"
```

## Capability Manifest Files

Manifest files describe a viewer's identity and capabilities. The default manifests are hosted in the [`@bioimagetools/capability-manifest`](https://github.com/BioImageTools/capability-manifest) repository. You can host your own manifest files anywhere accessible via URL. See the [`@bioimagetools/capability-manifest`](https://github.com/BioImageTools/capability-manifest) repository for information on how to format a viewer manifest.

## Configuration Examples

### Minimal: single viewer

```yaml
viewers:
  - manifest_url: "https://raw.githubusercontent.com/BioImageTools/capability-manifest/host-manifests-and-docs/manifests/neuroglancer.yaml"
```

### Override a viewer's URL

Use `instance_template_url` to point to a custom deployment of a viewer while still using its manifest for capability matching:

```yaml
viewers:
  - manifest_url: "https://raw.githubusercontent.com/BioImageTools/capability-manifest/host-manifests-and-docs/manifests/avivator.yaml"
    instance_template_url: "https://my-avivator-instance.example.com/?image_url={dataLink}"

```

### Add a custom viewer

To add a new viewer, create a capability manifest YAML file, host it at a URL, and reference it in the config:

1. Create a manifest file (e.g., `my-viewer.yaml`). Follow the format guidelines in the [`@bioimagetools/capability-manifest`](https://github.com/BioImageTools/capability-manifest) repository.

2. Host the manifest at an accessible URL (e.g., on GitHub or any web server).

3. Reference it in `viewers.config.yaml`:

```yaml
viewers:
  - manifest_url: "https://example.com/manifests/my-viewer.yaml"
    label: "Open in My Viewer"
```

## How Compatibility Works

The `@bioimagetools/capability-manifest` library handles all compatibility checking. When a user views an OME-Zarr dataset:

1. The application reads the dataset's metadata (OME-Zarr version, axes, codecs, etc.)
2. For each registered viewer, the library's `validateViewer()` function compares the dataset metadata against the manifest's declared capabilities
3. Only viewers whose capabilities match the dataset are shown to the user
4. Incompatibility reasons (e.g., "Viewer does not support OME-Zarr v3") are logged to the browser console for debugging

This replaces the previous system where `valid_ome_zarr_versions` was a global config setting and custom viewers used simple version matching. Now all compatibility logic is driven by the detailed capabilities declared in each viewer's manifest.

## Viewer Logos

Viewer logos are managed by the `@bioimagetools/capability-manifest` library. Logo resolution follows this order:

1. **Override**: If the manifest includes a `viewer.logo` field, that URL is used directly
2. **Convention-based**: Otherwise, the logo URL is derived from the viewer name (lowercased, spaces replaced with hyphens, e.g. "OME-Zarr Validator" → `ome-zarr-validator.png`) and hosted alongside the manifests
3. **Fallback**: If the logo fails to load at runtime, a bundled fallback image is shown

## Development

When developing with custom configurations:

1. Copy the default config: `cp frontend/src/config/viewers.config.yaml frontend/viewers.config.yaml`
2. Edit `frontend/viewers.config.yaml`
3. Rebuild frontend: `pixi run node-build` or use watch mode: `pixi run dev-watch`
4. Check the browser console for viewer initialization messages

### Validation

The configuration is validated at build time using Zod schemas (see `frontend/src/config/viewersConfig.ts`). Validation enforces:

- The `viewers` array must contain at least one entry
- Each entry must have a valid `manifest_url` (a properly formed URL)
- Optional fields (`instance_template_url`, `label`) must be strings if present

At runtime, manifests that fail to load are skipped with a warning. If a viewer has no `template_url` (neither from its manifest nor from `instance_template_url` in the config), it is also skipped.

## Copy URL Tool

The "Copy data URL" tool is always available when a data URL exists, regardless of viewer configuration.
