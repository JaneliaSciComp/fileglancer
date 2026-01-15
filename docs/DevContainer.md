# Dev Container Usage

The devcontainer provides a complete development environment for Fileglancer with Python 3.14, Node.js, and pixi, configured to run Claude Code with network isolation.

## Prerequisites

- Container runtime (see platform-specific setup below)
- Pixi (provides Node.js for the devcontainer CLI)
- Claude Code configuration at `~/.claude` (API keys and auth)

### Linux (Docker)

Install Docker using your distribution's package manager or [Docker's official instructions](https://docs.docker.com/engine/install/).

Post-installation steps:
```bash
# Add yourself to the docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker

# Enable Docker on startup
sudo systemctl enable docker.service
sudo systemctl enable containerd.service
```

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

#### Manual vs Auto-Start

| Aspect | `colima start` | `brew services start colima` |
|--------|----------------|------------------------------|
| **Resource usage** | Only runs when you need it | Always running after login |
| **Control** | Easy to customize flags per session | Uses default or config file settings |
| **Battery/memory** | Saves resources when not developing | Constant background overhead |
| **Startup** | Manual, ~10-20 seconds | Automatic on login |

**Recommendation:** Use `colima start` directly unless you use containers daily. Start when needed, stop when done:

```bash
colima stop
```

If you prefer auto-start (for frequent container use):

```bash
brew services start colima
```

To save your preferred settings so you don't need flags each time, create `~/.colima/default/colima.yaml`:

```yaml
cpu: 4
memory: 8
disk: 60
```

## Security Features

### Network Firewall

The container uses iptables to restrict outbound network access to allowed domains only:

- **Anthropic**: api.anthropic.com, statsig.anthropic.com, sentry.io
- **GitHub**: All GitHub IP ranges (fetched from api.github.com/meta)
- **npm**: registry.npmjs.org
- **Python/Pixi/Conda**: pypi.org, files.pythonhosted.org, conda.anaconda.org, conda-mapping.prefix.dev, prefix.dev, repo.prefix.dev
- **VS Code**: marketplace.visualstudio.com, vscode.blob.core.windows.net

To add more allowed domains, edit `.devcontainer/init-firewall.sh`.

To disable the firewall at runtime:
```bash
sudo iptables -F && sudo iptables -P INPUT ACCEPT && sudo iptables -P OUTPUT ACCEPT
```

To skip it entirely on container startup, comment out the firewall line in `.devcontainer/post-create.sh` and rebuild.

### Privacy Settings

The container sets environment variables to disable telemetry:
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
- `CLAUDE_CODE_DISABLE_ANALYTICS=1`

## Host Mounts

The container mounts these directories from the host:
- `~/.claude` - Claude Code API keys and authentication

## Quick Start

```bash
# Build and start the container (rebuilds from scratch)
pixi run container-rebuild

# Get a shell inside the container
pixi run container-shell

# Or run Claude Code directly
pixi run container-claude
```

## Commands

All container commands are available as pixi tasks:

| Command | Description |
|---------|-------------|
| `pixi run container-rebuild` | Build/rebuild the container from scratch |
| `pixi run container-shell` | Open a bash shell inside the container |
| `pixi run container-claude` | Run Claude Code inside the container |

### Open a Shell and Start Development

```bash
pixi run container-shell

# Inside the container, start the dev server
pixi run dev-launch  # Starts on port 7878
```

### Run Claude Code

```bash
# Run Claude Code directly in the container
pixi run container-claude

# Or from inside a container shell
pixi run container-shell
claude --dangerously-skip-permissions
```

### Stop the Container

```bash
# Find the container ID
docker ps | grep fileglancer

# Stop it
docker stop <container_id>
```

### Rebuild from Scratch

Use this after modifying Dockerfile or devcontainer.json:

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
| `pixi run node-check` | TypeScript type checking |
| `pixi run node-eslint-check` | Run ESLint |
| `pixi run node-prettier-check` | Run Prettier check |
| `claude` | Claude Code CLI |

## VS Code / Cursor

You can also open the project in VS Code or Cursor and use the "Reopen in Container" command for a GUI-based experience.

## Standalone CLI (without devcontainer)

You can run Claude Code in a container without using the devcontainer CLI:

```bash
# Build the image (from repo root)
docker build -t fileglancer-dev .devcontainer/

# Run interactively
docker run \
  --cap-add=NET_ADMIN \
  --cap-add=NET_RAW \
  -v ~/.claude:/home/vscode/.claude \
  -v "$(pwd)":/workspace \
  -w /workspace \
  -e NODE_OPTIONS="--max-old-space-size=4096" \
  -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
  -e CLAUDE_CODE_DISABLE_ANALYTICS=1 \
  -p 7878:7878 \
  -it fileglancer-dev bash

# Inside the container, initialize firewall and set up the project
sudo /usr/local/bin/init-firewall.sh
pixi install
pixi run dev-install
pixi run npm install -g @anthropic-ai/claude-code
claude --dangerously-skip-permissions
```

## GPU Support (Linux only)

To enable GPU passthrough for CUDA workloads:

### 1. Install nvidia-container-toolkit

```bash
# Add NVIDIA repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
```

### 2. Configure Docker runtime

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 3. Enable GPU in devcontainer

Edit `.devcontainer/devcontainer.json` to add `--gpus all` to `runArgs`:

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
# Inside the container
nvidia-smi
```
