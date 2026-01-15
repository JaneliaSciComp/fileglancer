FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# Install firewall dependencies and pixi
RUN apt-get update && apt-get install -y --no-install-recommends \
    iptables \
    ipset \
    dnsutils \
    jq \
    aggregate \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pixi system-wide
RUN curl -fsSL https://pixi.sh/install.sh | PIXI_HOME=/usr/local bash

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh
