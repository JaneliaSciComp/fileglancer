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

# Install Playwright browser dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0t64 \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libxcb1 \
    libxkbcommon0 \
    libatspi2.0-0t64 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libcairo2 \
    libpango-1.0-0 \
    libasound2t64 \
    && rm -rf /var/lib/apt/lists/*

# Install pixi system-wide
RUN curl -fsSL https://pixi.sh/install.sh | PIXI_HOME=/usr/local bash

# Copy firewall init script
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh
