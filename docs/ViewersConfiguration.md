# Viewers Configuration Guide

Fileglancer supports dynamic configuration of OME-Zarr viewers. This allows administrators to customize which viewers are available in their deployment, override viewer URLs, and control how compatibility is determined.

## Overview

The viewer system is built on capability manifests:

- **`viewers.config.yaml`**: Configuration file listing viewers and their manifest URLs
- **Capability manifest files**: YAML files describing each viewer's name, URL template, and capabilities
- **`@bioimagetools/capability-manifest`**: Library that loads manifests and checks dataset compatibility
- **`ViewersContext`**: React context that provides viewer information to the application

Each viewer is defined by a **capability manifest** hosted at a URL. The configuration file simply lists manifest URLs and optional overrides. At runtime, the manifests are fetched, and the `@bioimagetools/capability-manifest` library determines which viewers are compatible with a given dataset based on the manifest's declared capabilities.

## Quick Start

1. Edit the configuration file at `frontend/src/config/viewers.config.yaml`
2. Rebuild the application: `pixi run node-build`

## Configuration File

### Location

`frontend/src/config/viewers.config.yaml`

**Important:** This file is bundled at build time. Changes require rebuilding the application.

### Structure

The configuration file has a single top-level key, `viewers`, containing a list of viewer entries. Each entry requires a `manifest_url` and supports optional overrides.

#### Viewer Entry Fields

| Field                   | Required | Description                                                                      |
| ----------------------- | -------- | -------------------------------------------------------------------------------- |
| `manifest_url`          | Yes      | URL to a capability manifest YAML file                                           |
| `instance_template_url` | No       | Override the viewer's `template_url` from the manifest                           |
| `label`                 | No       | Custom tooltip text (defaults to "View in {Name}")                               |
| `logo`                  | No       | Filename of logo in `frontend/src/assets/` (defaults to `{normalized_name}.png`) |

### Default Configuration

The default `viewers.config.yaml` configures four viewers:

```yaml
viewers:
  - manifest_url: "https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/neuroglancer.yaml"

  - manifest_url: "https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/vizarr.yaml"
    instance_template_url: "https://janeliascicomp.github.io/viv/"

  - manifest_url: "https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/validator.yaml"
    label: "View in OME-Zarr Validator"

  - manifest_url: "https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/vole.yaml"
    label: "View in Vol-E"
```

## Capability Manifest Files

Manifest files describe a viewer's identity and capabilities. The default manifests are stored in `frontend/public/viewers/` and are hosted via GitHub. You can host your own manifest files anywhere accessible via URL.

### Manifest Structure

A manifest has two sections: `viewer` (identity) and `capabilities` (what the viewer supports).

#### Example: `neuroglancer.yaml`

```yaml
viewer:
  name: "Neuroglancer"
  version: "2.41.2"
  repo: "https://github.com/google/neuroglancer"
  template_url: https://neuroglancer-demo.appspot.com/#!{"layers":[{"name":"image","source":"{DATA_URL}","type":"image"}]}

capabilities:
  ome_zarr_versions: [0.4, 0.5]
  compression_codecs: ["blosc", "zstd", "zlib", "lz4", "gzip"]
  rfcs_supported: []
  axes: true
  scale: true
  translation: true
  channels: true
  timepoints: true
  labels: false
  hcs_plates: false
  bioformats2raw_layout: false
  omero_metadata: false
```

### Viewer Section

| Field          | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `name`         | Display name for the viewer                                    |
| `version`      | Viewer version                                                 |
| `repo`         | Repository URL                                                 |
| `template_url` | URL template with `{DATA_URL}` placeholder for the dataset URL |

### Capabilities Section

| Field                   | Type     | Description                                                  |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `ome_zarr_versions`     | number[] | Supported OME-Zarr specification versions                    |
| `compression_codecs`    | string[] | Supported compression codecs (e.g., "blosc", "zstd", "gzip") |
| `rfcs_supported`        | string[] | Additional RFCs supported                                    |
| `axes`                  | boolean  | Whether axis names and units are respected                   |
| `scale`                 | boolean  | Whether scaling factors on multiscales are respected         |
| `translation`           | boolean  | Whether translation factors on multiscales are respected     |
| `channels`              | boolean  | Whether multiple channels are supported                      |
| `timepoints`            | boolean  | Whether multiple timepoints are supported                    |
| `labels`                | boolean  | Whether labels are loaded when available                     |
| `hcs_plates`            | boolean  | Whether HCS plates are loaded when available                 |
| `bioformats2raw_layout` | boolean  | Whether bioformats2raw layout is handled                     |
| `omero_metadata`        | boolean  | Whether OMERO metadata is used (e.g., channel colors)        |

## URL Templates and `{DATA_URL}` Placeholder

