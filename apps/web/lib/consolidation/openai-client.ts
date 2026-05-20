import OpenAI from 'openai';
import type { LLMProvider } from '@/lib/ai-scraping/credentials';
import {
    getAIConsolidationRuntimeConfig,
} from '@/lib/ai-scraping/credentials';
import { getDeepSeekOpenAICompatibleBaseURL } from '@/lib/ai-scraping/deepseek';
import { DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

// We cache the client but only if the effective connection settings haven't changed.
let lastClientSignature: string | null = null;
let openaiClient: OpenAI | null = null;

export interface ConsolidationRuntimeConfig {
    provider: LLMProvider;
    model: string;
    maxTokens: number;
    temperature: number;
    llm_base_url: string | null;
    llm_api_key: string | null;
    confidence_threshold: number;
    routing_key: string | null;
    llm_supports_batch_api: boolean;
    gemini_api_key?: string | null;
}

interface ConsolidationConfigOptions {
    routingKey?: string;
}

function resolveProviderModel(configuredModel: string): string {
    return configuredModel || CONSOLIDATION_CONFIG.model;
}

function resolveProviderBaseUrl(configuredBaseUrl: string | null): string | null {
    // Only apply DeepSeek URL normalization for DeepSeek-compatible providers
    return getDeepSeekOpenAICompatibleBaseURL(configuredBaseUrl);
}

/**
 * Get the OpenAI-compatible client instance for DeepSeek/OpenAI-compatible providers.
 * Returns null for Gemini provider.
 */
export async function getOpenAIClient(options?: ConsolidationConfigOptions): Promise<OpenAI | null> {
    const runtimeConfig = await getConsolidationConfig(options);
    if (runtimeConfig.provider === 'gemini') {
        return null; // Gemini uses its own client
    }
    if (!runtimeConfig.llm_api_key) {
        console.error('[Consolidation] LLM API key not set');
        return null;
    }

    const apiKey = runtimeConfig.llm_api_key?.replace(/[\r\n\x00-\x1F\x7F-\x9F]/g, '');
    if (!apiKey) {
        console.error('[Consolidation] LLM API key is empty after sanitization');
        return null;
    }
    const baseURL = runtimeConfig.llm_base_url || undefined;
    const clientSignature = JSON.stringify({ apiKey, baseURL });

    if (clientSignature !== lastClientSignature || !openaiClient) {
        lastClientSignature = clientSignature;
        openaiClient = new OpenAI({ apiKey, baseURL });
    }

    return openaiClient;
}

/**
 * Check if an LLM provider is configured for consolidation.
 */
export async function isOpenAIConfigured(): Promise<boolean> {
    const runtimeConfig = await getConsolidationConfig();
    return !!runtimeConfig.llm_api_key;
}

/**
 * Model configuration for consolidation.
 * These are defaults; use getConsolidationConfig() for runtime settings.
 */
export const CONSOLIDATION_CONFIG = {
    /** Model to use for consolidation */
    model: DEFAULT_AI_MODEL,
    /** Maximum tokens per response for normal chat models */
    maxTokens: 2048,
    /** Reasoner spends completion budget on reasoning before final JSON. */
    reasonerMaxTokens: 4096,
    /** Temperature for responses (low = more deterministic) */
    temperature: 0.1,
} as const;

function resolveMaxTokensForModel(model: string): number {
    return model === 'deepseek-reasoner'
        ? CONSOLIDATION_CONFIG.reasonerMaxTokens
        : CONSOLIDATION_CONFIG.maxTokens;
}

/**
 * Get runtime consolidation configuration, merging defaults with DB settings.
 */
export async function getConsolidationConfig(
    options?: ConsolidationConfigOptions
): Promise<ConsolidationRuntimeConfig> {
    try {
        const runtimeConfig = await getAIConsolidationRuntimeConfig();
        const provider = runtimeConfig.llm_provider;
        const model = resolveProviderModel(runtimeConfig.llm_model || CONSOLIDATION_CONFIG.model);

        // For Gemini, use the Gemini API key directly, no DeepSeek URL normalization
        if (provider === 'gemini') {
            return {
                provider: 'gemini',
                model: model || 'gemini-3.5-flash',
                maxTokens: CONSOLIDATION_CONFIG.maxTokens,
                temperature: CONSOLIDATION_CONFIG.temperature,
                llm_base_url: null,
                llm_api_key: runtimeConfig.llm_api_key ?? null,
                gemini_api_key: runtimeConfig.llm_api_key ?? null,
                confidence_threshold: runtimeConfig.confidence_threshold,
                routing_key: options?.routingKey ?? null,
                llm_supports_batch_api: true,
            };
        }

        // DeepSeek/OpenAI-compatible path
        const apiKey = runtimeConfig.deepseek_api_key ?? runtimeConfig.llm_api_key;
        const baseUrl = resolveProviderBaseUrl(runtimeConfig.llm_base_url);

        return {
            provider,
            model,
            maxTokens: resolveMaxTokensForModel(model),
            temperature: CONSOLIDATION_CONFIG.temperature,
            llm_base_url: baseUrl,
            llm_api_key: apiKey ?? null,
            gemini_api_key: null,
            confidence_threshold: runtimeConfig.confidence_threshold,
            routing_key: options?.routingKey ?? null,
            llm_supports_batch_api: runtimeConfig.llm_supports_batch_api,
        };
    } catch (err) {
        console.error('[Consolidation] Failed to load config from DB, using hardcoded defaults:', err);
        const baseUrl = getDeepSeekOpenAICompatibleBaseURL(null);
        return {
            provider: 'deepseek',
            model: CONSOLIDATION_CONFIG.model,
            maxTokens: resolveMaxTokensForModel(CONSOLIDATION_CONFIG.model),
            temperature: CONSOLIDATION_CONFIG.temperature,
            llm_base_url: baseUrl,
            llm_api_key: null,
            gemini_api_key: null,
            confidence_threshold: 0.7,
            routing_key: options?.routingKey ?? null,
            llm_supports_batch_api: false,
        };
    }
}
