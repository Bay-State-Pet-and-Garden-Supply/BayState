# AI Discovery Prompt Design v2

## Context
This document defines **design-only** Prompt v2 templates for:
- `_identify_best_source()` selection prompt
- `crawl4ai` extraction `instruction`

Scope is based on baseline findings in `tests/analysis/analysis_baseline.md`:
- Retailer-heavy source picks correlated with sparse extraction (price/images/availability gaps).
- Silent partial extraction occurred frequently (`success=true` with missing critical fields).
- Variant mismatch reduced name/image precision.
- Availability normalization was inconsistent.

---

## 1) Source Selection Prompt v2 (exact string template)

Use this as the new prompt string for `_identify_best_source`.

```python
prompt = f"""You are ranking search results to select the single best product page for structured extraction.

INPUT PRODUCT CONTEXT
- SKU: {sku or "Unknown"}
- Brand (may be null): {brand or "Unknown"}
- Product Name: {product_name or "Unknown"}

SEARCH RESULTS
{results_text}

INSTRUCTIONS
1) Infer the likely canonical brand when Brand is Unknown by using Product Name tokens and search result titles/descriptions.
2) Score each result using this weighted rubric (0-100 total):
   - Domain authority & source tier (0-45)
     - 45: official manufacturer / official brand domain for inferred brand
     - 30: major trusted retailer PDP (Home Depot, Lowe's, Walmart, Target, Chewy, Tractor Supply, Ace)
     - 10: marketplace / affiliate / review / aggregator pages
   - SKU/variant relevance (0-30)
     - Explicit SKU match or exact variant tokens (size/color/form) in title/snippet/url
   - Content quality signals (0-25)
     - Strong signals: explicit price mention, stock/availability hint, product detail depth, image-rich PDP indicators
     - Penalize thin pages, category pages, blog/review pages, comparison pages, or "best X" roundups

REQUIRED DECISION POLICY
- Prefer manufacturer page if it is plausibly the exact SKU/variant.
- If no viable manufacturer result exists, choose best major retailer PDP.
- Affiliate/review/aggregator pages are last resort and should only be selected when nothing else is viable.

OUTPUT FORMAT (STRICT)
- Return ONLY one integer from 1 to {len(search_results)} for the best result.
- Return 0 only if none are suitable product pages.
"""
```

### Why these changes
- **Domain authority + tiering** directly addresses baseline retailer/low-quality mis-selection cluster.
- **Brand inference when null** addresses null-brand SKU context from baseline dataset.
- **Content quality signals** reduce selection of thin/difficult pages that led to missing price/images/availability.
- **SKU/variant relevance weighting** mitigates size/color/form mismatch seen in name failures.

---

## 2) crawl4ai Extraction Instruction v2 (exact string template)

Use this as the `instruction` string passed into `LLMExtractionStrategy`.

```python
instruction = f"""Extract structured product data for a single SKU-locked product page.

TARGET CONTEXT
- SKU: {sku}
- Expected Brand (may be null): {brand or "Unknown"}
- Expected Product Name: {product_name or "Unknown"}

CRITICAL EXTRACTION RULES
1) SKU / VARIANT LOCK (FUZZY VALIDATION)
   - Ensure extracted product refers to the same variant as the target SKU context.
   - Match using fuzzy evidence across: SKU text, size/weight, color, flavor, form-factor terms.
   - Do NOT output data for a different variant from carousel/recommendations.

2) BRAND INFERENCE
   - If Expected Brand is Unknown/null, infer brand from the product title, breadcrumb, manufacturer field, or structured data.
   - Return the canonical brand string (not store name).

3) MUST-FILL CHECKLIST BEFORE FINAL OUTPUT
   - product_name: required
   - price: required
   - images: at least 1 required
   - availability: required
   - brand and description: strongly preferred
   - If a required field cannot be found, keep searching the same page context (JSON-LD, meta, visible PDP modules) before giving up.

4) PRICE NORMALIZATION
   - Extract current active variant price.
   - Normalize to a single numeric-like money string (example: "$14.99"), no ranges unless only a range exists.
   - If a range is shown, choose the active selected variant price when available.
   - Ignore struck-through MSRP unless it is the only visible current price.

5) IMAGE PRIORITIZATION
   - Put primary hero image first.
   - Prefer URLs for the exact selected variant.
   - Return absolute URLs only (https://...).
   - Exclude sprites, icons, logos, and unrelated recommendation images.

6) AVAILABILITY NORMALIZATION (STRICT ENUM)
   - Normalize to one of exactly:
     - "In Stock"
     - "Out of Stock"
     - "Unknown"
   - Use precedence: explicit stock badge/text > add-to-cart state > structured data availability > Unknown.

7) DESCRIPTION QUALITY
   - Extract meaningful product description/spec text for the exact variant, not generic category copy.

OUTPUT QUALITY BAR
- Return the most complete, variant-accurate record possible.
- Do not hallucinate missing values.
"""
```

