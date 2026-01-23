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

# Initialize network firewall (restricts outbound to allowed domains)
# This must happen AFTER Playwright install since CDN IPs change dynamically
echo "Initializing network firewall..."
sudo /usr/local/bin/init-firewall.sh

# Install Claude Code globally via npm (provided by pixi)
if ! command -v claude &> /dev/null; then
    echo "Installing Claude Code..."
    pixi run npm install -g @anthropic-ai/claude-code
fi

echo ""
echo "=========================================="
echo "Dev container setup complete!"
echo "=========================================="
echo ""
echo "Available commands:"
echo "  claude --dangerously-skip-permissions  - Start Claude Code"
echo "  pixi run dev-launch                    - Start dev server on port 7878"
echo "  pixi run dev-watch                     - Watch frontend for changes"
echo "  pixi run test-backend                  - Run Python tests"
echo "  pixi run test-frontend                 - Run frontend tests"
echo "  pixi run node-check                    - TypeScript type checking"
echo ""
