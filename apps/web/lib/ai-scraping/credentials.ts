import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AIProvider = 'openai' | 'openai_compatible' | 'gemini' | 'serpapi' | 'brave';
export type LLMProvider = 'openai' | 'openai_compatible' | 'gemini';

interface BaseLLMDefaults {
  llm_provider: LLMProvider;
  llm_model: string;
  llm_base_url: string | null;
}

export interface AIScrapingDefaults extends BaseLLMDefaults {
  max_search_results: number;
  max_steps: number;
  confidence_threshold: number;
}

export interface AIConsolidationDefaults extends BaseLLMDefaults {
  confidence_threshold: number;
  llm_supports_batch_api: boolean;
}

export interface AICredentialStatus {
  provider: AIProvider;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

export interface AIScrapingRuntimeCredentials {
  llm_provider: LLMProvider;
  llm_model: string;
  llm_base_url?: string;
  llm_api_key?: string;
  openai_api_key?: string;
  openai_compatible_api_key?: string;
  gemini_api_key?: string;
  serpapi_api_key?: string;
  brave_api_key?: string;
}

export interface AIConsolidationRuntimeConfig {
  llm_provider: LLMProvider;
  llm_model: string;
  llm_base_url: string | null;
  llm_api_key: string | null;
  openai_api_key?: string;
  openai_compatible_api_key?: string;
  openai_compatible_base_url?: string | null;
  gemini_api_key?: string;
  confidence_threshold: number;
  llm_supports_batch_api: boolean;
}

const AI_DEFAULTS_SETTINGS_KEY = 'ai_scraping_defaults';
const AI_CONSOLIDATION_DEFAULTS_SETTINGS_KEY = 'ai_consolidation_defaults';
const ENCRYPTION_KEY_ENV_NAME = 'AI_CREDENTIALS_ENCRYPTION_KEY';
const OPENAI_COMPATIBLE_API_KEY_ENV_NAME = 'OPENAI_COMPATIBLE_API_KEY';
const OPENAI_COMPATIBLE_BASE_URL_ENV_NAME = 'OPENAI_COMPATIBLE_BASE_URL';
const GEMINI_API_KEY_ENV_NAME = 'GEMINI_API_KEY';
const ENCRYPTION_KEY_HELP =
  'Set AI_CREDENTIALS_ENCRYPTION_KEY to a 32-byte UTF-8 string or base64-encoded 32-byte key (example: `openssl rand -base64 32`).';

let hasLoggedMissingEncryptionKey = false;
let hasLoggedInvalidEncryptionKeyLength = false;
const loggedDecryptFailures = new Set<AIProvider>();

const DEFAULT_AI_SCRAPING_DEFAULTS: AIScrapingDefaults = {
  llm_provider: 'openai',
  llm_model: 'gpt-4o-mini',
  llm_base_url: null,
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

const DEFAULT_AI_CONSOLIDATION_DEFAULTS: AIConsolidationDefaults = {
  llm_provider: 'openai',
  llm_model: 'gpt-4o-mini',
  llm_base_url: null,
  confidence_threshold: 0.7,
  llm_supports_batch_api: true,
};

export function getDefaultModelForProvider(provider: LLMProvider): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'openai_compatible':
      return 'google/gemma-3-12b-it';
    case 'openai':
    default:
      return 'gpt-4o-mini';
  }
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function resolveEncryptionKey(required: boolean): Buffer | null {
  const raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) {
    if (!hasLoggedMissingEncryptionKey) {
      console.error(`[Scraper API] ${ENCRYPTION_KEY_ENV_NAME} is missing or empty. ${ENCRYPTION_KEY_HELP}`);
      hasLoggedMissingEncryptionKey = true;
    }
    if (required) {
      throw new Error(`${ENCRYPTION_KEY_ENV_NAME} is not configured. ${ENCRYPTION_KEY_HELP}`);
    }
    return null;
  }