### Why these changes
- **Must-fill checklist** targets the baseline silent-partial-extraction issue.
- **Fuzzy SKU/variant lock** addresses name/image mismatches on size/color/form.
- **Brand inference fallback** preserves strong brand performance even when brand input is null.
- **Price normalization policy** addresses extremely low baseline price accuracy.
- **Image ordering + absolute URL constraints** improve relevance and downstream usability.
- **Availability enum + precedence** fixes inconsistency and normalizes output for consumers.

---

## Expected impact vs baseline (estimates)

These are design-stage expectations (to validate in Prompt v2 test run):

| Field | Baseline | Expected with Prompt v2 | Rationale |
|---|---:|---:|---|
| Brand | 100% | 95-100% | Maintain with null-brand inference guardrails |
| Name | 70% | 82-90% | Variant lock + source relevance weighting |
| Price | 10% | 65-85% | Must-fill + active-variant normalization |
| Description | 60% | 70-85% | Explicit description quality requirement |
| Images | 30% | 75-92% | Hero-first + absolute URL + exact variant filtering |
| Availability | 30% | 70-85% | Strict enum + precedence order |

## Implementation notes for next task (not executed here)
- Keep model unchanged (`gpt-4o-mini` via existing `self.llm_model`).
- Keep schema fields unchanged (no new fields).
- Replace prompt/instruction strings only during implementation task.


---

## Finetuning Results (April 2026)

### Optimization Approach

The April 2026 finetuning effort focused on improving AI consolidation performance through structured prompt engineering:

- **Structured consistency examples vs text-based rules**: Replaced verbose textual guidelines with concrete, structured examples that the LLM can directly reference
- **Batch mode declaration for product lines**: Added explicit batch processing context when handling multiple products from the same category
- **Variant relationship detection**: Implemented sibling product context to improve variant identification and consistency
- **Cross-product verification**: Enabled the LLM to cross-check fields across related products in the same batch

### Test Results

| Metric | Baseline | Prompt v1 | Change |
|--------|----------|-----------|--------|
| Brand consistency | 100% | 100% | Maintained |
| Category consistency | 100% | 100% | Maintained |
| Product name consistency | 100% | 100% | Maintained |
| Response time | 2402ms | 2296ms | **4.4% improvement** |
| API success rate | 100% | 100% | Maintained |

All consistency metrics remained at 100% while achieving a measurable response time improvement.

### Key Learnings

1. **Concrete examples improve LLM consistency enforcement**: Structured examples with clear pass/fail criteria produced more reliable results than abstract rule descriptions
2. **Batch mode declaration helps cross-product awareness**: Explicitly stating "you are processing N products from category X" improved field consistency across the batch
3. **Sibling context of 5 is optimal**: Testing showed no measurable benefit from increasing sibling context beyond 5 products; larger contexts increased token usage without quality gains
4. **Gemini Flash Lite is cost-effective for consolidation**: Provides sufficient quality for consolidation tasks at significantly lower cost than larger models

### Updated Recommendations

Based on these findings, the following practices are now recommended:

- **Use structured consistency examples in prompts**: Replace text-based rules with concrete JSON/XML examples showing correct vs incorrect output
- **Include batch mode declaration for product line processing**: Explicitly state batch size and category context at the start of consolidation prompts
- **Maintain 5 sibling products in context**: This provides sufficient cross-product awareness without excessive token usage
- **Deploy hybrid provider strategy**: Use Gemini for search and consolidation tasks, OpenAI for complex extraction tasks requiring higher reasoning capabilities

### Cost Impact

The finetuning effort delivered substantial cost savings:

- **60-70% cost reduction** with hybrid provider approach (Gemini for search/consolidation, OpenAI reserved for extraction)
- **No quality degradation**: All consistency metrics maintained at 100%
- **Faster response times**: 4.4% improvement in average response time

These optimizations allow the system to handle higher volumes at lower cost while maintaining accuracy standards.