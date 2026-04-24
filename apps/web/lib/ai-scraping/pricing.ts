/**
 * AI Pricing Utility
 *
 * Provides cost calculation for different AI models and providers.
 * Prices are loaded from the shared pricing catalog at build time.
 * Prices are in USD per 1,000,000 tokens.
 */

import catalogData from '../../../../shared/ai-pricing/pricing-catalog.json';

export interface ModelPricing {
    input: number;
    output: number;
}

const SNAPSHOT_SUFFIX_PATTERN = /-\d{4}-\d{2}-\d{2}$/;

// Build lookup from catalog: key = "model:mode"
const catalogLookup = new Map<string, ModelPricing>();
for (const entry of catalogData.models) {
    const key = `${entry.model}:${entry.mode}`;
    catalogLookup.set(key, { input: entry.input_price, output: entry.output_price });
}

// Backward-compatible exports derived from catalog
export const OPENAI_BATCH_PRICING: Record<string, ModelPricing> = {};
export const OPENAI_SYNC_PRICING: Record<string, ModelPricing> = {};

for (const entry of catalogData.models) {
    if (entry.provider === 'openai') {
        const pricing: ModelPricing = { input: entry.input_price, output: entry.output_price };
        if (entry.mode === 'batch') {
            OPENAI_BATCH_PRICING[entry.model] = pricing;
        } else if (entry.mode === 'sync') {
            OPENAI_SYNC_PRICING[entry.model] = pricing;
        }
    }
}

function resolvePricingModel(model: string, mode: string): ModelPricing | undefined {
    const trimmed = model.trim();

    // Direct lookup
    const directKey = `${trimmed}:${mode}`;
    const direct = catalogLookup.get(directKey);
    if (direct) return direct;

    // Strip snapshot suffix and retry
    const stripped = trimmed.replace(SNAPSHOT_SUFFIX_PATTERN, '');
    if (stripped !== trimmed) {
        const strippedKey = `${stripped}:${mode}`;
        const strippedResult = catalogLookup.get(strippedKey);
        if (strippedResult) return strippedResult;
    }

    return undefined;
}

/**
 * Calculate estimated cost for a model and token usage.
 * @returns Cost in USD
 */
export function calculateAICost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    isBatch: boolean = true
): number {
    if (promptTokens === 0 && completionTokens === 0) {
        return 0;
    }

    const mode = isBatch ? 'batch' : 'sync';
    const pricing = resolvePricingModel(model, mode);

    if (!pricing) {
        console.warn(`[AI Pricing] Unknown model "${model.trim() || '(empty)'}", returning 0 cost`);
        return 0;
    }

    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}