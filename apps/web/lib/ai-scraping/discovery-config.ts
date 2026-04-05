import type { AIScrapingDefaults, LLMProvider } from '@/lib/ai-scraping/credentials';

export const DISCOVERY_CONFIG_KEYS = new Set([
  'product_name',
  'brand',
  'category',
  'max_search_results',
  'max_steps',
  'confidence_threshold',
  'llm_provider',
  'llm_model',
  'llm_base_url',
  'search_provider',
  'prefer_manufacturer',
  'fallback_to_static',
  'max_concurrency',
  'cache_enabled',
  'extraction_strategy',
]);

export const CRAWL4AI_CONFIG_KEYS = new Set([
  'extraction_strategy',
  'cache_enabled',
  'max_retries',
  'timeout',
]);

export function hasKnownConfigKeys(
  config: Record<string, unknown> | undefined,
  keys: Set<string>
): boolean {
  if (!config) {
    return false;
  }

  return Object.keys(config).some((key) => keys.has(key));
}

export function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeDiscoveryLLMProvider(): LLMProvider {
  return 'gemini';
}

function pickNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeDiscoveryConfig(
  config: Record<string, unknown>,
  defaults: Pick<
    AIScrapingDefaults,
    'max_search_results' | 'max_steps' | 'confidence_threshold' | 'llm_provider' | 'llm_model' | 'llm_base_url'
  >
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const key of ['product_name', 'brand', 'category'] as const) {
    const value = pickNonEmptyString(config[key]);
    if (value) {
      normalized[key] = value;
    }
  }

  if (typeof config.prefer_manufacturer === 'boolean') {
    normalized.prefer_manufacturer = config.prefer_manufacturer;
  }
  if (typeof config.fallback_to_static === 'boolean') {
    normalized.fallback_to_static = config.fallback_to_static;
  }
  if (typeof config.cache_enabled === 'boolean') {
    normalized.cache_enabled = config.cache_enabled;
  }

  normalized.max_search_results = pickNumber(config.max_search_results, defaults.max_search_results);
  normalized.max_steps = pickNumber(config.max_steps, defaults.max_steps);
  normalized.confidence_threshold = pickNumber(config.confidence_threshold, defaults.confidence_threshold);

  const llmProvider = normalizeDiscoveryLLMProvider(config.llm_provider, defaults.llm_provider);
  const llmModel = pickNonEmptyString(config.llm_model) ?? defaults.llm_model;
  const llmBaseUrl = null;

  normalized.llm_provider = llmProvider;
  normalized.llm_model = llmModel;
  if (llmBaseUrl) {
    normalized.llm_base_url = llmBaseUrl;
  }

  const searchProvider = pickNonEmptyString(config.search_provider);
  if (searchProvider && ['auto', 'serpapi', 'brave', 'gemini'].includes(searchProvider)) {
    normalized.search_provider = searchProvider;
  }

  const maxConcurrency = pickNumber(config.max_concurrency, NaN);
  if (Number.isFinite(maxConcurrency)) {
    normalized.max_concurrency = Math.max(1, Math.trunc(maxConcurrency));
  }

  const extractionStrategy = pickNonEmptyString(config.extraction_strategy);
  if (extractionStrategy) {
    normalized.extraction_strategy = extractionStrategy;
  }

  return normalized;
}
