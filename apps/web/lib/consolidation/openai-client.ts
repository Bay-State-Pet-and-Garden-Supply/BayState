/**
 * OpenAI Client Configuration
 *
 * Initializes and provides the OpenAI client for batch consolidation.
 * Prioritizes database-stored credentials (AI Scraping Settings) over environment variables.
 */

import OpenAI from 'openai';
import { getAIScrapingRuntimeCredentials, getAIConsolidationDefaults } from '@/lib/ai-scraping/credentials';

// We cache the client but only if the key hasn't changed.
let lastApiKey: string | null = null;
let openaiClient: OpenAI | null = null;

async function getOpenAIApiKey(): Promise<string | null> {
    // 1. Try database-stored credentials first (UI-set)
    try {
        const runtimeCredentials = await getAIScrapingRuntimeCredentials();
        if (runtimeCredentials?.openai_api_key && runtimeCredentials.openai_api_key.trim()) {
            return runtimeCredentials.openai_api_key.trim();
        }
    } catch (error) {
        console.error('[Consolidation] Failed to load runtime OpenAI credentials from DB:', error);
    }

    // 2. Fall back to environment variable
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
        return process.env.OPENAI_API_KEY.trim();
    }

    return null;
}

/**
 * Get the OpenAI client instance.
 * Returns null if API key is not configured.
 */
export async function getOpenAIClient(): Promise<OpenAI | null> {
    const apiKey = await getOpenAIApiKey();

    if (!apiKey) {
        console.error('[Consolidation] OpenAI API key not set in environment or runtime credentials');
        return null;
    }

    // If the key has changed or we don't have a client yet, create a new one
    if (apiKey !== lastApiKey || !openaiClient) {
        lastApiKey = apiKey;
        openaiClient = new OpenAI({ apiKey });
    }

    return openaiClient;
}

/**
 * Check if OpenAI is configured.
 */
export async function isOpenAIConfigured(): Promise<boolean> {
    const apiKey = await getOpenAIApiKey();
    return !!apiKey;
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
        const defaults = await getAIConsolidationDefaults();
        return {
            ...CONSOLIDATION_CONFIG,
            model: defaults.llm_model || CONSOLIDATION_CONFIG.model,
            confidence_threshold: defaults.confidence_threshold,
        };
    } catch (err) {
        console.error('[Consolidation] Failed to load config from DB, using hardcoded defaults:', err);
        return {
            ...CONSOLIDATION_CONFIG,
            confidence_threshold: 0.7,
        };
    }
}
