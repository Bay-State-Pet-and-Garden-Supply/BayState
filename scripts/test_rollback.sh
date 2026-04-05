#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"
ENV_FILE="${BAYSTATE_ENV_FILE:-$APP_DIR/.env.local}"
EVIDENCE_DIR="$ROOT_DIR/.sisyphus/evidence"
RESULT_FILE="$EVIDENCE_DIR/gemini-rollback-test.json"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$EVIDENCE_DIR"

bun --cwd "$APP_DIR" --env-file "$ENV_FILE" scripts/manage-gemini-flags.ts \
  --enable-ai-search true \
  --enable-crawl4ai true \
  --enable-batch true \
  --enable-parallel true \
  --traffic-percent 10 \
  --parallel-sample-percent 10 \
  --reason "Preparing rollback smoke test" \
  --source "rollback-test" \
  --updated-by "scripts/test_rollback.sh" > /dev/null

"$ROOT_DIR/scripts/rollback_to_openai.sh" > /dev/null

bun --cwd "$APP_DIR" --env-file "$ENV_FILE" scripts/manage-gemini-flags.ts --get > "$RESULT_FILE"

bun -e '
const flags = JSON.parse(await Bun.file(process.argv[1]).text());
const enabled = Object.entries(flags).filter(([key, value]) => {
  if (key === "GEMINI_PARALLEL_SAMPLE_PERCENT" || key === "GEMINI_TRAFFIC_PERCENT") {
    return Number(value) !== 0;
  }
  return value === true;
});

if (enabled.length > 0) {
  console.error("Rollback verification failed:", enabled);
  process.exit(1);
}

console.log(JSON.stringify({
  rollback_verified: true,
  result_path: process.argv[1],
}, null, 2));
' "$RESULT_FILE"
