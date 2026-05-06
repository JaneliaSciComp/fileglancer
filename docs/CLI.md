# Fileglancer CLI

The `fileglancer` command-line tool starts a local Fileglancer server for browsing and managing files on your machine.

## Installation

The best practice is to install Fileglancer into a dedicated environment using your preferred Python package manager, e.g., [Pixi](https://pixi.prefix.dev/dev/installation/) or [uv](https://docs.astral.sh/uv/getting-started/installation/):

```bash
# pixi
pixi add fileglancer

# uv
uv venv fileglancer-env
source fileglancer-env/bin/activate
uv pip install fileglancer
```

If you have uv installed and want a quick one-liner to try Fileglancer in a temporary environment:

```bash
uvx fileglancer start
```

## Start Fileglancer

From inside the environment you just created, run:

```bash
fileglancer start
```

This starts the server on `http://127.0.0.1:8000`, opens your browser, and serves your home directory by default.

## Configuration

Fileglancer looks for configuration in the current working directory. Settings are loaded from multiple sources, in priority order (highest first):

1. **CLI flags** (e.g., `--port 9000`)
2. **Environment variables** — prefixed with `FGC_` (case-insensitive)
3. **`.env` file** — in the current directory
4. **`config.yaml`** — in the current directory

If no configuration is found, sensible defaults are used.

### Using a config file

Create a `config.yaml` in the directory you plan to run `fileglancer start` from:

```yaml
# Directories to expose in the file browser
file_share_mounts:
  - "~/"
  - /data/shared

# Logging level (ERROR, WARNING, INFO, DEBUG, TRACE)
log_level: INFO

# Database URL (defaults to ~/.local/share/fileglancer/fileglancer.db)
db_url: sqlite:///fileglancer.db

# External proxy URL for shared file links
external_proxy_url: http://localhost:8000/files
```

A full template with all available options is available at [`docs/config.yaml.template`](config.yaml.template) in the source repository.

### Using environment variables

Any setting can also be set via an environment variable with the `FGC_` prefix:

```bash
export FGC_LOG_LEVEL=DEBUG
export FGC_FILE_SHARE_MOUNTS='["~/data", "/shared/images"]'
export FGC_DB_URL='sqlite:///my-fileglancer.db'
```

For nested settings (like cluster configuration), use `__` as a delimiter:

```bash
export FGC_CLUSTER__EXECUTOR=lsf
export FGC_CLUSTER__QUEUE=normal
```

### Using a .env file

You can also place environment variables in a `.env` file in the current directory:

```
FGC_LOG_LEVEL=DEBUG
FGC_DB_URL=sqlite:///fileglancer.db
```

## Command Reference

### `fileglancer start`

Start the Fileglancer server. Run `fileglancer start --help` to see all available options.

```bash
fileglancer start [OPTIONS]
```

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Host address to bind to |
| `--port` | `8000` | Port to bind to |
| `-f` / `--file-share-mounts` | — | File share path to mount (repeatable) |
| `--no-browser` | off | Don't open a browser automatically |
| `--auto-port` | `true` | Find an available port if the specified one is in use |
| `--reload` | off | Enable auto-reload on code changes |
| `--workers` | — | Number of worker processes |
| `--ssl-keyfile` | — | Path to SSL private key file |
| `--ssl-certfile` | — | Path to SSL certificate file |
| `--ssl-ca-certs` | — | Path to CA certificates file |
| `--ssl-ciphers` | `TLSv3` | SSL ciphers to use |
| `--timeout-keep-alive` | `5` | Keep-alive timeout in seconds |

#### Examples

Start with defaults (serves home directory on port 8000):

```bash
fileglancer start
```

Serve specific directories:

```bash
fileglancer start -f ~/projects -f /data/shared
```

Start on a specific port without opening a browser:

```bash
fileglancer start --port 9000 --no-browser
```

Start with HTTPS:

```bash
fileglancer start --ssl-keyfile /path/to/key.pem --ssl-certfile /path/to/cert.pem
```

## Data Storage

By default, Fileglancer stores its database at:

```
~/.local/share/fileglancer/fileglancer.db
```

This can be overridden with the `db_url` setting in `config.yaml` or the `FGC_DB_URL` environment variable.
