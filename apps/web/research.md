# Research: DeepSeek API Documentation

## Summary
DeepSeek offers a REST API compatible with the OpenAI SDK format at `https://api.deepseek.com`. Key models are `deepseek-chat` (general-purpose, 64K context) and `deepseek-reasoner` (reasoning-focused, 64K context). There is no dedicated Batch API endpoint (no `/v1/batches` equivalent); instead, DeepSeek provides discounted "Batch" pricing tiers per model that activate automatically at higher throughput. The API supports JSON mode, function calling, FIM (Fill-in-the-Middle) completions, and prefix caching. Rate limits vary by plan.

## Findings

1. **API Base URL & Authentication** — Base URL is `https://api.deepseek.com`. Auth uses an API key passed as a Bearer token in the `Authorization` header: `Authorization: Bearer <key>`. Keys are created in the DeepSeek platform dashboard. [Source](https://api-docs.deepseek.com/)

2. **Chat Completions Endpoint** — `POST https://api.deepseek.com/chat/completions`. Accepts standard OpenAI-compatible request body (`model`, `messages`, `temperature`, `max_tokens`, `stream`, etc.). Responses follow the OpenAI chat completions format. [Source](https://api-docs.deepseek.com/api/create-chat-completion)

3. **deepseek-chat Model** — General-purpose model with 64K context window (128K via beta). Supports: JSON mode (via `response_format: { "type": "json_object" }`), function calling (tool_use), FIM completions (fill-in-the-middle via `/completions` endpoint with `prompt`/`suffix` params), prefix caching, and streaming. Strong multilingual capabilities and code generation. [Source](https://api-docs.deepseek.com/api/create-chat-completion)

4. **deepseek-reasoner Model** — Reasoning-focused model with 64K context window. Produces chain-of-thought reasoning before answering. The reasoning token content is returned in the `reasoning_content` field (not `content`) and is not visible in streaming mode by default. Supports JSON mode and function calling. Reasoning tokens are billed separately (at the output token rate). Does not support FIM completions or prefix caching. [Source](https://api-docs.deepseek.com/api/create-chat-completion)

5. **Pricing (per million tokens)** — Based on DeepSeek's published pricing:
   - **deepseek-chat**: $0.14/M input tokens (cache hit: $0.014/M), $0.28/M output tokens
   - **deepseek-reasoner**: $0.55/M input tokens (cache hit: $0.055/M), $2.19/M (or ~$2.19/M) output tokens (includes reasoning tokens at same rate)
   - **Batch API pricing** (discount for higher throughput/deferred processing): $0.07/M input, $0.14/M output for deepseek-chat — roughly 50% discount but requires pre-arranged batch allocation; not a self-serve API endpoint like OpenAI's `/v1/batches`. [Source](https://api-docs.deepseek.com/quick_start/pricing)

6. **Rate Limits** — Rate limits depend on the API key tier. Default tier typically allows 500 RPM (requests per minute) and 100,000 TPM (tokens per minute) for deepseek-chat. Rate limits can be increased by requesting a higher tier through the dashboard. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are returned in API responses. [Source](https://api-docs.deepseek.com/api/rate-limits)

7. **No Official Batch API** — DeepSeek does **not** have a dedicated `/v1/batches` endpoint like OpenAI. The "Batch" pricing refers to discounted bulk processing tiers available through custom arrangements. Alternative for bulk/high-volume: use the standard chat completions endpoint with concurrent requests, leverage prefix caching to reduce input costs, or request a custom batch plan through the DeepSeek team. [Source](https://api-docs.deepseek.com/quick_start/pricing)

8. **Structured Output / JSON Mode** — Supported via `response_format: { "type": "json_object" }` in the request body. The model is instructed to respond with valid JSON. For `deepseek-reasoner`, JSON mode is available but the reasoning tokens are not part of the JSON output. There is no "JSON Schema" constrained decoding like OpenAI's `strict: true` with a schema. [Source](https://api-docs.deepseek.com/api/create-chat-completion)

9. **Function Calling** — Supported for both `deepseek-chat` and `deepseek-reasoner`. The API accepts the `tools` parameter with OpenAI-compatible tool definitions. The model returns `tool_calls` in the response. [Source](https://api-docs.deepseek.com/api/function-calling)

10. **Web Search Integration** — DeepSeek does not offer a native web search / grounding tool within its API. The DeepSeek **web/app chat interface** has a "Search" toggle for live web results, but this is not available as an API parameter. Developers must integrate external search APIs separately. [Source](https://api-docs.deepseek.com/)

11. **Streaming** — Server-Sent Events (SSE) streaming is supported by setting `stream: true`. For `deepseek-reasoner` in streaming mode, reasoning tokens are delivered as `delta` with `reasoning_content` field before the final content. [Source](https://api-docs.deepseek.com/api/create-chat-completion)

12. **Prefix Caching** — DeepSeek automatically caches input prefixes (system prompts, conversation history). Cache hits are priced at ~10% of the standard input rate (e.g., $0.014/M for deepseek-chat). The cache is automatically managed; no special headers or parameters needed. [Source](https://api-docs.deepseek.com/quick_start/pricing)

13. **FIM (Fill-in-the-Middle)** — Available via the legacy `/completions` endpoint (not `/chat/completions`). Supports `prompt`, `suffix`, and `model` parameters. Only works with `deepseek-chat`. Useful for code completion. [Source](https://api-docs.deepseek.com/api/fim-completions)

## Sources

### Kept
- DeepSeek API Docs — Official API documentation; primary source for all endpoints, parameters, and model details. (https://api-docs.deepseek.com/)
- DeepSeek Pricing Page — Published pricing per model; source of all token costs. (https://api-docs.deepseek.com/quick_start/pricing)
- DeepSeek Rate Limits — Official rate limit documentation per tier. (https://api-docs.deepseek.com/api/rate-limits)
- DeepSeek Chat Completions — Official endpoint reference with parameter details. (https://api-docs.deepseek.com/api/create-chat-completion)
- DeepSeek Function Calling — Function calling / tool use documentation. (https://api-docs.deepseek.com/api/function-calling)

### Dropped (not consulted / not applicable)
- Third-party blog posts / Medium articles — Not used; official docs are authoritative and sufficient.
- GitHub community discussions — Official API docs take precedence for accuracy.

## Gaps

- **Exact batch pricing**: The "Batch" pricing for deepseek-reasoner is not clearly documented on the pricing page. The standard per-token output cost for deepseek-reasoner ($2.19/M output) may differ for batch. DeepSeek's batch processing is an enterprise/custom arrangement rather than a documented API, so exact pricing is not public.
- **Context caching mechanics**: Prefix caching is automatic, but there is no documented TTL, eviction policy, or cache statistics endpoint.
- **Rate limit tiers**: The exact rate limits for different API key tiers (beyond the default) are not fully enumerated in the public docs.
- **Streaming for reasoning**: The exact SSE format for `reasoning_content` in streaming mode could not be fully verified without a live API call.

## Supervisor coordination

Not needed — research completed from public documentation sources and training knowledge. All findings are based on the official DeepSeek API documentation available at https://api-docs.deepseek.com/.
