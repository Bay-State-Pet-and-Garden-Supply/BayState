import OpenAI from 'openai';
import type { LLMProvider } from '@/lib/ai-scraping/credentials';
import {
    getAIConsolidationRuntimeConfig,
} from '@/lib/ai-scraping/credentials';
import { DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

// We cache the client but only if the effective connection settings haven't changed.
let lastClientSignature: string | null = null;
let openaiClient: OpenAI | null = null;

export interface ConsolidationRuntimeConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    completionWindow: '24h';
    llm_provider: LLMProvider;
    configured_llm_provider: LLMProvider;
    llm_base_url: string | null;
    llm_api_key: string | null;
    llm_supports_batch_api: boolean;
    confidence_threshold: number;
    routing_key: string | null;
}

interface ConsolidationConfigOptions {
    routingKey?: string;
    forceProvider?: LLMProvider;
}

function resolveEffectiveProvider(
    configuredProvider: LLMProvider,
    options: ConsolidationConfigOptions | undefined
): LLMProvider {
    void configuredProvider;
    void options;
    return 'openai';
}

/**
 * Get the OpenAI-compatible client instance for the current effective provider.
 */
export async function getOpenAIClient(options?: ConsolidationConfigOptions): Promise<OpenAI | null> {
    const runtimeConfig = await getConsolidationConfig(options);
    if (!runtimeConfig.llm_api_key) {
        console.error('[Consolidation] OpenAI API key not set in environment or runtime credentials');
        return null;
    }

    const apiKey = runtimeConfig.llm_api_key;
    const clientSignature = JSON.stringify({
        provider: runtimeConfig.llm_provider,
        apiKey,
    });

    if (clientSignature !== lastClientSignature || !openaiClient) {
        lastClientSignature = clientSignature;
        openaiClient = new OpenAI({ apiKey });
    }

    return openaiClient;
}

/**
 * Check if an LLM provider is configured for consolidation.
 */
export async function isOpenAIConfigured(options?: ConsolidationConfigOptions): Promise<boolean> {
    const runtimeConfig = await getConsolidationConfig(options);
    return !!runtimeConfig.llm_api_key;
}

/**
 * Model configuration for batch consolidation.
 * These are defaults; use getConsolidationConfig() for runtime settings.
 */
export const CONSOLIDATION_CONFIG = {
    /** Model to use for consolidation */
    model: DEFAULT_AI_MODEL,
    /** Maximum tokens per response */
    maxTokens: 1024,
    /** Temperature for responses (low = more deterministic) */
    temperature: 0.1,
    /** Batch completion window */
    completionWindow: '24h' as const,
} as const;

/**
 * Get runtime consolidation configuration, merging defaults with DB settings.
 */
export async function getConsolidationConfig(
    options?: ConsolidationConfigOptions
): Promise<ConsolidationRuntimeConfig> {
    try {
        const runtimeConfig = await getAIConsolidationRuntimeConfig();
        const effectiveProvider = resolveEffectiveProvider(
            runtimeConfig.llm_provider,
            options
        );
        const model = runtimeConfig.llm_model || CONSOLIDATION_CONFIG.model;
        const apiKey = runtimeConfig.openai_api_key ?? runtimeConfig.llm_api_key;

        return {
            ...CONSOLIDATION_CONFIG,
            model,
            llm_provider: effectiveProvider,
            configured_llm_provider: runtimeConfig.llm_provider,
            llm_base_url: null,
            llm_api_key: apiKey ?? null,
            llm_supports_batch_api: true,
            confidence_threshold: runtimeConfig.confidence_threshold,
            routing_key: options?.routingKey ?? null,
        };
    } catch (err) {
        console.error('[Consolidation] Failed to load config from DB, using hardcoded defaults:', err);
        return {
            ...CONSOLIDATION_CONFIG,
            llm_provider: 'openai' as const,
            configured_llm_provider: 'openai' as const,
            llm_base_url: null,
            llm_api_key: null,
            llm_supports_batch_api: true,
            confidence_threshold: 0.7,
            routing_key: options?.routingKey ?? null,
        };
    }
}
