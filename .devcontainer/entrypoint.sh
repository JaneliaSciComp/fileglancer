#!/usr/bin/env bash
# Root entrypoint: runs at container start, BEFORE any workload or agent. Brings
# up the egress firewall and fixes volume ownership, then execs the long-running
# command. The devcontainers CLI execs all lifecycle commands and shells as the
# unprivileged vscode user, which has no sudo (removed in the image).
set -euo pipefail

WORKSPACE="/workspaces/fileglancer"
READY_FLAG="/run/fg-firewall-ready"

rm -f "$READY_FLAG"

# Fix ownership of the mounted .pixi volume if it isn't already the dev user's.
# On rootless Podman (keep-id) it's already 1000:1000 -> no-op. On Docker/Colima
# named volumes are created root-owned, so chown them to vscode.
if [ -d "$WORKSPACE/.pixi" ] && [ "$(stat -c %u "$WORKSPACE/.pixi")" != "1000" ]; then
    echo "entrypoint: fixing ownership of $WORKSPACE/.pixi"
    chown -R 1000:1000 "$WORKSPACE/.pixi" || true
fi

# Bring up the egress allowlist firewall before the agent can run. Fail closed:
# if firewall setup fails, the entrypoint exits and the container does not start.
echo "entrypoint: initializing egress firewall"
/usr/local/bin/init-firewall.sh

# Signal readiness so post-create (run by the CLI as vscode) waits for the
# firewall before doing any network access.
touch "$READY_FLAG"

echo "entrypoint: setup complete, starting: $*"
exec "$@"
