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
    && rm -rf /var/lib/apt/lists/*

ENV RUNNER_VERSION=2.333.0

WORKDIR /runner

# Create a non-root user for the runner (config.sh refuses to run as root)
RUN useradd --create-home --shell /bin/bash runner \
 && chown -R runner:runner /runner

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

# Ensure the runner user can access the docker socket (mounted from host)
# This usually requires adding to the docker group (gid 999 on Ubuntu)
# But we can also chmod 666 the socket on the host or use sudo.
# For simplicity, we'll let the user handle group mapping.

USER runner

ENTRYPOINT ["/entrypoint.sh"]
