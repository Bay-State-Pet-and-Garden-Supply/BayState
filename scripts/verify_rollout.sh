#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"
ENV_FILE="${BAYSTATE_ENV_FILE:-$APP_DIR/.env.local}"
EVIDENCE_DIR="$ROOT_DIR/.sisyphus/evidence"
REPORT_FILE="$EVIDENCE_DIR/gemini-rollout-status.json"
DAYS="${ROLLOUT_DAYS:-7}"
MIN_ACCURACY="${MIN_PARALLEL_ACCURACY:-0.90}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$EVIDENCE_DIR"

bun --cwd "$APP_DIR" --env-file "$ENV_FILE" scripts/gemini-migration-monitoring.ts --days "$DAYS" > "$REPORT_FILE"

bun -e '
const report = JSON.parse(await Bun.file(process.argv[1]).text());
const minAccuracy = Number.parseFloat(process.argv[2]);
const traffic = Number(report.flags?.GEMINI_TRAFFIC_PERCENT ?? 0);
const geminiCompleted = Number(report.providers?.gemini?.completed_jobs ?? 0);
const accuracy = report.parallel_runs?.average_accuracy;

if (traffic > 0 && geminiCompleted === 0) {
  console.error("Gemini traffic is enabled but no Gemini jobs completed in the selected window.");
  process.exit(1);
}

if (typeof accuracy === "number" && accuracy < minAccuracy) {
  console.error(`Parallel accuracy ${accuracy.toFixed(3)} is below ${minAccuracy.toFixed(3)}.`);
  process.exit(1);
}

console.log(JSON.stringify({
  traffic_percent: traffic,
  gemini_completed_jobs: geminiCompleted,
  average_accuracy: accuracy,
  report_path: process.argv[1],
}, null, 2));
' "$REPORT_FILE" "$MIN_ACCURACY"
