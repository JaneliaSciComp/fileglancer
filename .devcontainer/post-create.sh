#!/bin/bash
set -e

# Fix ownership of .pixi volume (created as root by Docker)
sudo chown -R "$(id -u):$(id -g)" .pixi 2>/dev/null || true

# Initialize pixi environment and install package dependencies
echo "Installing pixi environment..."
pixi install

# Install fileglancer in development mode (builds frontend + installs Python package)
echo "Running dev-install (this builds frontend and installs the package)..."
pixi run dev-install

# Install Playwright browsers for UI tests (before firewall, as CDN IPs are dynamic)
echo "Installing Playwright browsers..."
pixi run node-install-ui-tests
cd frontend/ui-tests && pixi run npx playwright install

# Install Claude Code via the native installer (before firewall, since claude.ai
# CDN isn't in the allowlist). Installs to ~/.local/bin/claude, matching the
# "installMethod: native" recorded in the bind-mounted ~/.claude.json from the host.
if ! [ -x "$HOME/.local/bin/claude" ]; then
    echo "Installing Claude Code (native)..."
    curl -fsSL https://claude.ai/install.sh | bash
fi

# Initialize network firewall (restricts outbound to allowed domains)
# This must happen AFTER Playwright and Claude installs since their CDN IPs are dynamic
echo "Initializing network firewall..."
sudo /usr/local/bin/init-firewall.sh

# Install Codex CLI globally via npm (provided by pixi)
if ! command -v codex &> /dev/null; then
    echo "Installing Codex CLI..."
    pixi run npm install -g @openai/codex
fi

# Lock down the firewall: now that setup is complete, revoke the vscode user's
# passwordless sudo. The agent runs as unprivileged vscode, which cannot touch
# iptables/ipset without root, so the egress allowlist can no longer be flushed
# or bypassed from inside the container. NET_ADMIN/NET_RAW remain in the image
# but are unusable without root, so this neutralizes them for the agent.
# For maintenance you can still get a root shell from the HOST side:
#   podman exec -u root <container> bash   (or: docker exec -u root ...)
echo "Revoking in-container sudo to lock the firewall..."
sudo rm -f /etc/sudoers.d/vscode

echo ""
echo "=========================================="
echo "Dev container setup complete!"
echo "=========================================="
echo ""
echo "Available commands:"
echo "  claude --permission-mode auto          - Start Claude Code"
echo "  codex --full-auto                      - Start Codex"
echo "  pixi run dev-launch                    - Start dev server on port 7878"
echo "  pixi run dev-watch                     - Watch frontend for changes"
echo "  pixi run test-backend                  - Run Python tests"
echo "  pixi run test-frontend                 - Run frontend tests"
echo "  pixi run node-check                    - TypeScript type checking"
echo ""
