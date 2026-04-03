/**
 * AI Pricing Utility
 *
 * Provides cost calculation for different AI models and providers.
 * Prices are in USD per 1,000,000 tokens.
 */

export interface ModelPricing {
    input: number;
    output: number;
}

const DEFAULT_PRICING_MODEL = 'gpt-4o-mini';
const SNAPSHOT_SUFFIX_PATTERN = /-\d{4}-\d{2}-\d{2}$/;

/**
 * Standard OpenAI Batch API Pricing (50% off standard rates)
 */
export const OPENAI_BATCH_PRICING: Record<string, ModelPricing> = {
    'gpt-4o-mini': {
        input: 0.075,
        output: 0.30,
    },
    'gpt-4o': {
        input: 1.25,
        output: 5.00,
    },
};

/**
 * Standard OpenAI Realtime/Sync API Pricing
 */
export const OPENAI_SYNC_PRICING: Record<string, ModelPricing> = {
    'gpt-4o-mini': {
        input: 0.15,
        output: 0.60,
    },
    'gpt-4o': {
        input: 2.50,
        output: 10.00,
    },
};

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
    const pricingMap = isBatch ? OPENAI_BATCH_PRICING : OPENAI_SYNC_PRICING;
    const resolvedModel = resolvePricingModel(model, pricingMap);
    const pricing = pricingMap[resolvedModel];

    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
}

function resolvePricingModel(
    model: string,
    pricingMap: Record<string, ModelPricing>,
): string {
    const trimmedModel = model.trim();
    if (trimmedModel in pricingMap) {
        return trimmedModel;
    }

    const normalizedSnapshotModel = trimmedModel.replace(SNAPSHOT_SUFFIX_PATTERN, '');
    if (normalizedSnapshotModel in pricingMap) {
        return normalizedSnapshotModel;
    }

    console.warn(
        `[AI Pricing] Unknown model "${trimmedModel || '(empty)'}", defaulting to ${DEFAULT_PRICING_MODEL}`,
    );
    return DEFAULT_PRICING_MODEL;
}
