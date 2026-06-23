#!/bin/bash
set -e

# This phase runs as the unprivileged vscode user, AFTER the root entrypoint has
# brought up the egress firewall. It has NO sudo and NO access to non-allowlisted
# CDNs: Claude, Codex, the Playwright browser, and the firewall are all handled
# at image-build / entrypoint time. Only steps that need the mounted workspace
# remain, and they hit only allowlisted endpoints (pypi/conda/prefix.dev/npm).

# Wait for the entrypoint's firewall to be in place before any network access.
echo "Waiting for egress firewall to come up..."
for _ in $(seq 1 60); do
    [ -f /run/fg-firewall-ready ] && break
    sleep 1
done
if [ ! -f /run/fg-firewall-ready ]; then
    echo "ERROR: firewall readiness flag not found; aborting setup" >&2
    exit 1
fi

# Install the pixi environment from the lockfile (no resolution drift).
echo "Installing pixi environment (locked)..."
pixi install --locked

# Build the frontend and install the Python package in development mode.
echo "Running dev-install (frontend build + Python package)..."
pixi run dev-install

# Install UI-test JS deps (the @playwright/test package). The matching browser
# is already baked into the image at PLAYWRIGHT_BROWSERS_PATH.
echo "Installing UI-test dependencies..."
pixi run node-install-ui-tests

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
