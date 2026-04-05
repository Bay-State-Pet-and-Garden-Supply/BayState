import OpenAI from 'openai';
import type { LLMProvider } from '@/lib/ai-scraping/credentials';
import {
    getAIConsolidationRuntimeConfig,
    getDefaultModelForProvider,
} from '@/lib/ai-scraping/credentials';
import {
    getGeminiFeatureFlags,
    shouldUseGeminiTraffic,
} from '@/lib/config/gemini-feature-flags';
import { GeminiClientAdapter } from '@/lib/providers/gemini-client';

// We cache the client but only if the effective connection settings haven't changed.
let lastClientSignature: string | null = null;
let openaiClient: OpenAI | null = null;
let lastGeminiSignature: string | null = null;
let geminiClient: GeminiClientAdapter | null = null;

export interface ConsolidationRuntimeConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    completionWindow: '24h';
    llm_provider: LLMProvider;
    configured_llm_provider: LLMProvider;
    llm_base_url: string | null;
    llm_api_key: string | null;
    gemini_api_key: string | null;
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
    options: ConsolidationConfigOptions | undefined,
    flags: Awaited<ReturnType<typeof getGeminiFeatureFlags>>,
    hasGeminiKey: boolean
): LLMProvider {
    if (options?.forceProvider) {
        return options.forceProvider;
    }

    if (
        configuredProvider !== 'gemini'
        && hasGeminiKey
        && options?.routingKey
        && shouldUseGeminiTraffic(flags, options.routingKey)
    ) {
        return 'gemini';
    }

    if (configuredProvider === 'gemini' && !flags.GEMINI_BATCH_ENABLED) {
        return 'openai';
    }

    return configuredProvider;
}

/**
 * Get the OpenAI-compatible client instance for the current effective provider.
 * Returns null if Gemini is selected or the provider is not configured.
 */
export async function getOpenAIClient(options?: ConsolidationConfigOptions): Promise<OpenAI | null> {
    const runtimeConfig = await getConsolidationConfig(options);
    const baseURL = runtimeConfig.llm_provider === 'openai_compatible'
        ? runtimeConfig.llm_base_url ?? undefined
        : undefined;

    if (runtimeConfig.llm_provider === 'gemini') {
        return null;
    }

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
 * Get the Gemini client instance for the current effective provider.
 */
export async function getGeminiClient(
    options?: ConsolidationConfigOptions
): Promise<GeminiClientAdapter | null> {
    const runtimeConfig = await getConsolidationConfig(options);

    if (runtimeConfig.llm_provider !== 'gemini' || !runtimeConfig.llm_api_key) {
        return null;
    }

    const clientSignature = JSON.stringify({
        provider: runtimeConfig.llm_provider,
        apiKey: runtimeConfig.llm_api_key,
    });

    if (clientSignature !== lastGeminiSignature || !geminiClient) {
        lastGeminiSignature = clientSignature;
        geminiClient = new GeminiClientAdapter(runtimeConfig.llm_api_key);
    }

    return geminiClient;
}

/**
 * Check if an LLM provider is configured for consolidation.
 */
export async function isOpenAIConfigured(options?: ConsolidationConfigOptions): Promise<boolean> {
    const runtimeConfig = await getConsolidationConfig(options);
    if (runtimeConfig.llm_provider === 'gemini') {
        return !!runtimeConfig.llm_api_key;
    }

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
export async function getConsolidationConfig(
    options?: ConsolidationConfigOptions
): Promise<ConsolidationRuntimeConfig> {
    try {
        const [runtimeConfig, flags] = await Promise.all([
            getAIConsolidationRuntimeConfig(),
            getGeminiFeatureFlags(),
        ]);
        const effectiveProvider = resolveEffectiveProvider(
            runtimeConfig.llm_provider,
            options,
            flags,
            !!runtimeConfig.gemini_api_key
        );
        const model = effectiveProvider === runtimeConfig.llm_provider
            ? runtimeConfig.llm_model || CONSOLIDATION_CONFIG.model
            : getDefaultModelForProvider(effectiveProvider);
        const baseUrl = effectiveProvider === 'openai_compatible'
            ? runtimeConfig.openai_compatible_base_url ?? runtimeConfig.llm_base_url
            : null;
        const apiKey = effectiveProvider === 'gemini'
            ? runtimeConfig.gemini_api_key ?? runtimeConfig.llm_api_key
            : effectiveProvider === 'openai_compatible'
                ? runtimeConfig.openai_compatible_api_key ?? runtimeConfig.llm_api_key
                : runtimeConfig.openai_api_key ?? runtimeConfig.llm_api_key;

        return {
            ...CONSOLIDATION_CONFIG,
            model,
            llm_provider: effectiveProvider,
            configured_llm_provider: runtimeConfig.llm_provider,
            llm_base_url: baseUrl,
            llm_api_key: apiKey ?? null,
            gemini_api_key: runtimeConfig.gemini_api_key ?? null,
            llm_supports_batch_api:
                effectiveProvider === 'openai_compatible'
                    ? runtimeConfig.llm_supports_batch_api
                    : true,
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
            gemini_api_key: null,
            llm_supports_batch_api: true,
            confidence_threshold: 0.7,
            routing_key: options?.routingKey ?? null,
        };
    }
}
