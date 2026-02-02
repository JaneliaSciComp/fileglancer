# Viewers Configuration Guide

Fileglancer supports dynamic configuration of OME-Zarr viewers. This allows administrators to customize which viewers are available in their deployment and configure custom viewer URLs.

## Overview

The viewer system uses:

- **viewers.config.yaml**: User configuration file defining available viewers
- **@bioimagetools/capability-manifest**: Library for automatic compatibility detection
- **ViewersContext**: React context providing viewer information to the application

## Quick Start

1. Copy the template to the config directory:

```bash
cp docs/viewers.config.yaml.template frontend/src/config/viewers.config.yaml
```

2. Edit `frontend/src/config/viewers.config.yaml` to enable/disable viewers or customize URLs

3. Build the application - configuration is bundled at build time

## Configuration File Location

Place `viewers.config.yaml` in `frontend/src/config/` directory.

**Important:** This file is bundled at build time. Changes require rebuilding the application.

If no configuration file exists, Fileglancer defaults to Neuroglancer only.

## Viewer Types

### Viewers with Capability Manifests (Recommended)

These viewers have metadata describing their capabilities, allowing automatic compatibility detection. For example, Neuroglancer and Avivator. For these viewers, you only need to specify the name. URL and compatibility are handled automatically.

### Custom Viewers

For viewers without capability manifests, you must provide:

- `name`: Viewer identifier
- `url`: URL template (use `{dataLink}` placeholder for dataset URL)
- `ome_zarr_versions`: Array of supported OME-Zarr versions (e.g., `[0.4, 0.5]`)

Optionally:

- `logo`: Filename of logo in `frontend/src/assets/` (defaults to `{name}.png` if not specified)
- `label`: Custom tooltip text (defaults to "View in {Name}")

## Configuration Examples

### Enable default viewers

```yaml
viewers:
  - name: neuroglancer
  - name: avivator
```

### Override viewer URL

```yaml
viewers:
  - name: avivator
    url: "https://my-avivator-instance.example.com/?image_url={dataLink}"
```

### Add custom viewer (with convention-based logo)

```yaml
viewers:
  - name: my-viewer
    url: "https://viewer.example.com/?data={dataLink}"
    ome_zarr_versions: [0.4, 0.5]
    # Logo will automatically resolve to @/assets/my-viewer.png
    label: "Open in My Viewer"
```

### Add custom viewer (with explicit logo)

```yaml
viewers:
  - name: my-viewer
    url: "https://viewer.example.com/?data={dataLink}"
    ome_zarr_versions: [0.4, 0.5]
    logo: "custom-logo.png" # Use @/assets/custom-logo.png
    label: "Open in My Viewer"
```

## Adding Custom Viewer Logos

Logo resolution follows this order:

1. **Custom logo specified**: If you provide a `logo` field in the config, it will be used
2. **Convention-based**: If no logo is specified, the system looks for `@/assets/{name}.png`
3. **Fallback**: If neither exists, uses `@/assets/fallback_logo.png`

### Examples:

**Using the naming convention (recommended):**

```yaml
viewers:
  - name: my-viewer
    # Logo will automatically resolve to @/assets/my-viewer.png
```

Just add `frontend/src/assets/my-viewer.png` - no config needed!

**Using a custom logo filename:**

```yaml
viewers:
  - name: my-viewer
    logo: "custom-logo.png" # Will use @/assets/custom-logo.png
```

## How Compatibility Works

### For Viewers with Manifests

The @bioimagetools/capability-manifest library checks:

- OME-Zarr version support
- Axis types and configurations
- Compression codecs
- Special features (labels, HCS plates, etc.)

### For Custom Viewers

Simple version matching:

- Dataset version is compared against `ome_zarr_versions` list
- Viewer is shown only if version matches

## Development

When developing with custom configurations:

1. Create/edit `frontend/src/config/viewers.config.yaml`
2. Rebuild frontend: `pixi run node-build` or use watch mode: `pixi run dev-watch`
3. Check console for initialization messages

**Note:** The config file is gitignored to allow per-deployment customization without committing changes.

## Copy URL Tool

The "Copy data URL" tool is always available when a data URL exists, regardless of viewer configuration.
