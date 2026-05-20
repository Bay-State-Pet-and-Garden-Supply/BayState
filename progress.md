# Gemini 3.5 Flash Multimodal Batch API Consolidation Migration

## Progress Status

### Phase 0 — DB Migration, Settings, Credentials, Pricing ✅
- [x] DB migration: Add `gemini_batch` to batch_jobs execution_mode check constraint
- [x] Pricing catalog: Add Gemini 3.5 Flash sync and batch pricing entries
- [x] Models: Add `gemini-3.5-flash` as default Gemini model (supersedes `gemini-2.5-flash`)
- [x] Credentials: `getAIConsolidationRuntimeConfig()` now resolves Gemini API key independently from active scraping provider
- [x] Consolidation settings API: Accept `gemini_api_key`, `llm_provider='gemini'`, force `llm_supports_batch_api=true`
- [x] Types: Add `gemini_batch` execution mode to `BatchExecutionMode`, add `imageUrls` to `ProductSource`
- [x] openai-client: Support Gemini provider with `provider` field, `gemini_api_key`, `llm_supports_batch_api`

### Phase 1 — Gemini File API & Image Prep ✅
- [x] Gemini client abstraction (gemini-client.ts): File API upload, batch create/status/cancel/download
- [x] Image prep helpers (image-prep.ts): URL selection (first 2), SSRF-safe validation, fetch with size/time limits, Gemini upload with caching
- [x] Image candidate extraction helpers

### Phase 2 — Multimodal Prompt Builder ✅
- [x] Shared prompt evidence module (prompt-evidence.ts): Source filtering, trust ranking (extracted from batch-service.ts)
- [x] Gemini multimodal JSONL builder (multimodal-prompt-builder.ts): systemInstruction, fileData image parts, JSON response config
- [x] Batch output parser: Parse Gemini output JSONL into per-SKU results

### Phase 3 — Gemini Batch Orchestration ✅
- [x] Local job creation (createGeminiBatchJob): No provider calls, inserts DB rows
- [x] Chunked image prep (prepareGeminiBatchChunk): Uploads images for pending items in bounded chunks
- [x] Provider submission (submitPreparedGeminiBatch): Build JSONL, upload via File API, create batch
- [x] Status polling (syncGeminiBatchStatus): Map provider states, download results when complete
- [x] Result parsing and item updates
- [x] Token/cost aggregation with calculateAICost
- [x] Cancellation (cancelGeminiBatch): Provider + local DB

### Phase 4 — Integration ✅
- [x] batch-service.ts: Route submit/status/retrieve/cancel/sync by execution_mode
- [x] NormalizeBatchProvider preserves 'gemini' (was normalizing to 'deepseek')
- [x] findBatchJobRow now selects execution_mode
- [x] Submit route: Skip direct processing for Gemini, return async status
- [x] Sync route: Process both DirectChat queues and Gemini prep/poll
- [x] Pipeline run types: Gemini-specific stage labels
- [x] Dashboard components: Provider label support (already existed via getProviderLabel)
- [x] PipelineClient toast: Show async message for Gemini submissions

### Phase 5 — Tests ✅
- [x] Pricing tests: Gemini 3.5 Flash sync/batch cost assertions (18 tests pass)
- [x] Multimodal prompt builder tests: 11 tests (request structure, image inclusion, no base64, output parsing)
- [x] Image prep tests: 8 tests (URL selection priority, caps, edge cases)
- [x] Gemini batch service tests: 4 tests (status builder, empty input guard)

### Pre-existing test failures (not caused by our changes):
- batch-service.test.ts: 6 failures in `applyConsolidationResults` — test mock columns don't match
- credentials.test.ts: 3 failures — compatibility storage tests
- credentials.route.test.ts: 2 failures — route tests
- prompt-builder.test.ts: 1 failure — brand placement test

## Reviewer Fixes Applied (2026-05-20)

### Blocking Issues Resolved
1. **State machine fix**: Prepared items now go to `'running'` (not `'pending'`). `ready_to_submit` checks only `remainingPending === 0`.
2. **Image fields in submit route**: Selected `selected_images`, `image_candidates` with priority ordering.
3. **SSRF/MIME hardening**: Comprehensive IP validation (IPv4/IPv6/mapped/CGNAT/encodings), manual redirect re-validation, strict MIME + magic-byte gates.
4. **Gemini client fixes**: Resumable upload `Content-Type: application/json`, multipart boundary in header+body, `generationConfig` field in batch create.
5. **Status/sync fixes**: `getBatchStatus` polls Gemini for active jobs. `processAllQueues` uses stored credentials (not current defaults).
6. **Typecheck**: 0 errors.

### Non-Blocking Fixes
- Wired `job.execution_mode` to `getConsolidationStageLabel` in runs route.
- Fixed admin Gemini defaults: `gemini-2.5-flash` → `gemini-3.5-flash`.
- Fixed Gemini model discovery URL (was `v1beta/v1/models`).
- Removed fake pre-provider `provider_batch_id` (null until submission).
- Marked Gemini pricing as `estimated: true`.
- Reject embedded credentials in image URLs.

## Open Risks
- Gemini 3.5 Flash pricing is marked as `estimated: true` — official pricing should be verified against https://ai.google.dev/gemini-api/docs/pricing
- Gemini Batch API endpoints (v1beta/batchedRequests) are based on current docs and may need adjustment
- 6 pre-existing test failures in batch-service.test.ts (mock columns not updated for image_candidates/selected_images)
- No real end-to-end test with actual Gemini API

## Next Steps
1. Run `bun run web lint`
2. Run manual batch with real Gemini API key to validate full flow
3. Update pricing with verified official Gemini 3.5 Flash prices
4. Add background worker or cron for Gemini batch polling if needed
