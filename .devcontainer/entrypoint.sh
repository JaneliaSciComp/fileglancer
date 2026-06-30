#!/usr/bin/env bash
# Root entrypoint: runs at container start, BEFORE any workload or agent. Brings
# up the egress firewall and fixes volume ownership, then execs the long-running
# command. The devcontainers CLI execs all lifecycle commands and shells as the
# unprivileged vscode user, which has no sudo (removed in the image).
set -euo pipefail

WORKSPACE="/workspaces/fileglancer"
READY_FLAG="/run/fg-firewall-ready"

rm -f "$READY_FLAG"

# Fix ownership of the mounted .pixi volume if ANY file in it isn't the dev
# user's. On rootless Podman (keep-id) it's already correct -> no-op. On
# Docker/Colima named volumes are created root-owned, and a stale volume can have
# root-owned contents under a correctly-owned top dir, so probe the whole tree
# (find -quit stops at the first offender) and chown recursively when needed.
# Resolve the dev user by NAME, not a hardcoded 1000: the devcontainers CLI's
# updateRemoteUserUID may remap vscode's UID to the host user's, and chowning to
# the wrong UID is exactly what leaves pixi with "Permission denied".
DEV_USER="$(id -u vscode)"
if [ -d "$WORKSPACE/.pixi" ] && \
   [ -n "$(find "$WORKSPACE/.pixi" -not -uid "$DEV_USER" -print -quit 2>/dev/null)" ]; then
    echo "entrypoint: fixing ownership of $WORKSPACE/.pixi -> vscode ($DEV_USER)"
    chown -R vscode:vscode "$WORKSPACE/.pixi"
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