  const trimmed = raw.trim();
  let keyBuffer: Buffer;

  const maybeBase64 = Buffer.from(trimmed, 'base64');
  if (maybeBase64.length === 32 && maybeBase64.toString('base64').replace(/=+$/, '') === trimmed.replace(/=+$/, '')) {
    keyBuffer = maybeBase64;
  } else {
    keyBuffer = Buffer.from(trimmed, 'utf8');
  }

  if (keyBuffer.length !== 32) {
    if (!hasLoggedInvalidEncryptionKeyLength) {
      console.error(`[Scraper API] ${ENCRYPTION_KEY_ENV_NAME} length is invalid: ${keyBuffer.length} bytes (expected 32). ${ENCRYPTION_KEY_HELP}`);
      hasLoggedInvalidEncryptionKeyLength = true;
    }
    if (required) {
      throw new Error(`${ENCRYPTION_KEY_ENV_NAME} must be 32 bytes (utf8) or base64-encoded 32 bytes. ${ENCRYPTION_KEY_HELP}`);
    }
    return null;
  }

  return keyBuffer;
}

export function encryptSecret(secret: string): { encryptedValue: string; iv: string; authTag: string } {
  const key = resolveEncryptionKey(true);
  if (!key) {
    throw new Error('Encryption key unavailable');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(payload: { encryptedValue: string; iv: string; authTag: string }): string {
  const key = resolveEncryptionKey(true);
  if (!key) {
    throw new Error('Encryption key unavailable');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedValue, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isEncryptionKeyMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('unable to authenticate data')
    || message.includes('unsupported state')
    || message.includes('authentication tag')
  );
}

function logDecryptFailure(provider: AIProvider, error: unknown): void {
  if (loggedDecryptFailures.has(provider)) {
    return;
  }

  loggedDecryptFailures.add(provider);

  if (isEncryptionKeyMismatchError(error)) {
    console.error(
      `[Scraper API] Failed to decrypt ${provider} secret. Stored credential was likely encrypted with a different ${ENCRYPTION_KEY_ENV_NAME}. Re-save the ${provider} API key in Admin -> AI Scraping Credentials to re-encrypt it with the current key.`
    );
    return;
  }

  console.error(`[Scraper API] Failed to decrypt ${provider} secret: ${getErrorMessage(error)}`);
}

function normalizeLLMProvider(value: unknown): LLMProvider {
  if (value === 'openai_compatible' || value === 'gemini') {
    return value;
  }
  return 'openai';
}

function normalizeLLMModel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeLLMBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

function resolveOpenAICompatibleBaseUrl(baseUrl: string | null | undefined): string | null {
  if (baseUrl && baseUrl.trim()) {
    return normalizeLLMBaseUrl(baseUrl);
  }

  const envBaseUrl = process.env[OPENAI_COMPATIBLE_BASE_URL_ENV_NAME];
  return normalizeLLMBaseUrl(envBaseUrl);
}

function resolveOpenAIApiKey(apiKey: string | null | undefined): string | null {
  if (apiKey && apiKey.trim()) {
    return apiKey.trim();
  }

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }

  return null;
}

function resolveOpenAICompatibleApiKey(apiKey: string | null | undefined): string | null {
  if (apiKey && apiKey.trim()) {
    return apiKey.trim();
  }

  const envApiKey = process.env[OPENAI_COMPATIBLE_API_KEY_ENV_NAME];
  if (envApiKey && envApiKey.trim()) {
    return envApiKey.trim();
  }

  return null;
}

function resolveGeminiApiKey(apiKey: string | null | undefined): string | null {
  if (apiKey && apiKey.trim()) {
    return apiKey.trim();
  }

  const envApiKey = process.env[GEMINI_API_KEY_ENV_NAME];
  if (envApiKey && envApiKey.trim()) {
    return envApiKey.trim();
  }

  return null;
}

function normalizeDefaults(raw: unknown): AIScrapingDefaults {
  const value = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};

  const llmProvider = normalizeLLMProvider(value.llm_provider);
  const llmModel = normalizeLLMModel(value.llm_model, getDefaultModelForProvider(llmProvider));
  const llmBaseUrl = llmProvider === 'openai_compatible'
    ? resolveOpenAICompatibleBaseUrl(normalizeLLMBaseUrl(value.llm_base_url))
    : null;
  const maxSearchResults = Number.isFinite(value.max_search_results) ? Number(value.max_search_results) : DEFAULT_AI_SCRAPING_DEFAULTS.max_search_results;
  const maxSteps = Number.isFinite(value.max_steps) ? Number(value.max_steps) : DEFAULT_AI_SCRAPING_DEFAULTS.max_steps;
  const confidenceThreshold = Number.isFinite(value.confidence_threshold)
    ? Number(value.confidence_threshold)
    : DEFAULT_AI_SCRAPING_DEFAULTS.confidence_threshold;

  return {
    llm_provider: llmProvider,
    llm_model: llmModel,
    llm_base_url: llmBaseUrl,
    max_search_results: Math.min(10, Math.max(1, Math.trunc(maxSearchResults))),
    max_steps: Math.min(50, Math.max(1, Math.trunc(maxSteps))),
    confidence_threshold: Math.min(1, Math.max(0, confidenceThreshold)),
  };
}

