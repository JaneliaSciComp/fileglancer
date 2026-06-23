# Dev Container Usage

The devcontainer provides a complete development environment for Fileglancer with Python, Node.js, and pixi, configured to run Claude Code and Codex as an unprivileged user under network isolation.

The same `devcontainer.json` works with two container runtimes: **Docker/Colima** (the default, used on macOS) and **rootless Podman** (used on Linux for a stronger, daemon-less security posture). The runtime is selected per machine via the `FG_CONTAINER_RUNTIME` environment variable.

## How runtime selection works

The `container-*` pixi tasks call `.devcontainer/dc.sh`, a thin wrapper around the devcontainers CLI. It passes `--docker-path "$FG_CONTAINER_RUNTIME"` (default: `docker`), so:

- On macOS, leave `FG_CONTAINER_RUNTIME` unset — the tasks use Docker (typically backed by Colima).
- On Linux, set `FG_CONTAINER_RUNTIME=podman` — the tasks use rootless Podman, and `dc.sh` additionally routes Podman through a small shim and disables the CLI's uid-renumber step (see [Architecture](#architecture)).

Nothing in `devcontainer.json` is runtime-specific, so the same project config works on both.

## Prerequisites

- A container runtime (see platform-specific setup below)
- Pixi (provides Node.js for the devcontainer CLI)
- Claude Code configuration at `~/.claude` (auth) and `~/.claude.json`
- Codex configuration at `~/.codex` (config and auth)

## Platform setup

### macOS (Colima)

