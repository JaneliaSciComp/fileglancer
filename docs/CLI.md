# Fileglancer CLI

The `fileglancer` command-line tool starts a local Fileglancer server for browsing and managing files on your machine.

## Installation

Install Fileglancer as a standalone command-line tool. This creates an isolated environment for it and puts the `fileglancer` command on your PATH, the same way JupyterLab is installed.

With [uv](https://docs.astral.sh/uv/getting-started/installation/) (0.3 or newer):

```bash
uv tool install fileglancer
```

Or with [pipx](https://pipx.pypa.io/):

```bash
pipx install fileglancer
```

If you already manage Python environments yourself, you can instead `pip install fileglancer` into a virtual environment, or `pixi add fileglancer` to a Pixi project, and run `fileglancer` from inside that environment.

### Upgrading

```bash
uv tool upgrade fileglancer   # or: pipx upgrade fileglancer
```

### Why not `uvx fileglancer`?

`uvx` runs a tool from a disposable cached environment. If that environment was interrupted while being built, or is shared between machines or uv versions, later runs fail with `Package fileglancer does not provide any executables`. Running `uv cache clean fileglancer` clears the bad cache, but a persistent `uv tool install` avoids the problem entirely.

## Start Fileglancer

Once installed, run:

```bash
fileglancer start
```

This starts the server on `http://127.0.0.1:8000`, opens your browser, and serves your home directory by default.

## Configuration

The first `fileglancer start` writes a commented default config to `~/.config/fileglancer/config.yaml` (or `$XDG_CONFIG_HOME/fileglancer/config.yaml` when that variable is set). Every start logs the path of the config it read. Edit that file and restart the server to apply changes.

To read a different file, pass `--config PATH` or set the `FGC_CONFIG_FILE` environment variable.

Settings are loaded from multiple sources, in priority order (highest first):

1. **CLI flags** (e.g., `--port 9000`)
2. **Environment variables** — prefixed with `FGC_` (case-insensitive)
3. **`.env` file** — next to the config file
4. **The config file**

Every setting is optional. The personal server runs as the user who started it, and the login page asks for a password: set `simple_auth_password` in the config to pin one, or read the password the server prints at each start. The browser that `fileglancer start` opens is logged in automatically.

### Using a config file

```yaml
# Password for the login page
simple_auth_password: change-me

# Directories to expose in the file browser
file_share_mounts:
  - "~/"
  - /data/shared

# Logging level (ERROR, WARNING, INFO, DEBUG, TRACE)
log_level: INFO
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

You can also place environment variables in a `.env` file next to the config file:

```
FGC_LOG_LEVEL=DEBUG
FGC_SIMPLE_AUTH_PASSWORD=change-me
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
| `--config` | `~/.config/fileglancer/config.yaml` | Config file to read |
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

This can be overridden with the `db_url` setting in the config file or the `FGC_DB_URL` environment variable. The same directory holds the key that signs session cookies, so a browser stays logged in across server restarts.
