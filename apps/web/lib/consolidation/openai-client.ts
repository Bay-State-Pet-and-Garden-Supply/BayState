/**
 * OpenAI Client Configuration
 *
 * Initializes and provides the OpenAI client for batch consolidation.
 * Uses environment variable OPENAI_API_KEY.
 */

import OpenAI from 'openai';
import { getAIScrapingRuntimeCredentials } from '@/lib/ai-scraping/credentials';

let openaiClient: OpenAI | null = null;

async function getOpenAIApiKey(): Promise<string | null> {
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
        return process.env.OPENAI_API_KEY.trim();
    }

    try {
        const runtimeCredentials = await getAIScrapingRuntimeCredentials();
        if (runtimeCredentials?.openai_api_key && runtimeCredentials.openai_api_key.trim()) {
            return runtimeCredentials.openai_api_key.trim();
        }
    } catch (error) {
        console.error('[Consolidation] Failed to load runtime OpenAI credentials:', error);
    }

    return null;
}

/**
 * Get the OpenAI client instance.
 * Returns null if API key is not configured.
 */
export async function getOpenAIClient(): Promise<OpenAI | null> {
    if (openaiClient) {
        return openaiClient;
    }

    const apiKey = await getOpenAIApiKey();

    if (!apiKey) {
        console.error('[Consolidation] OpenAI API key not set in environment or runtime credentials');
        return null;
    }

    openaiClient = new OpenAI({ apiKey });
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