The `{DATA_URL}` placeholder in a manifest's `template_url` (or a config entry's `instance_template_url`) is replaced at runtime with the actual dataset URL. Internally, `{DATA_URL}` is normalized to `{dataLink}` for consistency with the rest of the application.

For example, given this manifest `template_url`:

```
https://neuroglancer-demo.appspot.com/#!{"layers":[{"name":"image","source":"{DATA_URL}","type":"image"}]}
```

When a user clicks the viewer link for a dataset at `https://example.com/data.zarr`, the final URL becomes:

```
https://neuroglancer-demo.appspot.com/#!{"layers":[{"name":"image","source":"https://example.com/data.zarr","type":"image"}]}
```

## Configuration Examples

### Minimal: single viewer

```yaml
viewers:
  - manifest_url: "https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/neuroglancer.yaml"
```

### Override a viewer's URL

Use `instance_template_url` to point to a custom deployment of a viewer while still using its manifest for capability matching:

```yaml
viewers:
  - manifest_url: "https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/vizarr.yaml"
    instance_template_url: "https://my-avivator-instance.example.com/?image_url={dataLink}"
    logo: avivator.png
```

### Add a custom viewer

To add a new viewer, create a capability manifest YAML file, host it at a URL, and reference it in the config:

1. Create a manifest file (e.g., `my-viewer.yaml`):

```yaml
viewer:
  name: "My Viewer"
  version: "1.0.0"
  repo: "https://github.com/example/my-viewer"
  template_url: "https://viewer.example.com/?data={DATA_URL}"

capabilities:
  ome_zarr_versions: [0.4, 0.5]
  compression_codecs: ["blosc", "gzip"]
  rfcs_supported: []
  axes: true
  scale: true
  translation: true
  channels: true
  timepoints: false
  labels: false
  hcs_plates: false
  bioformats2raw_layout: false
  omero_metadata: false
```

2. Host the manifest at an accessible URL (e.g., in your own `frontend/public/viewers/` directory, on GitHub, or any web server).

3. Reference it in `viewers.config.yaml`:

```yaml
viewers:
  - manifest_url: "https://example.com/manifests/my-viewer.yaml"
    label: "Open in My Viewer"
```

4. Optionally, add a logo file at `frontend/src/assets/myviewer.png` (the normalized name, lowercase with non-alphanumeric characters removed).

## How Compatibility Works

The `@bioimagetools/capability-manifest` library handles all compatibility checking. When a user views an OME-Zarr dataset:

1. The application reads the dataset's metadata (OME-Zarr version, axes, codecs, etc.)
2. For each registered viewer, the library's `isCompatible()` function compares the dataset metadata against the manifest's declared capabilities
3. Only viewers whose capabilities match the dataset are shown to the user

This replaces the previous system where `valid_ome_zarr_versions` was a global config setting and custom viewers used simple version matching. Now all compatibility logic is driven by the detailed capabilities declared in each viewer's manifest.

## Adding Custom Viewer Logos

Logo resolution follows this order:

1. **Custom logo specified**: If you provide a `logo` field in the config entry, that filename is looked up in `frontend/src/assets/`
2. **Convention-based**: If no `logo` is specified, the system looks for `frontend/src/assets/{normalized_name}.png`, where the normalized name is the viewer's name lowercased with non-alphanumeric characters removed
3. **Fallback**: If neither is found, `frontend/src/assets/fallback_logo.png` is used

### Examples

**Using the naming convention (recommended):**

```yaml
viewers:
  - manifest_url: "https://example.com/manifests/neuroglancer.yaml"
    # Logo automatically resolves to @/assets/neuroglancer.png
```

Just add `frontend/src/assets/neuroglancer.png` -- no config needed.

**Using a custom logo filename:**

```yaml
viewers:
  - manifest_url: "https://example.com/manifests/vizarr.yaml"
    logo: "avivator.png" # Uses @/assets/avivator.png
```

## Development

When developing with custom configurations:

1. Edit `frontend/src/config/viewers.config.yaml`
2. Rebuild frontend: `pixi run node-build` or use watch mode: `pixi run dev-watch`
3. Check the browser console for viewer initialization messages

### Validation

The configuration is validated at build time using Zod schemas (see `frontend/src/config/viewersConfig.ts`). Validation enforces:

- The `viewers` array must contain at least one entry
- Each entry must have a valid `manifest_url` (a properly formed URL)
- Optional fields (`instance_template_url`, `label`, `logo`) must be strings if present

At runtime, manifests that fail to load are skipped with a warning. If a viewer has no `template_url` (neither from its manifest nor from `instance_template_url` in the config), it is also skipped.

## Copy URL Tool

The "Copy data URL" tool is always available when a data URL exists, regardless of viewer configuration.
