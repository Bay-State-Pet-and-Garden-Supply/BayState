# DATA CONSOLIDATION

**Context:** AI-driven product normalization and enrichment pipeline. Transforms raw scraped data into normalized product records using DeepSeek (via direct-chat API).

**Stack:** TypeScript, DeepSeek API (OpenAI-compatible), Supabase.

## OVERVIEW
The consolidation pipeline processes `products_ingestion` records through DeepSeek's `/v1/chat/completions` API using a "direct chat chunks" pattern. Individual chat completions are orchestrated as synthetic batches (`batch_jobs` + `batch_job_items` tables) with polling, retry, and manual apply.

**DeepSeek does NOT have a Batch API.** All consolidation uses individual chat requests (no `/v1/batches` endpoint). The `batch_jobs` table is a logical grouping layer.

## STRUCTURE
```
.
├── index.ts                  # Public API, main entry point
├── llm-client.ts             # LLM client wrapper + runtime config resolution
├── batch-service.ts          # Batch job orchestration (submit, status, retrieve, apply)
├── direct-chat-service.ts    # Direct-chat execution engine
├── prompt-builder.ts         # Dynamic prompt construction with output contract
├── result-normalizer.ts      # Transform LLM outputs to DB schema
├── taxonomy-validator.ts      # Validate categories/pet types, build JSON response format
├── result-parsing.ts         # Parse structured LLM JSON responses
├── two-phase-service.ts      # Two-phase consistency pass across siblings
├── consistency-rules.ts       # Consistency validation rules
├── parallel-runs.ts          # Cross-provider parallel run tracking (legacy)
├── types.ts                  # Consolidation types, interfaces
└── AGENTS.md                 # This file
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **Submit batch** | `batch-service.ts` | `submitBatch(products, metadata)` → routes to direct-chat |
| **Poll status** | `batch-service.ts` | `getBatchStatus(batchId)` → `handleDirectChatStatus()` |
| **Process items** | `direct-chat-service.ts` | `processDirectChatChunk()` — calls DeepSeek per item |
| **Retrieve results** | `batch-service.ts` | `retrieveResults(batchId)` |
| **Apply results** | `batch-service.ts` | `applyResults(batchId)` → upserts to `products_ingestion.consolidated` |
| **Prompt Building** | `prompt-builder.ts` | `buildPromptContext()` + `generateSystemPrompt(categories)` |
| **Taxonomy Validation** | `taxonomy-validator.ts` | `validateCategory()`, `buildJSONResponseFormat()` |
| **Result Parsing** | `result-parsing.ts` | `parseStructuredConsolidationText()` |
| **LLM Config** | `llm-client.ts` | `getConsolidationConfig()`, `getLLMClient()` |
| **Pricing** | `lib/ai-scraping/pricing.ts` | `calculateAICost()` — DeepSeek entries in pricing catalog |

## DATA FLOW
1. **Trigger**: User clicks "Consolidate" in Pipeline UI → POST `/api/admin/consolidation/submit`
2. **Build Prompt**: `buildPromptContext()` loads categories, ShopSite pages → `generateSystemPrompt()` produces system prompt with compact output contract
3. **Create Content**: `createBatchContent()` builds JSONL with one request per SKU
4. **Submit**: `submitBatch()` → `submitDirectChatBatchToRuntime()` → `createDirectChatBatch()`
   - Inserts `batch_jobs` row with `execution_mode: 'direct_chat_chunks'`
   - Inserts one `batch_job_items` row per SKU with `request_payload`
5. **Poll** (repeated until complete):
   - `getBatchStatus()` → `handleDirectChatStatus()` → `processDirectChatChunk()` (processes 1 item per poll cycle)
   - Each item: calls DeepSeek `/v1/chat/completions` with retry logic (3 attempts, exponential backoff)
   - Parses response via `parseStructuredConsolidationText()` → stores in `parsed_result`
6. **Apply**: User clicks "Apply" → `retrieveResults()` → `applyConsolidationResults()` → upserts `products_ingestion.consolidated`

## PROMPT BUILDING
- **System prompt**: Includes source trust rules, product-name rules, field rules, and a compact output contract (JSON structure with all required fields)
- **Output contract**: Works with `response_format: { type: "json_object" }` (DeepSeek-compatible). No strict JSON schema — the schema is described textually in the prompt.
- **User prompt**: Includes filtered source evidence (max 4 sources, sorted by trust), sibling product context, and product line consistency rules

## OUTPUT CONTRACT
```
{
  "name": "string (required)",
  "brand": "string (required)",
  "weight": "string (required)",
  "product_on_pages": "string (required)",
  "confidence_score": "number (required) 0.0-1.0",
  "category": "string (required)",
  "description": "string (required)",
  "long_description": "string (required)",
  "search_keywords": "string (required)"
}
```

## BATCH PROCESSING (direct_chat_chunks)
- **Provider**: DeepSeek (`deepseek-chat` default, `deepseek-reasoner` optional)
- **API**: `/v1/chat/completions` via OpenAI SDK (DeepSeek OpenAI-compatible)
- **Mode**: Synthetic batches — individual requests grouped in `batch_job_items`
- **Size**: 100-500 products per batch
- **Retry**: 3 attempts per item (exponential backoff: 250ms → 500ms → 1000ms)
- **Retryable errors**: 429, 408, 502, 503, 500, timeout, network errors
- **Pricing**: Sync pricing ($0.14/M input, $0.28/M output for deepseek-chat)
- **Processing**: Claim → run → store (1 item per poll cycle; configurable via `limit`)

## CONSOLIDATION MODULE RENAMING NOTES
The module was originally written for OpenAI Batch API. Key renames:
- `openai-client.ts` → `llm-client.ts` (runtime config + LLM client creation)
- `getOpenAIClient()` → `getLLMClient()` (creates OpenAI SDK pointing to DeepSeek)
- `buildOpenAIResponseFormat()` → `buildJSONResponseFormat()` (DeepSeek uses `json_object`)
- `isOpenAIConfigured()` → `isLLMConfigured()`

Legacy `openai_batch_id` column in `batch_jobs` table is retained for historical job lookup.

## API ROUTES
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/consolidation/submit` | POST | Submit SKUs for consolidation |
| `/api/admin/consolidation/[batchId]` | GET | Get batch status |
| `/api/admin/consolidation/[batchId]/apply` | POST | Apply consolidation results |
| `/api/admin/consolidation/jobs` | GET | List batch jobs |
| `/api/admin/consolidation/sync` | POST | Sync batch status from provider |
| `/api/admin/consolidation/settings` | GET/POST | Read/write consolidation defaults |

## ANTI-PATTERNS
- **NO** OpenAI Batch API usage (`/v1/batches`) — DeepSeek doesn't support it
- **NO** hardcoding taxonomy (load from DB)
- **NO** skipping validation (all products must pass)
- **NO** raw LLM output to DB (always normalize first)
- **NO** `json_schema` response format — use `json_object` instead
