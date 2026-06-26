FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# System packages: firewall tooling (iptables/ipset/dns/jq/aggregate), curl, and
# the sandbox helpers bubblewrap + socat.
RUN apt-get update && apt-get install -y --no-install-recommends \
    iptables \
    ipset \
    dnsutils \
    jq \
    aggregate \
    curl \
    ca-certificates \
    gnupg \
    bubblewrap \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Node.js, build-time only: needed to install the Codex CLI and the Playwright
# browser at image-build time (when no credentials are mounted). The project
# itself uses pixi's own Node for builds at runtime.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pixi system-wide
RUN curl -fsSL https://pixi.sh/install.sh | PIXI_HOME=/usr/local bash

# Playwright browser + OS deps, pinned to the project's version, in a shared path
# readable by the vscode user. The config defines no projects, so only chromium
# is needed. Done at build time so the runtime (firewalled) phase never needs the
# dynamic Playwright CDN.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN npx --yes playwright@1.56.1 install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Codex CLI (global). Build-time install -> no credentials present to leak.
RUN npm install -g @openai/codex

# Claude Code (native installer) as the vscode user so it lands in
# /home/vscode/.local/bin and matches installMethod "native".
USER vscode
RUN curl -fsSL https://claude.ai/install.sh | HOME=/home/vscode bash
USER root

# Firewall script + root entrypoint that brings it up before any workload runs.
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/init-firewall.sh /usr/local/bin/entrypoint.sh

# Bake "no sudo for vscode" into the image: the agent runs unprivileged and can
# never escalate or modify the firewall. Privileged setup (firewall init, volume
# chown) happens in the root entrypoint instead. For maintenance, exec as root
# from the host: `podman exec -u root <container> bash`.
RUN rm -f /etc/sudoers.d/vscode

# Start as root so the entrypoint can set up the firewall, then exec the
# long-running command. The devcontainers CLI execs all lifecycle commands and
# shells as the unprivileged remoteUser (vscode).
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sleep", "infinity"]
