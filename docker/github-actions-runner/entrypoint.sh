#!/bin/bash
set -euo pipefail

: "${RUNNER_TOKEN:?Environment variable RUNNER_TOKEN must be set (GitHub runner registration token)}"
: "${RUNNER_ORG:-}"
: "${RUNNER_REPO:-}"

if [ -z "${RUNNER_ORG:-}" ] && [ -z "${RUNNER_REPO:-}" ]; then
  echo "ERROR: Either RUNNER_ORG or RUNNER_REPO must be set"
  exit 1
fi

# Build a full URL for the GitHub target (allows providing just org/repo)
build_url() {
  local v="$1"
  if [[ "$v" =~ ^https?:// ]]; then
    echo "$v"
  else
    echo "https://github.com/$v"
  fi
}

# On first run, configure the runner.
if [ ! -f "/runner/.runner" ]; then
  echo "Configuring runner..."
  CONFIG_URL=$(build_url "${RUNNER_REPO:-$RUNNER_ORG}")

  # Drop privileges to run config.sh as the 'runner' user, setting HOME correctly
  sudo -H -u runner ./config.sh --unattended \
    --url "$CONFIG_URL" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-$(hostname)}" \
    --labels "${RUNNER_LABELS:-self-hosted,docker}" \
    --work "_work" \
    --replace

  echo "Runner configured"
fi

# Fix docker socket permissions if it exists
if [ -S /var/run/docker.sock ]; then
  chmod 666 /var/run/docker.sock
fi

# Start the runner as the non-root 'runner' user, setting HOME correctly
exec sudo -H -u runner ./run.sh