export async function getAIScrapingDefaults(): Promise<AIScrapingDefaults> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', AI_DEFAULTS_SETTINGS_KEY)
    .single();

  if (error || !data) {
    return DEFAULT_AI_SCRAPING_DEFAULTS;
  }

  return normalizeDefaults(data.value);
}

export async function upsertAIScrapingDefaults(partial: Partial<AIScrapingDefaults>): Promise<AIScrapingDefaults> {
  const admin = getSupabaseAdmin();
  const current = await getAIScrapingDefaults();
  const merged = { ...current, ...partial };
  if (partial.llm_provider && partial.llm_model === undefined) {
    merged.llm_model = getDefaultModelForProvider(partial.llm_provider);
  }
  if (partial.llm_provider && partial.llm_provider !== 'openai_compatible' && partial.llm_base_url === undefined) {
    merged.llm_base_url = null;
  }
  const next = normalizeDefaults(merged);

  const { error } = await admin
    .from('site_settings')
    .upsert(
      {
        key: AI_DEFAULTS_SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    throw new Error(`Failed to save AI scraping defaults: ${error.message}`);
  }

  return next;
}

function normalizeConsolidationDefaults(raw: unknown): AIConsolidationDefaults {
  const value = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};

  const llmProvider = normalizeLLMProvider(value.llm_provider);
  const llmModel = normalizeLLMModel(value.llm_model, getDefaultModelForProvider(llmProvider));
  const llmBaseUrl = llmProvider === 'openai_compatible'
    ? resolveOpenAICompatibleBaseUrl(normalizeLLMBaseUrl(value.llm_base_url))
    : null;
  const confidenceThreshold = Number.isFinite(value.confidence_threshold)
    ? Number(value.confidence_threshold)
    : DEFAULT_AI_CONSOLIDATION_DEFAULTS.confidence_threshold;
  const llmSupportsBatchApi = llmProvider === 'openai' || llmProvider === 'gemini'
    ? true
    : typeof value.llm_supports_batch_api === 'boolean'
      ? value.llm_supports_batch_api
      : DEFAULT_AI_CONSOLIDATION_DEFAULTS.llm_supports_batch_api;

  return {
    llm_provider: llmProvider,
    llm_model: llmModel,
    llm_base_url: llmBaseUrl,
    confidence_threshold: Math.min(1, Math.max(0, confidenceThreshold)),
    llm_supports_batch_api: llmSupportsBatchApi,
  };
}

