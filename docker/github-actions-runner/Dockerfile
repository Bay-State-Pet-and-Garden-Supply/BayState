# GitHub Actions self-hosted runner container (built from the official runner tarball)
FROM ubuntu:22.04

# Install required packages for the runner
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      jq \
      git \
      iputils-ping \
      libssl3 \
      libicu70 \
      libkrb5-3 \
      liblttng-ust1 \
      libcurl4 \
      libunwind8 \
      tzdata \
      procps \
      docker.io \
      sudo \
    && rm -rf /var/lib/apt/lists/*

ENV RUNNER_VERSION=2.333.1

WORKDIR /runner

# Create a non-root user for the runner (config.sh refuses to run as root)
# Match UID and GID to the host (501 on macOS) to avoid volume permission issues
RUN groupadd --gid 501 runner \
 && useradd --create-home --shell /bin/bash --uid 501 --gid 501 runner \
 && chown -R runner:runner /runner \
 && echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Use build args for architecture detection
ARG TARGETARCH

RUN if [ "$TARGETARCH" = "arm64" ]; then \
      RUNNER_ARCH="arm64"; \
    else \
      RUNNER_ARCH="x64"; \
    fi && \
    RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" && \
    curl -fsSL "$RUNNER_URL" -o runner.tar.gz && \
    tar xzf runner.tar.gz --strip-components=0 && \
    rm runner.tar.gz && \
    chown -R runner:runner /runner

# Set ownership to runner user
RUN chown -R runner:runner /runner

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# The container will run as root to allow the entrypoint to fix docker socket permissions.
# Privileges will be dropped to the 'runner' user inside the entrypoint.sh script.

ENTRYPOINT ["/entrypoint.sh"]