[Colima](https://github.com/abiosoft/colima) provides a lightweight alternative to Docker Desktop on macOS, which has licensing complications.

```bash
# Install Colima and Docker CLI
brew install colima docker

# Start Colima with recommended settings for devcontainers
colima start --cpu 4 --memory 8 --disk 60

# Verify Docker is working
docker ps
```

No `FG_CONTAINER_RUNTIME` is needed on macOS — the default (`docker`) targets Colima.

#### Manual vs Auto-Start

| Aspect | `colima start` | `brew services start colima` |
|--------|----------------|------------------------------|
| **Resource usage** | Only runs when you need it | Always running after login |
| **Control** | Easy to customize flags per session | Uses default or config file settings |
| **Battery/memory** | Saves resources when not developing | Constant background overhead |
| **Startup** | Manual, ~10-20 seconds | Automatic on login |

**Recommendation:** Use `colima start` directly unless you use containers daily. Start when needed, stop when done (`colima stop`). If you prefer auto-start, use `brew services start colima`.

To save your preferred settings so you don't need flags each time, create `~/.colima/default/colima.yaml`:

```yaml
cpu: 4
memory: 8
disk: 60
```

### Linux (rootless Podman) — recommended

Rootless Podman runs the container without a root-owned daemon, so a container/agent compromise can at most act as your own user rather than host root. This is the recommended Linux setup.

#### 1. Install Podman and rootless dependencies (sudo)

```bash
sudo dnf install -y podman fuse-overlayfs slirp4netns containernetworking-plugins
# Debian/Ubuntu: sudo apt-get install -y podman fuse-overlayfs slirp4netns containernetworking-plugins
```

#### 2. Grant a subordinate UID/GID range (sudo)

Rootless Podman needs subuid/subgid ranges to map the container's `vscode` user. Check first:

```bash
grep "^$(whoami):" /etc/subuid /etc/subgid
```

If there are no entries, add a small range. For a local account use `usermod`; for an LDAP/NIS account (not in local `/etc/passwd`) append directly:

```bash
echo "$(whoami):100000:65536" | sudo tee -a /etc/subuid
echo "$(whoami):100000:65536" | sudo tee -a /etc/subgid
podman system migrate   # pick up the new ranges
```

Keep this range small (65536). Do not enlarge it to cover your host UID — on a shared host with high LDAP UIDs that would overlap real users' UIDs. The setup deliberately avoids needing that (see [Architecture](#architecture)).

#### 3. Per-user shell settings

Add these to your `~/.bashrc` (Linux host only — leave both unset on macOS):

```bash
# Select rootless Podman for the container-* pixi tasks
export FG_CONTAINER_RUNTIME=podman

# Keep the HOST pixi's cache off NFS. Required only if your home directory is on
# a network filesystem (NFS/SMB/etc.); pixi otherwise redirects its cache per-run
# and prints a warning. Point it at fast local storage instead.
export PIXI_CACHE_DIR=/scratch/$USER/pixi-cache
```

`FG_CONTAINER_RUNTIME=podman` makes `pixi run container-*` use Podman. `PIXI_CACHE_DIR` fixes the **host** pixi (the one that runs the `container-*` tasks); the **container** pixi is handled separately in `devcontainer.json` (see [pixi cache](#pixi-cache)).

#### 4. Podman storage on network-home machines (optional)

If your home directory is on a network filesystem, point Podman's storage at fast local storage so image/layer operations are not slow. Create `~/.config/containers/storage.conf`:

```toml
[storage]
driver = "overlay"
runroot = "/scratch/$USER/podman-run"
graphroot = "/scratch/$USER/podman-storage"

[storage.options]
mount_program = "/usr/bin/fuse-overlayfs"
```

Make sure the target directory (e.g. `/scratch/$USER`) exists and is writable. On a machine with a roomy local home you can skip this and use Podman's defaults.

#### 5. (Optional) Persist ipset kernel modules

The firewall uses `ipset`. The modules are usually already loaded, but this ensures they survive a reboot (otherwise the firewall fails to initialize after a reboot):

```bash
printf 'ip_set\nxt_set\nip_set_hash_net\n' | sudo tee /etc/modules-load.d/ipset.conf
```

### Linux (Docker) — alternative

If you prefer Docker on Linux, install it per [Docker's instructions](https://docs.docker.com/engine/install/), add yourself to the `docker` group, and leave `FG_CONTAINER_RUNTIME` unset. Note this uses a root-owned daemon and does not get the rootless isolation benefits above.

## Security model

The agent (`claude`/`codex`) runs with its approval gates disabled, so the container itself is the sandbox. The setup is structured so that no phase is simultaneously networked, credentialed, privileged, and unfirewalled.

### Unprivileged agent (no sudo)

The image removes the `vscode` user's passwordless sudo (`/etc/sudoers.d/vscode`). The agent runs as the unprivileged `vscode` user and therefore cannot modify the firewall, escalate, or alter root-owned files. All privileged setup happens in a root entrypoint instead (below).

For maintenance you can still get a root shell from the **host**:

```bash
podman exec -u root <container> bash     # rootless Podman
docker exec -u root <container> bash      # Docker/Colima
```

### Build-time installs (credential-free)

Node, the Claude and Codex CLIs, and the pinned Playwright browser are installed at **image build time**, when no credentials are mounted. A poisoned dependency during these installs therefore cannot read your tokens. Only steps that need the mounted workspace remain at runtime, and they hit allowlisted endpoints only.

### Root entrypoint brings up the firewall first

The container starts as root and runs `.devcontainer/entrypoint.sh`, which fixes the `.pixi` volume ownership if needed, initializes the egress firewall (fail-closed — if it fails, the container does not start), signals readiness, and then drops to the long-running command. All lifecycle commands and shells run as the unprivileged `vscode` user. The `postCreate` step waits for the firewall to be up before doing any network access.

### Network firewall (tamper-proof)

`iptables` restricts outbound access to an allowlist (default-DROP otherwise):

- **Anthropic**: api.anthropic.com, statsig.anthropic.com, statsig.com, sentry.io
- **OpenAI**: api.openai.com, chatgpt.com
- **GitHub**: all GitHub IP ranges (fetched from api.github.com/meta)
- **npm**: registry.npmjs.org
- **Python/Pixi/Conda**: pypi.org, files.pythonhosted.org, conda.anaconda.org, conda-mapping.prefix.dev, prefix.dev, repo.prefix.dev
- **VS Code**: marketplace.visualstudio.com, vscode.blob.core.windows.net, update.code.visualstudio.com
- **Fileglancer**: fileglancer.int.janelia.org, s3.janelia.org, neuroglancer-demo.appspot.com

Hardening details:
- **DNS** is allowed only to the resolvers in `/etc/resolv.conf`, not to any host (closes arbitrary-resolver tunneling).
- **No blanket outbound SSH**: there is no "port 22 to anywhere" rule. SSH to GitHub still works because GitHub's ranges are in the allowlist; SSH to other hosts is blocked.
- **No host-subnet allow**: the local `/24` is not opened, preventing lateral movement to neighboring machines.
- Because `vscode` has no sudo, the agent cannot flush or weaken these rules from inside the container.

To add allowed domains, edit `.devcontainer/init-firewall.sh` and rebuild. To disable the firewall (maintenance), comment out the `init-firewall.sh` call in `.devcontainer/entrypoint.sh` and rebuild, or flush it from a host root shell (`podman exec -u root <container> iptables -F`).

### Credential mapping (rootless Podman)

The devcontainers CLI forces `--userns=keep-id`, which would map your host user to the same UID inside the container rather than to `vscode`. The Podman shim upgrades this to `keep-id:uid=1000,gid=1000` so the host user maps onto the container's `vscode` user (UID 1000), making the bind-mounted credentials readable/writable using only the small subuid range — no UID renumbering required.

### Privacy settings

The container disables telemetry via `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and `CLAUDE_CODE_DISABLE_ANALYTICS=1`.

## Host mounts

The container mounts these from the host:

- `~/.claude` — Claude Code config and auth (read-write)
- `~/.claude.json` — Claude Code state (read-write)
- `~/.codex` — Codex config and auth (read-write)
- `~/.gitconfig` — git config (read-only)
- the `fileglancer-pixi` named volume at `<workspace>/.pixi`

## Environment and caches

### pixi cache

The container rootfs (`~/.cache`) is fuse-overlayfs under rootless Podman, which pixi flags as a network filesystem and redirects per-run (with a warning, and losing the cache across rebuilds). `devcontainer.json` sets `PIXI_CACHE_DIR` (via `containerEnv`) to `<workspace>/.pixi/.pixi-cache`, which is on the local xfs `.pixi` volume — so the in-container pixi cache is quiet and persistent.

This is separate from the **host** `PIXI_CACHE_DIR` shell setting above: the two pixis run on different machines/filesystems and are configured independently.

### Playwright

The chromium browser is baked into the image at `/opt/ms-playwright` (pinned to the project's `@playwright/test` version), and `PLAYWRIGHT_BROWSERS_PATH` points there. UI tests run without downloading browsers at runtime.

## Quick Start

On Linux, ensure `FG_CONTAINER_RUNTIME=podman` is exported first (see [Linux setup](#linux-rootless-podman--recommended)).

```bash
# Build and start the container (rebuilds from scratch)
pixi run container-rebuild

# Get a shell inside the container
pixi run container-shell

# Run Claude Code directly
pixi run container-claude

# Run Codex directly
pixi run container-codex
```

## Commands

All container commands are available as pixi tasks:

| Command | Description |
|---------|-------------|
| `pixi run container-rebuild` | Build/rebuild the container from scratch |
| `pixi run container-shell` | Open a bash shell inside the container |
| `pixi run container-claude` | Run Claude Code inside the container |
| `pixi run container-codex` | Run Codex inside the container |

### Open a Shell and Start Development

```bash
pixi run container-shell

# Inside the container, start the dev server
pixi run dev-launch  # Starts on port 7878
```

### Stop the Container

```bash
podman ps | grep fileglancer    # or: docker ps | grep fileglancer
podman stop <container_id>       # or: docker stop <container_id>
```

### Rebuild from Scratch

Use this after modifying the Dockerfile, devcontainer.json, or the firewall/entrypoint scripts:

```bash
pixi run container-rebuild
```

## Inside the Container

| Command | Description |
|---------|-------------|
| `pixi install` | Install pixi dependencies |
| `pixi run dev-install` | Build frontend and install Python package |
| `pixi run dev-launch` | Start dev server on port 7878 |
| `pixi run dev-watch` | Watch frontend for changes |
| `pixi run test-backend` | Run Python tests with coverage |
| `pixi run test-frontend` | Run frontend tests |
| `pixi run test-ui` | Run Playwright E2E tests (browser is pre-installed) |
| `pixi run node-check` | TypeScript type checking |
| `claude` | Claude Code CLI |
| `codex` | Codex CLI |

Note: `sudo` is intentionally unavailable inside the container; use a host root shell for any privileged maintenance (see [Unprivileged agent](#unprivileged-agent-no-sudo)).

## VS Code / Cursor

You can also open the project in VS Code or Cursor and use the "Reopen in Container" command for a GUI-based experience. On Linux with Podman, configure the editor's Dev Containers extension to use the `podman` path (Dev Containers: "Docker Path" / `dev.containers.dockerPath` = `podman`).

## Architecture

Relevant files under `.devcontainer/`:

- **`dc.sh`** — wrapper that selects the runtime from `FG_CONTAINER_RUNTIME` (default `docker`) and passes `--docker-path` to the devcontainers CLI. On the Podman path it routes through `podman-shim/podman` and adds `--update-remote-user-uid-default never`.
- **`podman-shim/podman`** — a shim (named `podman` so the CLI still detects Podman) that rewrites the CLI's forced `--userns=keep-id` to `--userns=keep-id:uid=1000,gid=1000`, mapping the host user onto `vscode`. Used only on the Podman path; Docker/Colima never sees it.
- **`Dockerfile`** — installs system packages, bubblewrap/socat, Node (build-time), the Claude/Codex CLIs, and the pinned Playwright browser; removes `vscode`'s sudo; sets the root entrypoint.
- **`entrypoint.sh`** — root entrypoint: fixes volume ownership, brings up the firewall, signals readiness, execs the long-running command.
- **`init-firewall.sh`** — builds the egress allowlist (run by the entrypoint as root).
- **`post-create.sh`** — runs as `vscode` after the firewall is up: `pixi install --locked`, `dev-install`, UI-test deps. No sudo, no non-allowlisted CDN access.

`devcontainer.json` sets `overrideCommand: false` (so the image ENTRYPOINT/CMD run), `containerUser: root` (for the entrypoint), and `remoteUser: vscode` (for lifecycle commands and shells).

## GPU Support (Linux only)

To enable GPU passthrough for CUDA workloads:

### 1. Install nvidia-container-toolkit

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
```

### 2. Configure the runtime

```bash
# Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Podman (rootless): nvidia-ctk supports CDI; generate a CDI spec
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
```

### 3. Enable GPU in devcontainer

Edit `.devcontainer/devcontainer.json` to add the GPU flag to `runArgs` (`--gpus all` for Docker, or `--device nvidia.com/gpu=all` for Podman CDI):

```json
"runArgs": [
  "--cap-add=NET_ADMIN",
  "--cap-add=NET_RAW",
  "--gpus", "all"
],
```

### 4. Verify

After rebuilding the container:

```bash
nvidia-smi   # inside the container
```