export async function getAIConsolidationDefaults(): Promise<AIConsolidationDefaults> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', AI_CONSOLIDATION_DEFAULTS_SETTINGS_KEY)
    .single();

  if (error || !data) {
    return DEFAULT_AI_CONSOLIDATION_DEFAULTS;
  }

  return normalizeConsolidationDefaults(data.value);
}

export async function upsertAIConsolidationDefaults(partial: Partial<AIConsolidationDefaults>): Promise<AIConsolidationDefaults> {
  const admin = getSupabaseAdmin();
  const current = await getAIConsolidationDefaults();
  const merged = { ...current, ...partial };
  if (partial.llm_provider && partial.llm_model === undefined) {
    merged.llm_model = getDefaultModelForProvider(partial.llm_provider);
  }
  if (partial.llm_provider && partial.llm_provider !== 'openai_compatible' && partial.llm_base_url === undefined) {
    merged.llm_base_url = null;
  }
  const next = normalizeConsolidationDefaults(merged);

  const { error } = await admin
    .from('site_settings')
    .upsert(
      {
        key: AI_CONSOLIDATION_DEFAULTS_SETTINGS_KEY,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    throw new Error(`Failed to save AI consolidation defaults: ${error.message}`);
  }

  return next;
}

export async function setAIScrapingProviderSecret(
  provider: AIProvider,
  secret: string,
  updatedBy: string | null
): Promise<void> {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error(`${provider} API key cannot be empty`);
  }

  const encrypted = encryptSecret(trimmed);
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from('ai_provider_credentials')
    .upsert(
      {
        provider,
        encrypted_value: encrypted.encryptedValue,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        last4: trimmed.slice(-4),
        key_version: 1,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: 'provider' }
    );

  if (error) {
    throw new Error(`Failed to store ${provider} API key: ${error.message}`);
  }
}

export async function getAIScrapingCredentialStatuses(): Promise<Record<AIProvider, AICredentialStatus>> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('ai_provider_credentials')
    .select('provider, last4, updated_at');

  if (error) {
    throw new Error(`Failed to fetch AI credential statuses: ${error.message}`);
  }

  const statuses: Record<AIProvider, AICredentialStatus> = {
    openai: { provider: 'openai', configured: false, last4: null, updated_at: null },
    openai_compatible: { provider: 'openai_compatible', configured: false, last4: null, updated_at: null },
    gemini: { provider: 'gemini', configured: false, last4: null, updated_at: null },
    serpapi: { provider: 'serpapi', configured: false, last4: null, updated_at: null },
    brave: { provider: 'brave', configured: false, last4: null, updated_at: null },
  };

  for (const row of data || []) {
    const provider = row.provider as AIProvider;
    if (
      provider !== 'openai'
      && provider !== 'openai_compatible'
      && provider !== 'gemini'
      && provider !== 'serpapi'
      && provider !== 'brave'
    ) {
      continue;
    }
    statuses[provider] = {
      provider,
      configured: true,
      last4: (row.last4 as string | null) ?? null,
      updated_at: (row.updated_at as string | null) ?? null,
    };
  }

  return statuses;
}

