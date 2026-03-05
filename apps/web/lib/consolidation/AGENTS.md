# DATA CONSOLIDATION

**Context:** AI-driven product normalization and enrichment pipeline. Recently added to handle scraped data quality.

## OVERVIEW
Batch processing engine that transforms raw scraped data into normalized product records using OpenAI. Handles taxonomy validation, attribute extraction, and data enrichment.

**Stack:** TypeScript, OpenAI Batch API, Supabase.

## STRUCTURE
```
.
├── index.ts                  # Public API, main entry point
├── openai-client.ts          # OpenAI client wrapper, batch management
├── batch-service.ts          # Batch job orchestration
├── prompt-builder.ts         # Dynamic prompt construction
├── result-normalizer.ts      # Transform LLM outputs to DB schema
├── taxonomy-validator.ts      # Validate categories/pet types
└── types.ts                 # Consolidation types, interfaces
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **Process Ingestion** | `index.ts` | `consolidateIngestion(id)` function |
| **Prompt Building** | `prompt-builder.ts` | `buildConsolidationPrompt(rawData)` |
| **Normalization** | `result-normalizer.ts` | `normalizeLLMResponse(llmOutput)` |
| **Validation** | `taxonomy-validator.ts` | `validateTaxonomy(product)` |
| **Batch Jobs** | `batch-service.ts` | `createBatchJob()`, `monitorJob()` |

## DATA FLOW
1. **Trigger**: Scrape job completes → `products_ingestion` record created
2. **Fetch**: Load raw JSON from `scrape_results` table
3. **Build Prompt**: Assemble context from raw data, existing similar products
4. **Submit Batch**: Create OpenAI batch job with prompt
5. **Monitor**: Poll batch status until complete
6. **Normalize**: Parse LLM JSON response → transform to DB schema
7. **Validate**: Check taxonomy (categories, pet types, attributes)
8. **Write**: Upsert to `products` table, mark ingestion as processed

## PROMPT BUILDING
- **Context**: Include site URL, product URL, raw extracted fields
- **Few-Shot Examples**: Provide 2-3 similar products as reference
- **Output Format**: Strict JSON schema with required fields
- **Instructions**: "Normalize for e-commerce catalog", "Extract hidden attributes"

## NORMALIZATION RULES
- **Categories**: Map to existing `categories` table, create if needed
- **Pet Types**: Validate against enum (Dog, Cat, Bird, SmallAnimal)
- **Attributes**: Extract from raw text (e.g., "Weight: 50 lbs" → `{weight: 50, unit: 'lbs'}`)
- **Images**: Sort by quality, select primary image
- **Pricing**: Normalize to USD, calculate `msrp` and `sale_price`

## BATCH PROCESSING
- **API**: OpenAI Batch API (async, cost-effective for bulk)
- **Size**: Process 100-500 products per batch
- **Retry**: Exponential backoff on failures
- **Logging**: Track batch ID, token usage, processing time

## ANTI-PATTERNS
- **NO** synchronous API calls (use batch or queue)
- **NO** hardcoding taxonomy (load from DB)
- **NO** skipping validation (all products must pass)
- **NO** raw LLM output to DB (always normalize first)

## COMMANDS
```typescript
// Process single ingestion
import { consolidateIngestion } from '@/lib/consolidation'
await consolidateIngestion(ingestionId)

// Process pending batch
import { processPendingIngestions } from '@/lib/consolidation'
await processPendingIngestions(limit: 100)
```
