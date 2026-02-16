# Authoring Apps for Fileglancer

Fileglancer can discover and run apps from GitHub repositories. An app is defined by a `runnables.yaml` manifest file that describes one or more commands (called **runnables**) that users can launch as cluster jobs through the Fileglancer UI.

## Quick Start

1. Create a `runnables.yaml` file in your GitHub repository
2. Define your runnables with their commands and parameters
3. Add the repo URL in Fileglancer's Apps page

Minimal example:

```yaml
name: My Tool
runnables:
  - id: run
    name: Run My Tool
    command: python main.py
    parameters: []
```

## Manifest Discovery

When a user adds a GitHub repository, Fileglancer clones it and walks the directory tree looking for `runnables.yaml` files.

### Multi-App Repositories

A single repository can contain multiple apps by placing manifest files in subdirectories:

```
my-repo/
├── tool1/
│   ├── runnables.yaml    # App: "Image Converter"
│   └── convert.py
├── tool2/
│   ├── runnables.yaml    # App: "Data Analyzer"
│   └── analyze.py
└── README.md
```

Each manifest is discovered and registered as a separate app. When a job runs, the working directory is set to the subdirectory containing the manifest, so relative paths in commands resolve correctly.

The following directories are skipped during discovery: `.git`, `node_modules`, `__pycache__`, `.pixi`, `.venv`, `venv`.

