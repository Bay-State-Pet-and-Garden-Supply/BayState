/**
 * LLM Client Configuration
 *
 * Initializes and provides the OpenAI-compatible client for product consolidation.
 * Supports both direct OpenAI access and self-hosted OpenAI-compatible endpoints.
 */

import OpenAI from 'openai';
import { getAIConsolidationRuntimeConfig } from '@/lib/ai-scraping/credentials';

// We cache the client but only if the effective connection settings haven't changed.
let lastClientSignature: string | null = null;
let openaiClient: OpenAI | null = null;

/**
 * Get the OpenAI-compatible client instance.
 * Returns null if the selected provider is not fully configured.
 */
export async function getOpenAIClient(): Promise<OpenAI | null> {
    const runtimeConfig = await getAIConsolidationRuntimeConfig();
    const baseURL = runtimeConfig.llm_provider === 'openai_compatible'
        ? runtimeConfig.llm_base_url ?? undefined
        : undefined;

    if (runtimeConfig.llm_provider === 'openai' && !runtimeConfig.llm_api_key) {
        console.error('[Consolidation] OpenAI API key not set in environment or runtime credentials');
        return null;
    }

    if (runtimeConfig.llm_provider === 'openai_compatible' && !baseURL) {
        console.error('[Consolidation] OpenAI-compatible base URL is not configured');
        return null;
    }

    const apiKey = runtimeConfig.llm_api_key || 'baystate-local';
    const clientSignature = JSON.stringify({
        provider: runtimeConfig.llm_provider,
        apiKey,
        baseURL: baseURL ?? null,
    });

    if (clientSignature !== lastClientSignature || !openaiClient) {
        lastClientSignature = clientSignature;
        openaiClient = new OpenAI({
            apiKey,
            ...(baseURL ? { baseURL } : {}),
        });
    }

    return openaiClient;
}

/**
 * Check if an LLM provider is configured for consolidation.
 */
export async function isOpenAIConfigured(): Promise<boolean> {
    const runtimeConfig = await getAIConsolidationRuntimeConfig();
    if (runtimeConfig.llm_provider === 'openai') {
        return !!runtimeConfig.llm_api_key;
    }

    return !!runtimeConfig.llm_base_url;
}

/**
 * Model configuration for batch consolidation.
 * These are defaults; use getConsolidationConfig() for runtime settings.
 */
export const CONSOLIDATION_CONFIG = {
    /** Model to use for consolidation */
    model: 'gpt-4o-mini',
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
export async function getConsolidationConfig() {
    try {
        const runtimeConfig = await getAIConsolidationRuntimeConfig();
        return {
            ...CONSOLIDATION_CONFIG,
            model: runtimeConfig.llm_model || CONSOLIDATION_CONFIG.model,
            llm_provider: runtimeConfig.llm_provider,
            llm_base_url: runtimeConfig.llm_base_url,
            llm_supports_batch_api: runtimeConfig.llm_supports_batch_api,
            confidence_threshold: runtimeConfig.confidence_threshold,
        };
    } catch (err) {
        console.error('[Consolidation] Failed to load config from DB, using hardcoded defaults:', err);
        return {
            ...CONSOLIDATION_CONFIG,
            llm_provider: 'openai' as const,
            llm_base_url: null,
            llm_supports_batch_api: true,
            confidence_threshold: 0.7,
        };
    }
}
