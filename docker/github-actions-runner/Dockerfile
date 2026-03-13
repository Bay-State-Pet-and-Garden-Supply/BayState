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
    && rm -rf /var/lib/apt/lists/*

ENV RUNNER_VERSION=2.332.0
ENV RUNNER_URL=https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

WORKDIR /runner

# Create a non-root user for the runner (config.sh refuses to run as root)
RUN useradd --create-home --shell /bin/bash runner \
 && chown -R runner:runner /runner

RUN curl -fsSL "$RUNNER_URL" -o runner.tar.gz \
 && tar xzf runner.tar.gz --strip-components=0 \
 && rm runner.tar.gz \
 && chown -R runner:runner /runner

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER runner

ENTRYPOINT ["/entrypoint.sh"]
