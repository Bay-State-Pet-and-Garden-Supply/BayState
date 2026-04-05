# Gemini rollback runbook

Use this runbook when Gemini migration traffic needs to be disabled and the consolidation pipeline must return to the OpenAI path immediately.

## Preconditions

1. `apps/web/.env.local` (or `BAYSTATE_ENV_FILE`) must include `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`.
2. Run commands from the repository root.
3. Gemini monitoring is available at `/admin/monitoring/gemini-migration`.

## Verify the current rollout state

```bash
./scripts/verify_rollout.sh
```

This writes `.sisyphus/evidence/gemini-rollout-status.json` and fails if Gemini traffic is active with no completed Gemini jobs or if the recorded parallel accuracy is below `MIN_PARALLEL_ACCURACY` (default `0.90`).

## Roll back to OpenAI

```bash
./scripts/rollback_to_openai.sh
```

The rollback script forces all Gemini feature flags off:

- `GEMINI_AI_SEARCH_ENABLED=false`
- `GEMINI_CRAWL4AI_ENABLED=false`
- `GEMINI_BATCH_ENABLED=false`
- `GEMINI_PARALLEL_RUN_ENABLED=false`
- `GEMINI_TRAFFIC_PERCENT=0`
- `GEMINI_PARALLEL_SAMPLE_PERCENT=0`

## Smoke-test the rollback path

```bash
./scripts/test_rollback.sh
```

This script briefly enables a low-risk Gemini test state, runs the rollback script, and verifies that every Gemini flag returns to zero or false. The verification output is written to `.sisyphus/evidence/gemini-rollback-test.json`.

## Post-rollback checks

1. Open `/admin/monitoring/gemini-migration` and confirm Gemini traffic is `0%`.
2. Sync active consolidation jobs from the admin pipeline if any Gemini shadow runs are still marked pending.
3. Keep using the provider-neutral webhook endpoint for manual completion notifications. Gemini batch mode still relies on polling and internal/manual notifications rather than native external webhooks.

## Notes

- The current live golden dataset source only contains a few hundred `products_ingestion` rows with source data, so strict 1000-row rollout evidence is still blocked by data availability.
- Re-enable Gemini only after verifying the monitoring dashboard, evaluation harness, and flag audit log all show healthy results.