async function getAIScrapingProviderSecret(provider: AIProvider): Promise<string | null> {
  const key = resolveEncryptionKey(false);
  if (!key) {
    return null;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('ai_provider_credentials')
    .select('encrypted_value, iv, auth_tag')
    .eq('provider', provider)
    .single();

  if (error || !data) {
    console.error(`[Scraper API] Failed to fetch encrypted ${provider} secret:`, error || 'No data');
    return null;
  }

  try {
    return decryptSecret({
      encryptedValue: data.encrypted_value as string,
      iv: data.iv as string,
      authTag: data.auth_tag as string,
    });
  } catch (err) {
    logDecryptFailure(provider, err);
    return null;
  }
}

export async function getAIScrapingRuntimeCredentials(): Promise<AIScrapingRuntimeCredentials> {
  const [defaults, openai, openaiCompatible, gemini, serpapi, brave] = await Promise.all([
    getAIScrapingDefaults(),
    getAIScrapingProviderSecret('openai'),
    getAIScrapingProviderSecret('openai_compatible'),
    getAIScrapingProviderSecret('gemini'),
    getAIScrapingProviderSecret('serpapi'),
    getAIScrapingProviderSecret('brave'),
  ]);

  const resolvedOpenAI = resolveOpenAIApiKey(openai);
  const resolvedOpenAICompatible = resolveOpenAICompatibleApiKey(openaiCompatible);
  const resolvedGemini = resolveGeminiApiKey(gemini);
  const llmBaseUrl = defaults.llm_provider === 'openai_compatible'
    ? resolveOpenAICompatibleBaseUrl(defaults.llm_base_url)
    : null;
  let llmApiKey: string | null = null;
  switch (defaults.llm_provider) {
    case 'gemini':
      llmApiKey = resolvedGemini;
      break;
    case 'openai_compatible':
      llmApiKey = resolvedOpenAICompatible;
      break;
    case 'openai':
    default:
      llmApiKey = resolvedOpenAI;
      break;
  }

  const credentials: AIScrapingRuntimeCredentials = {
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model,
  };

  if (llmBaseUrl) {
    credentials.llm_base_url = llmBaseUrl;
  }
  if (llmApiKey) {
    credentials.llm_api_key = llmApiKey;
  }
  if (resolvedOpenAI) {
    credentials.openai_api_key = resolvedOpenAI;
  }
  if (resolvedOpenAICompatible) {
    credentials.openai_compatible_api_key = resolvedOpenAICompatible;
  }
  if (resolvedGemini) {
    credentials.gemini_api_key = resolvedGemini;
  }
  if (serpapi) {
    credentials.serpapi_api_key = serpapi;
  }
  if (brave) {
    credentials.brave_api_key = brave;
  }

  return credentials;
}

export async function getAIConsolidationRuntimeConfig(): Promise<AIConsolidationRuntimeConfig> {
  const [defaults, openai, openaiCompatible, gemini] = await Promise.all([
    getAIConsolidationDefaults(),
    getAIScrapingProviderSecret('openai'),
    getAIScrapingProviderSecret('openai_compatible'),
    getAIScrapingProviderSecret('gemini'),
  ]);

  const resolvedOpenAI = resolveOpenAIApiKey(openai);
  const resolvedOpenAICompatible = resolveOpenAICompatibleApiKey(openaiCompatible);
  const resolvedGemini = resolveGeminiApiKey(gemini);

  let llmApiKey: string | null = null;
  switch (defaults.llm_provider) {
    case 'gemini':
      llmApiKey = resolvedGemini;
      break;
    case 'openai_compatible':
      llmApiKey = resolvedOpenAICompatible;
      break;
    case 'openai':
    default:
      llmApiKey = resolvedOpenAI;
      break;
  }

  return {
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model,
    llm_base_url: defaults.llm_provider === 'openai_compatible'
      ? resolveOpenAICompatibleBaseUrl(defaults.llm_base_url)
      : null,
    llm_api_key: llmApiKey,
    ...(resolvedOpenAI ? { openai_api_key: resolvedOpenAI } : {}),
    ...(resolvedOpenAICompatible ? { openai_compatible_api_key: resolvedOpenAICompatible } : {}),
    ...(resolvedOpenAICompatible || defaults.llm_provider === 'openai_compatible'
      ? {
        openai_compatible_base_url: resolveOpenAICompatibleBaseUrl(defaults.llm_base_url),
      }
      : {}),
    ...(resolvedGemini ? { gemini_api_key: resolvedGemini } : {}),
    confidence_threshold: defaults.confidence_threshold,
    llm_supports_batch_api: defaults.llm_supports_batch_api,
  };
}
