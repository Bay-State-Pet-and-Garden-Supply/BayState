#!/bin/bash
set -euo pipefail

: "${RUNNER_URL:?Environment variable RUNNER_URL must be set (e.g., https://github.com/actions/runner/releases/download/v<ver>/actions-runner-linux-x64-<ver>.tar.gz)}"
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

  ./config.sh --unattended \
    --url "$CONFIG_URL" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-$(hostname)}" \
    --labels "${RUNNER_LABELS:-self-hosted,docker}" \
    --work "_work" \
    --replace

  echo "Runner configured"
fi

# Start the runner
exec ./run.sh
