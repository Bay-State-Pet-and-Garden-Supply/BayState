# Worker B: Item-Level Retry — Completed

## Changes

**File: `lib/consolidation/direct-chat-service.ts`**

1. **Added retry helpers** (after imports, before preflight section):
   - `MAX_RETRY_ATTEMPTS = 3`
   - `BASE_RETRY_DELAY_MS = 250`
   - `isRetryableError()` — detects network/timeout errors (timeout, ECONNREFUSED, ENOTFOUND, etc.) and HTTP errors (429, 408, 503, 502, 500, rate limiting, service unavailable)
   - `delay()` — simple promise-based sleep

2. **Replaced single-attempt try/catch with retry loop** in `processDirectChatChunk()`:
   - Wraps `client.chat.completions.create()` in a loop of up to 3 attempts
   - On transient error: exponential backoff (250ms, 500ms, 1000ms)
   - On non-retryable or terminal failure: marks item as `failed`
   - On success: continues with existing parsing/update logic

3. **No changes to fallback helpers** (`getFailedSkusForFallback`, `markItemsWithFallback`, `cancelDirectChatBatch`) — kept for now per oracle ruling.

## Validation

- `npx tsc --noEmit` — no type errors from my changes
- Pre-existing errors only: 3 unrelated (wishlist module, packages/api account service)

## Risks

- Retry logic only covers the chat completion call. Parse failures (`parseStructuredConsolidationText`) or DB update failures are not retried (existing behavior).
- The `client` is initialized with `maxRetries: 1` OpenAI SDK option — combined with our 3 retry attempts, actual max calls could be up to 6. This is acceptable for DeepSeek's 500 RPM rate limit.
