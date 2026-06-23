#!/usr/bin/env bash
# Wrapper around the devcontainers CLI that selects the container runtime via
# FG_CONTAINER_RUNTIME (default: docker). This keeps devcontainer.json runtime-
# neutral and lets the same pixi tasks work with Docker/Colima on Mac and
# rootless Podman on Linux. Set FG_CONTAINER_RUNTIME=podman to opt into Podman.
set -euo pipefail

runtime="${FG_CONTAINER_RUNTIME:-docker}"
sub="$1"
shift

docker_path="$runtime"
extra=()

if [[ "$runtime" == "podman" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Route podman through our shim so host-user -> vscode (uid 1000) mapping is
  # applied (see podman-shim/podman). Must keep the basename `podman` so the
  # CLI still detects the Podman runtime.
  docker_path="$script_dir/podman-shim/podman"
  # Disable the CLI's "renumber remote user to host uid" step on `up`: it would
  # need an unsafe ~1M subuid range on this shared host. The shim handles the
  # mapping instead. (--update-remote-user-uid-default is only valid for `up`.)
  if [[ "$sub" == "up" ]]; then
    extra+=(--update-remote-user-uid-default never)
  fi
fi

exec npx @devcontainers/cli "$sub" \
  --docker-path "$docker_path" \
  ${extra[@]+"${extra[@]}"} \
  "$@"
