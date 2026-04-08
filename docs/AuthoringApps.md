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

### Nextflow Pipeline Support

If a directory does not contain a `runnables.yaml` but does contain a `nextflow_schema.json`, Fileglancer automatically generates a manifest from the Nextflow schema. The generated manifest:

- Sets `requirements` to `["nextflow"]`
- Uses `nextflow run . -ansi-log false` as the command
- Names the entry point "Run pipeline"
- Converts JSON Schema parameter definitions to Fileglancer parameters, preserving types, defaults, descriptions, required flags, enum options, and `hidden` status
- Groups parameters into sections based on the schema's `definitions` and `allOf` ordering
- Sections with required parameters start expanded; others start collapsed
- Reads `name` and `version` from `nextflow.config`'s `manifest` block if available, falling back to the schema's `title` and `description`
- Adds an **Environment tab** with Nextflow-specific options:
  - **Profiles** — comma-separated list of Nextflow profiles (e.g. `standard,docker`)
  - **Extra Arguments** — additional Nextflow CLI arguments (e.g. `-resume`, `-with-tower`), appended to the command without shell quoting

This means most nf-core and Nextflow pipelines that follow the standard schema convention work out of the box — just add the repo URL in Fileglancer. If you need to customize the UI (e.g. change the command, add resources, or reorganize parameters), create a `runnables.yaml` in the same directory and it will take priority.

### Pixi Project Support

If a directory does not contain a `runnables.yaml` but does contain a `pixi.toml` or a `pyproject.toml` with `[tool.pixi.tasks]`, Fileglancer automatically generates a manifest from the pixi configuration. Each pixi task becomes a separate runnable. The generated manifest:

- Sets `requirements` to `["pixi"]`
- Uses `pixi run <task_name>` as the command for each runnable
- Converts task arguments (`args`) to parameters, including `choices` (mapped to enum type) and `default` values
- Preserves task `description` fields
- Exposes task `env` variables as hidden parameters for visibility
- Skips hidden tasks (names starting with `_`) and dependency-only tasks (no `cmd`)
- Reads project `name`, `description`, and `version` from the project metadata
- Collects tasks from both top-level and feature-specific task sections

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

The `requirements` field lists tools that must be installed on the server. Requirements can be specified at two levels:

- **Manifest-level** (`requirements` on the top-level manifest): Apply to all runnables by default. Use this for tools needed by every entry point.
- **Entry-point-level** (`requirements` on a runnable): Additional requirements specific to that runnable. These are **merged** with manifest-level requirements when submitting a job. If the same tool appears at both levels, the entry-point version spec takes precedence.

```yaml
name: My App
requirements:
  - "pixi>=0.40"        # needed by all runnables
runnables:
  - id: run
    name: Run with Pixi
    command: pixi run demo
    # effective requirements: [pixi>=0.40]

  - id: container-run
    name: Run in Container
    command: cowsay
    container: godlovedc/lolcow
    requirements:
      - apptainer          # only needed by this runnable
    # effective requirements: [pixi>=0.40, apptainer]
```

Each entry is a tool name with an optional version constraint:

```yaml
requirements:
  - "pixi>=0.40"
  - npm
  - "maven>=3.9"
  - miniforge
```

**Supported tools:** `pixi`, `npm`, `maven`, `miniforge`, `apptainer`, `nextflow`

**Supported version operators:** `>=`, `<=`, `!=`, `==`, `>`, `<`

If a requirement is not met (tool missing or version too old), job submission fails with a descriptive error message. Only requirements relevant to the selected entry point are checked — unmet requirements for other entry points do not block submission. If `requirements` is omitted or empty at both levels, no checks are performed.

### Runnables