## Manifest Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Display name shown in the Fileglancer UI |
| `description` | string | no | Short description of the app |
| `version` | string | no | Version string (for display only) |
| `repo_url` | string | no | GitHub URL of a separate repository containing the tool code (see [Separate Tool Repo](#separate-tool-repo)) |
| `requirements` | list of strings | no | Tools that must be available on the server (see [Requirements](#requirements)) |
| `runnables` | list of objects | yes | One or more runnable definitions (see [Runnables](#runnables)) |

### Requirements

The `requirements` field lists tools that must be installed on the server before the job can run. Each entry is a tool name with an optional version constraint.

```yaml
requirements:
  - "pixi>=0.40"
  - npm
  - "maven>=3.9"
```

**Supported tools:** `pixi`, `npm`, `maven`

**Supported version operators:** `>=`, `<=`, `!=`, `==`, `>`, `<`

If a requirement is not met (tool missing or version too old), job submission fails with a descriptive error message. If `requirements` is omitted or empty, no checks are performed.

### Runnables

Each runnable defines a single command that users can launch. If the manifest has multiple runnables, the user selects which one to run.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier (used in CLI flags and URLs, should be URL-safe) |
| `name` | string | yes | Display name shown in the UI |
| `description` | string | no | Longer description of what this runnable does |
| `command` | string | yes | Base shell command to execute (see [Command Building](#command-building)) |
| `parameters` | list of objects | no | Parameter definitions (see [Parameters](#parameters)) |
| `resources` | object | no | Default cluster resource requests (see [Resources](#resources)) |
| `env` | object | no | Default environment variables to export (see [Environment Variables](#environment-variables)) |
| `pre_run` | string | no | Shell script to run before the main command (see [Pre/Post-Run Scripts](#prepost-run-scripts)) |
| `post_run` | string | no | Shell script to run after the main command (see [Pre/Post-Run Scripts](#prepost-run-scripts)) |

### Parameters

Parameters define the inputs that users fill in through the Fileglancer UI. Each parameter with a `flag` field becomes a CLI flag appended to the base command. Parameters without a `flag` are emitted as positional arguments.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `flag` | string | no | CLI flag syntax (e.g. `--outdir`, `-n`). Omit for positional arguments. Must start with `-` |
| `name` | string | yes | Display label in the UI |
| `type` | string | yes | Data type (see [Parameter Types](#parameter-types)) |
| `description` | string | no | Help text shown below the input field |
| `required` | boolean | no | Whether the user must provide a value. Default: `false` |
| `default` | any | no | Pre-filled default value. Type must match the parameter type |
| `options` | list of strings | no | Allowed values (only for `enum` type) |
| `min` | number | no | Minimum value (only for `integer` and `number` types) |
| `max` | number | no | Maximum value (only for `integer` and `number` types) |
| `pattern` | string | no | Regex validation pattern (only for `string` type, uses full match) |

### Parameter Sections

Parameters can be grouped into collapsible sections in the UI. A section is an item in the `parameters` list that has a `section` key instead of `name`/`type`. Sections contain their own nested `parameters` list (one level deep only). Top-level parameters and sections can be interleaved freely.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `section` | string | yes | Section title displayed in the UI |
| `description` | string | no | Help text shown next to the section title |
| `collapsed` | boolean | no | Whether the section starts collapsed. Default: `false` |
| `parameters` | list of objects | no | Parameter definitions within this section (same schema as top-level parameters) |

```yaml
parameters:
  # Top-level parameter (always visible)
  - flag: --input
    name: Input Path
    type: file
    required: true

  # Collapsible section
  - section: Advanced Options
    description: Optional tuning parameters
    collapsed: true
    parameters:
      - flag: --chunk_size
        name: Chunk Size
        type: string
        default: "128,128,128"
      - flag: --verbose
        name: Verbose
        type: boolean
        default: false
```

When a section has `collapsed: true`, it renders as a closed accordion in the UI. Users can click to expand it and see the parameters inside. Sections without `collapsed` (or with `collapsed: false`) start expanded.

On form validation, any section containing a parameter with an error is automatically expanded so the user can see and fix the problem.

### Flag Forms

Parameters support three flag styles:

- **Double-dash flags** (most common): `flag: --outdir` emits `--outdir '/path'`
- **Single-dash flags**: `flag: -n` emits `-n 5`
- **Positional arguments**: Omit `flag` entirely. The value is emitted as a bare argument (no flag prefix)

An internal `key` is auto-generated from the flag: `--outdir` becomes key `outdir`, `-n` becomes key `n`. Positional parameters get keys `_arg0`, `_arg1`, etc. Keys must be unique within a runnable.

### Parameter Types

| Type | UI Control | CLI Output (flagged) | CLI Output (positional) | Validation |
|------|-----------|---------------------|------------------------|------------|
| `string` | Text input | `--flag 'value'` | `'value'` | Optional `pattern` regex (full match) |
| `integer` | Number input (step=1) | `--flag 42` | `42` | Must be a whole number. Optional `min`/`max` bounds |
| `number` | Number input | `--flag 3.14` | `3.14` | Must be numeric. Optional `min`/`max` bounds |
| `boolean` | Checkbox | `--flag` (if true, omitted if false) | N/A | Must be true/false |
| `file` | Text input + file browser | `--flag '/path/to/file'` | `'/path/to/file'` | Must be an absolute path. Path must exist and be readable on the server |
| `directory` | Text input + directory browser | `--flag '/path/to/dir'` | `'/path/to/dir'` | Must be an absolute path. Path must exist and be readable on the server |
| `enum` | Dropdown select | `--flag 'chosen_value'` | `'chosen_value'` | Value must be one of the `options` list |

**Notes on `file` and `directory` types:**
- The Fileglancer UI provides a file browser button alongside the text input
- Paths are validated server-side before job submission (must exist and be accessible)
- Both absolute paths (`/data/images`) and home-relative paths (`~/output`) are accepted
- Shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `(`, `)`, etc.) are rejected for safety

### Resources

Default resource requests for the cluster scheduler. Users can override these in the UI before submitting.

| Field | Type | Description |
|-------|------|-------------|
| `cpus` | integer | Number of CPUs to request |
| `memory` | string | Memory allocation, e.g. `"16 GB"` |
| `walltime` | string | Wall clock time limit, e.g. `"04:00"` (hours:minutes) |

If omitted, the server's global defaults are used. User overrides take highest priority, followed by the runnable's defaults, then the server defaults.

### Environment Variables

The `env` field defines default environment variables that are exported before the main command runs. Each entry is a key-value pair where the key is the variable name and the value is the default string value.

```yaml
runnables:
  - id: convert
    name: Convert to OME-Zarr
    command: nextflow run main.nf
    env:
      JAVA_HOME: /opt/java
      NXF_SINGULARITY_CACHEDIR: /scratch/singularity
```

Users can override or extend these in the Fileglancer UI before submitting a job. Variable names must match `[A-Za-z_][A-Za-z0-9_]*` and values are shell-quoted with `shlex.quote()` for safety.

### Pre/Post-Run Scripts

The `pre_run` and `post_run` fields allow you to specify shell commands that run before and after the main command, respectively. These are useful for loading modules, setting up the environment, or performing cleanup.

```yaml
runnables:
  - id: convert
    name: Convert to OME-Zarr
    command: nextflow run main.nf
    pre_run: |
      module load java/21
    post_run: |
      echo "Conversion complete"
```

Users can override these in the UI. If a user provides their own pre/post-run script, it replaces the manifest default entirely.

The generated job script has the following structure:

```bash
unset PIXI_PROJECT_MANIFEST
cd /path/to/repo

# Environment variables
export JAVA_HOME='/opt/java'
export NXF_SINGULARITY_CACHEDIR='/scratch/singularity'

# Pre-run script
module load java/21

# Main command
nextflow run main.nf \
  --input '/data/input' \
  --outdir '/data/output'

# Post-run script
echo "Conversion complete"
```

## Command Building

When a job is submitted, Fileglancer constructs the full shell command from the runnable's `command` field and the user-provided parameter values using a two-pass approach:

1. Start with the base `command` string
2. Merge user-provided values with defaults for any parameters the user didn't set
3. **Pass 1 — Positional arguments**: Emit values for parameters without a `flag`, in declaration order, as bare shell-quoted values
4. **Pass 2 — Flagged arguments**: Emit values for parameters with a `flag`, in declaration order:
   - Boolean `true` → append the flag (e.g. `--verbose`)
   - Boolean `false` → omit entirely
   - All other types → append `{flag} {shell_quoted_value}`
5. Join all parts with line-continuation (`\`) for readability

For example, given this runnable:

```yaml
command: pixi run python demo.py
parameters:
  - flag: --message
    name: Message
    type: string
    required: true
  - flag: --repeat
    name: Repeat Count
    type: integer
    default: 3
  - flag: --verbose
    name: Verbose
    type: boolean
    default: false
```

If the user provides `message: "Hello"`, `verbose: true`, and leaves `repeat` at its default, the resulting command is:

```bash
pixi run python demo.py \
  --message 'Hello' \
  --verbose \
  --repeat '3'
```

All string values are shell-quoted using `shlex.quote()` to prevent injection.

## Separate Tool Repo

By default, the job runs inside the cloned repository that contains the manifest. If your tool code lives in a different repository, use the `repo_url` field:

```yaml
name: My Pipeline
repo_url: https://github.com/org/pipeline-code
runnables:
  - id: run
    name: Run Pipeline
    command: nextflow run main.nf
    parameters: []
```

When `repo_url` is set:
- The discovery repo (containing `runnables.yaml`) is used only for manifest metadata
- The tool repo (`repo_url`) is cloned separately and used as the working directory for the job
- The user can opt to "pull latest" before each run to get the newest code from both repos

## Job Execution

When a user submits a job:

1. The manifest is re-fetched from the cached clone
2. Requirements are verified on the server
3. The command is built with validated parameters
4. A working directory is created at `~/.fileglancer/jobs/{id}-{app}-{runnable}/`
5. The repository is symlinked into the working directory
6. The command runs on the cluster with `stdout.log` and `stderr.log` captured
7. Job status is monitored and updated in real time (PENDING → RUNNING → DONE/FAILED/KILLED)

Users can view logs, relaunch with the same parameters, or cancel running jobs from the Fileglancer UI.

## Full Example

```yaml
name: OME-Zarr Converter
description: Convert Bio-Formats-compatible images to OME-Zarr using bioformats2raw
version: "1.0"

runnables:
  - id: convert
    name: Convert to OME-Zarr
    description: Convert image files or directories to OME-Zarr format
    command: nextflow run JaneliaSciComp/nf-omezarr -profile singularity
    parameters:
      - flag: --input
        name: Input Path
        type: file
        description: Path to input image file or directory containing image files
        required: true

      - flag: --outdir
        name: Output Directory
        type: directory
        description: Directory where converted OME-Zarr outputs will be saved
        required: true

      - flag: --chunk_size
        name: Chunk Size
        type: string
        description: Zarr chunk size in X,Y,Z order
        default: "128,128,128"

      - flag: --compression
        name: Compression
        type: enum
        description: Block compression algorithm
        options:
          - blosc
          - zlib
        default: blosc

      - flag: --overwrite
        name: Overwrite Existing
        type: boolean
        description: Overwrite images in the output directory if they exist
        default: false

      - flag: --cpus
        name: CPUs per Task
        type: integer
        description: Number of cores to allocate for each bioformats2raw task
        default: 10
        min: 1
        max: 500

    resources:
      cpus: 4
      memory: "16 GB"
      walltime: "24:00"
```
