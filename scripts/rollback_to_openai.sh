#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"
ENV_FILE="${BAYSTATE_ENV_FILE:-$APP_DIR/.env.local}"
REASON="${ROLLBACK_REASON:-Gemini rollback triggered}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

bun --cwd "$APP_DIR" --env-file "$ENV_FILE" scripts/manage-gemini-flags.ts \
  --enable-ai-search false \
  --enable-crawl4ai false \
  --enable-batch false \
  --enable-parallel false \
  --traffic-percent 0 \
  --parallel-sample-percent 0 \
  --reason "$REASON" \
  --source "rollback-script" \
  --updated-by "scripts/rollback_to_openai.sh"

bun --cwd "$APP_DIR" --env-file "$ENV_FILE" scripts/manage-gemini-flags.ts --get