Each runnable defines a single command that users can launch. If the manifest has multiple runnables, the user selects which one to run.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier (used in CLI flags and URLs, should be URL-safe) |
| `name` | string | yes | Display name shown in the UI |
| `type` | string | no | `"job"` (default) for batch jobs or `"service"` for long-running services (see [Services](#services)) |
| `description` | string | no | Longer description of what this runnable does |
| `command` | string | yes | Base shell command to execute (see [Command Building](#command-building)) |
| `parameters` | list of objects | no | Parameter definitions (see [Parameters](#parameters)) |
| `env_parameters` | list of objects | no | Parameters shown in the Environment tab, emitted before `parameters` in the command (see [Environment Tab Parameters](#environment-tab-parameters)) |
| `resources` | object | no | Default cluster resource requests (see [Resources](#resources)) |
| `env` | object | no | Default environment variables to export (see [Environment Variables](#environment-variables)) |
| `pre_run` | string | no | Shell script to run before the main command (see [Pre/Post-Run Scripts](#prepost-run-scripts)) |
| `post_run` | string | no | Shell script to run after the main command (see [Pre/Post-Run Scripts](#prepost-run-scripts)) |
| `conda_env` | string | no | Conda environment name or absolute path to activate before running (see [Conda Environments](#conda-environments)) |
| `container` | string | no | Container image URL for Apptainer (see [Containers](#containers-apptainer)) |
| `bind_paths` | list of strings | no | Additional paths to bind-mount into the container (requires `container`) |
| `container_args` | string | no | Default extra arguments for container exec (e.g. `--nv`), overridable at launch time |
| `requirements` | list of strings | no | Additional tool requirements specific to this runnable, merged with manifest-level requirements |

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
| `hidden` | boolean | no | Whether the parameter is hidden by default in the UI. Default: `false` |
| `raw` | boolean | no | If `true`, the value is appended to the command without shell quoting. Validated against shell metacharacters for safety. Default: `false` |

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

### Hidden Parameters

Parameters can be marked as `hidden: true` to hide them from the UI by default. When any parameter in a runnable is hidden, a "Show hidden" toggle switch appears in the top right of the Parameters tab. Toggling it on reveals the hidden parameters.

This is useful for advanced or rarely-changed parameters that you want to keep available without cluttering the default form view.

```yaml
parameters:
  - flag: --input
    name: Input Path
    type: file
    required: true

  - flag: --debug-level
    name: Debug Level
    type: integer
    default: 0
    hidden: true

  - flag: --internal-buffer-size
    name: Internal Buffer Size
    type: integer
    default: 4096
    hidden: true
```

Hidden parameters still participate in command building — if they have a `default` value, it will be used even when the parameter is not visible in the UI. Hidden parameters inside a section are filtered individually; if all parameters in a section are hidden, the entire section is hidden until the toggle is turned on.

### Environment Tab Parameters

The `env_parameters` field works identically to `parameters` (supports the same parameter types, sections, flags, etc.) but places the parameters in the **Environment tab** instead of the Parameters tab. This is useful for tool-level options that are separate from the app's own parameters.

Environment tab parameters are emitted **before** regular parameters in the generated command. This matters for tools like Nextflow where tool-level flags (e.g. `-profile`) must appear before pipeline parameters (e.g. `--input`).

```yaml
runnables:
  - id: run
    name: Run Pipeline
    command: nextflow run . -ansi-log false
    env_parameters:
      - section: Nextflow
        parameters:
          - flag: -profile
            name: Profiles
            type: string
            description: Comma-separated list of Nextflow profiles
          - name: Extra Arguments
            type: string
            description: Additional Nextflow CLI arguments
            raw: true
    parameters:
      - flag: --input
        name: Input
        type: file
        required: true
```

The resulting command would be:

```bash
nextflow run . -ansi-log false \
  -profile 'standard,docker' \
  -resume -with-tower \
  --input '/data/input'
```

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
export FG_WORK_DIR='/home/user/.fileglancer/jobs/42-MyApp-convert'
cd "$FG_WORK_DIR/repo"

# Conda activation (if conda_env is set)
eval "$(conda shell.bash hook)"
conda activate myenv

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

`FG_WORK_DIR` is always exported and points to the job's working directory. See [Environment Variables Set by Fileglancer](#environment-variables-set-by-fileglancer) for the full list.

### Conda Environments

The `conda_env` field specifies a conda environment to activate before running the command. This requires `miniforge` (or any conda distribution providing the `conda` binary) in the runnable's `requirements` list (or the manifest-level `requirements`).

The value can be either:
- **An environment name** (e.g. `myenv`): must match `[a-zA-Z0-9_.-]+`
- **An absolute path** (e.g. `/opt/envs/myenv`): must not contain shell metacharacters

```yaml
name: My Analysis Tool
runnables:
  - id: analyze
    name: Run Analysis
    command: python analyze.py
    conda_env: my-analysis-env
    requirements:
      - miniforge
    parameters:
      - flag: --input
        name: Input
        type: file
        required: true
```

When `conda_env` is set, the generated script initializes conda and activates the environment before any env vars, pre_run, or the main command:

```bash
eval "$(conda shell.bash hook)"
conda activate my-analysis-env
```

> **Tip:** If the conda environment needs to be created before use (e.g. from an `environment.yml`), use `pre_run` to create it first:
>
> ```yaml
> conda_env: my-tool-env
> pre_run: |
>   conda env create -f environment.yml -n my-tool-env --yes 2>/dev/null || true
> ```

### Containers (Apptainer)

The `container` field specifies a container image to run the command inside using [Apptainer](https://apptainer.org/) (formerly Singularity). This requires `apptainer` in the runnable's `requirements` list (or the manifest-level `requirements`).

The value is a container image URL, typically from a Docker/OCI registry:

- `ghcr.io/org/image:tag` — GitHub Container Registry
- `docker://ghcr.io/org/image:tag` — explicit Docker protocol prefix (added automatically if absent)

```yaml
name: Lolcow
runnables:
  - id: say
    name: Cow Say
    command: cowsay
    container: godlovedc/lolcow
    requirements:
      - apptainer
    parameters:
      - name: Message
        type: string
        description: What the cow should say
        required: true
        default: "Hello from Fileglancer!"
```

When `container` is set, the generated script:

1. Creates a SIF cache directory (defaults to `~/.fileglancer/apptainer_cache/`, configurable in Preferences)
2. Pulls the image to a `.sif` file if not already cached
3. Runs the command inside the container via `apptainer exec`

```bash
# Apptainer container setup
APPTAINER_CACHE_DIR=$HOME/.fileglancer/apptainer_cache
mkdir -p "$APPTAINER_CACHE_DIR"
SIF_PATH="$APPTAINER_CACHE_DIR/godlovedc_lolcow.sif"
if [ ! -f "$SIF_PATH" ]; then
  apptainer pull "$SIF_PATH" 'docker://godlovedc/lolcow'
fi
apptainer exec --bind /home/user/.fileglancer/jobs/1-lolcow-say "$SIF_PATH" \
  cowsay \
  'Hello from Fileglancer!'
```

**Bind mounts** are auto-detected from file and directory parameters. The job's working directory is always bound. Use `bind_paths` to add extra paths:

```yaml
container: ghcr.io/org/image:tag
bind_paths:
  - /shared/reference-data
  - /scratch
```

**Extra Apptainer arguments** can be set as defaults in the manifest with `container_args`, and overridden by the user at launch time through the UI's Environment tab:

```yaml
container: ghcr.io/org/cuda-tool:latest
container_args: "--nv"
```

> **Important:** `conda_env` and `container` are mutually exclusive — you cannot use both on the same entry point.

## Command Building

When a job is submitted, Fileglancer constructs the full shell command from the runnable's `command` field and the user-provided parameter values using a two-pass approach:

1. Start with the base `command` string
2. Merge user-provided values with defaults for any parameters the user didn't set
3. **Pass 1 — Flagged arguments**: Emit values for parameters with a `flag`, in declaration order (`env_parameters` first, then `parameters`):
   - Boolean `true` → append the flag (e.g. `--verbose`)
   - Boolean `false` → omit entirely
   - All other types → append `{flag} {shell_quoted_value}`
4. **Pass 2 — Positional arguments**: Emit values for parameters without a `flag`, in declaration order. Values are shell-quoted unless `raw: true` is set, in which case the value is appended as-is (validated against shell metacharacters)
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

All string values are shell-quoted using `shlex.quote()` to prevent injection, unless `raw: true` is set (in which case shell metacharacters are validated and rejected instead).

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

## Services

A **service** is a long-running process (web server, notebook, API, viewer) that runs until the user explicitly stops it. Services are declared with `type: service` on the runnable:

```yaml
runnables:
  - id: notebook
    name: JupyterLab
    type: service
    command: jupyter lab --no-browser --ip=0.0.0.0 --port=0
    resources:
      cpus: 4
      memory: "32 GB"
      walltime: "08:00"
```

### How It Works

From the cluster's perspective, a service is just a long-running batch job. The difference is in how Fileglancer communicates the service URL to the user:

1. User launches a service-type runnable → job enters PENDING state
2. Cluster picks it up → RUNNING
3. The service starts, binds a port, and writes its URL to the file at `SERVICE_URL_PATH`
4. On the next poll (every few seconds), Fileglancer reads the file and displays the URL in the UI
5. User clicks "Open Service" → service opens in a new browser tab
6. When done, user clicks "Stop Service" → job is killed and the URL disappears

### Writing the Service URL

For service-type runnables, Fileglancer exports `SERVICE_URL_PATH` — the absolute path to a file where your service should write its URL. Your service must write its URL (e.g. `http://hostname:port`) to this file once it is ready to accept connections.

Example in Python:

```python
import os, socket

url = f"http://{socket.gethostname()}:{port}"
service_url_path = os.environ.get("SERVICE_URL_PATH")
if service_url_path:
    with open(service_url_path, "w") as f:
        f.write(url)
```

Example in Bash:

```bash
echo "http://$(hostname):${PORT}" > "$SERVICE_URL_PATH"
```

The URL must start with `http://` or `https://`. Fileglancer validates this before displaying it. If the file doesn't exist or contains an invalid URL, no link is shown.

### Service Lifecycle

- **Startup**: The service should write its URL to `SERVICE_URL_PATH` as soon as it is ready. Until the file exists, the UI shows "Service is starting up..."
- **Running**: Fileglancer reads the URL file on each poll. If the URL changes (e.g. port rebind), the UI updates automatically.
- **Shutdown**: When the user clicks "Stop Service", Fileglancer sends a SIGTERM to the job. Services should handle this signal for graceful shutdown. Cleaning up the URL file on exit is good practice but not required — Fileglancer only reads it while the job status is RUNNING.

### Tips

- **Port selection**: Use port 0 or auto-detection to avoid conflicts when multiple services run on the same node
- **Walltime**: Set a generous walltime — services run until stopped, but the cluster will kill them if walltime expires. Consider `"08:00"` or longer for interactive sessions
- **Flush output**: If running under a batch scheduler like LSF, Python's stdout may be buffered. Use `flush=True` on print statements or set `PYTHONUNBUFFERED=1` so logs appear in real time

### Service Example

```yaml
name: My Viewer
description: Interactive data viewer
version: "1.0"

runnables:
  - id: view
    name: Start Viewer
    type: service
    description: Launch an interactive viewer for browsing datasets
    command: pixi run python start_viewer.py
    parameters:
      - flag: --data-dir
        name: Data Directory
        type: directory
        description: Directory containing datasets to view
        required: true

    resources:
      cpus: 2
      memory: "8 GB"
      walltime: "08:00"
```

## Environment Variables Set by Fileglancer

Fileglancer exports the following environment variables in every job script:

| Variable | Availability | Description |
|----------|-------------|-------------|
| `FG_WORK_DIR` | All jobs | Absolute path to the job's working directory (contains `repo/` symlink, log files, etc.) |
| `SERVICE_URL_PATH` | Service-type jobs only | Absolute path where the service should write its URL. Equivalent to `$FG_WORK_DIR/service_url` |

These are available to `pre_run` scripts, the main command, and `post_run` scripts.

## Server Configuration for Apps

Some aspects of app execution are controlled by the Fileglancer server's `config.yaml`, not by individual app manifests. These settings are managed by the system administrator.

### Extra Paths (`extra_paths`)

The `extra_paths` apps setting lets administrators add directories to `$PATH` for all job scripts. This is useful for making tools like `nextflow`, `pixi`, or `apptainer` available without requiring users to configure their own environments.

```yaml
apps:
  extra_paths:
    - /opt/nextflow/bin
    - /opt/pixi/bin
    - /usr/local/apptainer/bin
```

These paths are:

1. **Appended to `$PATH` in every generated job script** — the user's own `$PATH` entries take precedence
2. **Used when verifying tool requirements** — so `requirements: [nextflow]` can find `/opt/nextflow/bin/nextflow` even if it's not on the server process's default `$PATH`

### Container Cache Directory

By default, Apptainer container images (SIF files) are cached at `~/.fileglancer/apptainer_cache/`. Users can override this per-user in the Preferences page under "Container cache directory".

See the [config.yaml.template](config.yaml.template) for all available cluster settings.

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
