# Draft: AI Consolidation Refinement

**Exploration Date**: 2026-02-27
**Scope**: BayStateApp AI Consolidation feature refinement

## Current Implementation Status

### ✅ Already Built (lib/consolidation/)
- **batch-service.ts** (933 lines) - OpenAI Batch API submission, status polling, result retrieval
- **prompt-builder.ts** (197 lines) - Dynamic prompt generation with taxonomy constraints
- **result-normalizer.ts** (183 lines) - Post-processing: unit standardization, decimal trimming
- **taxonomy-validator.ts** (249 lines) - Fuzzy matching for categories/product types
- **openai-client.ts** (51 lines) - Uses `gpt-4o-mini`

### ✅ Already Filtering (batch-service.ts:90-143)
```typescript
// Current filterSourceData() removes:
- Image URLs (keys containing "url")
- Metadata keys (starting with "_")
- Empty values
- Very long JSON (>1000 chars)
```

### ✅ Current Normalization (result-normalizer.ts)
- Unit standardization: lb, oz, ct, in, ft, L
- Decimal trimming
- Dimension formatting
- Title case preservation

## User Requirements (from discussion)

1. **Token Efficiency**: ✅ Already filtering images/irrelevant fields
2. **Proper Casing**: ✅ Already implemented
3. **Weights in LB, just the number**: "16 oz." → "1" - NEED TO VERIFY
4. **Preserve images for next step**: ✅ Images stored separately, not sent to LLM
5. **Brand NOT in product name**: NEED TO VERIFY in prompt-builder

## Open Questions

1. **What's broken/missing?** - Is the current implementation not working, or does it need refinement?
2. **Weight conversion** - Current normalizer standardizes units but may not convert "16 oz" → "1" (lb)
3. **Brand exclusion** - Need to check if prompt explicitly tells LLM to exclude brand from name
4. **Image selection UI** - Is the "next step after consolidation" for image selection already built?

## Data Flow (Current)

```
Scraper Results → products_ingestion.sources (JSONB)
                      ↓
              [Manual Trigger]
                      ↓
         filterSourceData() removes images/URLs
                      ↓
              OpenAI Batch API
                      ↓
         result-normalizer.ts post-processing
                      ↓
         products_ingestion.consolidated (JSONB)
                      ↓
              [Image Selection Step?]
                      ↓
              Final Product
```

## Files to Examine for Gaps

- [ ] `lib/consolidation/prompt-builder.ts` - Check if brand exclusion is in system prompt
- [ ] `lib/consolidation/result-normalizer.ts` - Check weight conversion logic
- [ ] `components/admin/pipeline/` - Check if image selection UI exists post-consolidation



## User Requirements (Confirmed)

### Must Have
1. ✅ **Token Efficiency**: Already filtering images/irrelevant fields
2. ✅ **Proper Casing**: Already implemented
3. 🔄 **Weights in LB, just the number**: "16 oz." → "1" (NEED TO VERIFY/IMPLEMENT)
4. 🔄 **Brand NOT in product name**: Need to check prompt-builder system prompt
5. ✅ **Preserve images for next step**: Images stored separately in products_ingestion
6. 🔄 **Separate image selection UI**: Need to verify post-consolidation step exists

### Technical Requirements
- **LLM**: OpenAI Batch API (preferred) - Model TBD
- **Scale**: Hundreds of products efficiently
- **Integration**: Connect to existing pipeline UI
- **Approach**: Review and fix existing code (user wasn't aware it existed)

## Model Recommendation

Given requirements (hundreds of products, efficiency, cost-conscious):

| Model | Cost | Speed | Quality | Recommendation |
|-------|------|-------|---------|----------------|
| **gpt-4o-mini** | $0.15/$0.60 per 1M | Fast | Good | **KEEP CURRENT** - Best value for this use case |
| gpt-4o | $2.50/$10.00 per 1M | Fast | Excellent | Overkill for product consolidation |
| gpt-3.5-turbo | $0.50/$1.50 per 1M | Fast | Good | Deprecated, mini is better |

**Recommendation**: Stick with `gpt-4o-mini` via Batch API. It's cost-effective and quality is sufficient for product data normalization.

## Gap Analysis (To Verify)

### 1. Weight Conversion
**Current** (result-normalizer.ts): Standardizes units (lb, oz) but may not convert "16 oz" → "1"
**Need**: Convert weight to LB numeric value only

### 2. Brand Exclusion
**Current** (prompt-builder.ts): Need to verify system prompt instructions
**Need**: Ensure LLM excludes brand from consolidated `name` field

### 3. Image Selection UI
**Current**: Images stored in `products_ingestion.image_candidates` and `sources`
**Need**: UI for users to select which images to use after consolidation

### 4. Batch Size Optimization
**Current**: Batch service exists but batch size may not be optimized
**Need**: Verify batch size is efficient for "hundreds of products"

## Success Criteria

1. Consolidation produces clean product names (no brand)
2. Weights converted to LB numeric ("1" not "1 lb" or "16 oz")
3. Token usage optimized (already filtering images)
4. Batch processing efficient for hundreds of products
5. Image selection UI available after consolidation

## Open Questions (Resolved)

- ✅ **Blocker**: User wasn't aware of existing code
- ✅ **Approach**: Review and fix existing code
- ✅ **LLM**: OpenAI Batch API preferred
- ✅ **Model**: gpt-4o-mini recommended (keep current)


## Critical Questions (From Metis Analysis)

Before generating the work plan, I need answers to these 8 questions:

### 1. Weight Conversion Precision
"16 oz" → "1", "1.0", or "1.00"?
What about "20 oz" → "1.25" or "1.3" (rounded)?

### 2. Weight Edge Cases
Should we handle:
- "1 lb 8 oz" (compound units)?
- Metric units (kg, g) → lb conversion?
- "16oz" (no space)?

### 3. Brand Exclusion Scope
Remove brand from:
- [ ] START of name only: "Blue Buffalo Dog Food" → "Dog Food"
- [ ] ANYWHERE in name: "Dog Food by Blue Buffalo" → "Dog Food"
- [ ] Case-insensitive matching required?

### 4. Image Selection UI - Critical Clarification
**Important finding**: Images/URLs are filtered OUT before LLM (for efficiency).
Where will the image selection UI get images from?
- [ ] Scraped URLs in products_ingestion.sources (raw pre-filtered data)
- [ ] Separate table/field in database
- [ ] Fetch from external URLs at display time
- [ ] Already downloaded to storage

### 5. Image UI Location
New page or existing?
- [ ] /admin/consolidation/images (new)
- [ ] /admin/enrichment (existing workspace)
- [ ] /admin/products/[sku]/images (per-product)

### 6. Batch "Hundreds" Definition
What range is "hundreds"?
- [ ] 100-300 (single batch - no chunking needed)
- [ ] 300-1000 (might need chunking)
- [ ] 1000+ (definitely need chunking)

### 7. Error Handling Preference
If weight conversion fails:
- [ ] Preserve original value, continue
- [ ] Mark as error, skip product
- [ ] Set to null, continue

### 8. Testing Approach
OpenAI API in tests?
- [ ] Mock OpenAI client (fast, offline)
- [ ] Use real API with test key (slow, online)
- [ ] Test only normalization logic (no API calls)