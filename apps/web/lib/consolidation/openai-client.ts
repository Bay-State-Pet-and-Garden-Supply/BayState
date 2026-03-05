/**
 * OpenAI Client Configuration
 *
 * Initializes and provides the OpenAI client for batch consolidation.
 * Uses environment variable OPENAI_API_KEY.
 */

import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

/**
 * Get the OpenAI client instance.
 * Returns null if OPENAI_API_KEY is not configured.
 */
export function getOpenAIClient(): OpenAI | null {
    if (openaiClient) {
        return openaiClient;
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('[Consolidation] OPENAI_API_KEY not set in environment');
        return null;
    }

    openaiClient = new OpenAI({ apiKey });
    return openaiClient;
}

/**
 * Check if OpenAI is configured.
 */
export function isOpenAIConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
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
