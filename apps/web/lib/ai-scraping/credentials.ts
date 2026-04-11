import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

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
  serper_api_key?: string;
  serpapi_api_key?: string;
}

export interface AIConsolidationRuntimeConfig {
  llm_provider: LLMProvider;
  llm_model: string;
  llm_base_url: string | null;
  llm_api_key: string | null;
  openai_api_key?: string;
  confidence_threshold: number;
  llm_supports_batch_api: boolean;
}

const AI_DEFAULTS_SETTINGS_KEY = 'ai_scraping_defaults';
const AI_CONSOLIDATION_DEFAULTS_SETTINGS_KEY = 'ai_consolidation_defaults';
const AI_PROVIDER_COMPAT_SETTINGS_KEY_PREFIX = 'ai_provider_credentials_compat_';
const ENCRYPTION_KEY_ENV_NAME = 'AI_CREDENTIALS_ENCRYPTION_KEY';
const SITE_SETTINGS_COMPATIBLE_PROVIDERS = ['gemini', 'openai_compatible'] as const;
const ENCRYPTION_KEY_HELP =
  'Set AI_CREDENTIALS_ENCRYPTION_KEY to a 32-byte UTF-8 string or base64-encoded 32-byte key (example: `openssl rand -base64 32`).';

let hasLoggedMissingEncryptionKey = false;
let hasLoggedInvalidEncryptionKeyLength = false;
const loggedDecryptFailures = new Set<AIProvider>();

const DEFAULT_AI_SCRAPING_DEFAULTS: AIScrapingDefaults = {
  llm_provider: 'openai',
  llm_model: DEFAULT_AI_MODEL,
  llm_base_url: null,
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

const DEFAULT_AI_CONSOLIDATION_DEFAULTS: AIConsolidationDefaults = {
  llm_provider: 'openai',
  llm_model: DEFAULT_AI_MODEL,
  llm_base_url: null,
  confidence_threshold: 0.7,
  llm_supports_batch_api: true,
};

export function getDefaultModelForProvider(provider: LLMProvider): string {
  void provider;
  return DEFAULT_AI_MODEL;
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
  if (error && typeof error === 'object') {
    const message = 'message' in error ? error.message : null;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    const details = 'details' in error ? error.details : null;
    if (typeof details === 'string' && details.trim()) {
      return details;
    }
  }
  return String(error);
}

interface StoredProviderSecretRecord {
  encryptedValue: string;
  iv: string;
  authTag: string;
  last4: string | null;
  updatedAt: string | null;
}

function usesSiteSettingsProviderCompat(provider: AIProvider): provider is typeof SITE_SETTINGS_COMPATIBLE_PROVIDERS[number] {
  return provider === 'gemini' || provider === 'openai_compatible';
}

function getProviderCompatSettingKey(provider: typeof SITE_SETTINGS_COMPATIBLE_PROVIDERS[number]): string {
  return `${AI_PROVIDER_COMPAT_SETTINGS_KEY_PREFIX}${provider}`;
}

function isProviderConstraintError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('ai_provider_credentials_provider_check')
    || message.includes('violates check constraint');
}

function toStoredProviderSecretRecord(
  raw: unknown,
  updatedAtFallback: string | null = null
): StoredProviderSecretRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Record<string, unknown>;
  if (
    typeof value.encrypted_value !== 'string'
    || typeof value.iv !== 'string'
    || typeof value.auth_tag !== 'string'
  ) {
    return null;
  }

  return {
    encryptedValue: value.encrypted_value,
    iv: value.iv,
    authTag: value.auth_tag,
    last4: typeof value.last4 === 'string' ? value.last4 : null,
    updatedAt:
      typeof value.updated_at === 'string'
        ? value.updated_at
        : updatedAtFallback,
  };
}

async function upsertProviderSecretCompatSetting(
  admin: SupabaseClient,
  provider: typeof SITE_SETTINGS_COMPATIBLE_PROVIDERS[number],
  record: StoredProviderSecretRecord
): Promise<void> {
  const settingKey = getProviderCompatSettingKey(provider);
  const { error } = await admin
    .from('site_settings')
    .upsert(
      {
        key: settingKey,
        value: {
          provider,
          encrypted_value: record.encryptedValue,
          iv: record.iv,
          auth_tag: record.authTag,
          key_version: 1,
          last4: record.last4,
          updated_at: record.updatedAt,
        },
        updated_at: record.updatedAt,
      },
      { onConflict: 'key' }
    );

  if (error) {
    throw new Error(`Failed to store ${provider} API key compatibility fallback: ${getErrorMessage(error)}`);
  }
}

async function getPrimaryProviderSecretRecord(
  admin: SupabaseClient,
  provider: AIProvider
): Promise<StoredProviderSecretRecord | null> {
  const { data, error } = await admin
    .from('ai_provider_credentials')
    .select('encrypted_value, iv, auth_tag, last4, updated_at')
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    console.error(`[Scraper API] Failed to fetch encrypted ${provider} secret:`, error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    encryptedValue: data.encrypted_value as string,
    iv: data.iv as string,
    authTag: data.auth_tag as string,
    last4: (data.last4 as string | null) ?? null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

async function getCompatProviderSecretRecord(
  admin: SupabaseClient,
  provider: typeof SITE_SETTINGS_COMPATIBLE_PROVIDERS[number]
): Promise<StoredProviderSecretRecord | null> {
  const { data, error } = await admin
    .from('site_settings')
    .select('value, updated_at')
    .eq('key', getProviderCompatSettingKey(provider))
    .maybeSingle();

  if (error) {
    console.error(`[Scraper API] Failed to fetch ${provider} compatibility credential:`, error);
    return null;
  }

  if (!data) {
    return null;
  }

  return toStoredProviderSecretRecord(data.value, (data.updated_at as string | null) ?? null);
}

async function getCompatProviderSecretStatuses(
  admin: SupabaseClient
): Promise<Partial<Record<typeof SITE_SETTINGS_COMPATIBLE_PROVIDERS[number], StoredProviderSecretRecord>>> {
  const keys = SITE_SETTINGS_COMPATIBLE_PROVIDERS.map((provider) => getProviderCompatSettingKey(provider));
  const { data, error } = await admin
    .from('site_settings')
    .select('key, value, updated_at')
    .in('key', keys);

  if (error) {
    throw new Error(`Failed to fetch compatibility AI credential statuses: ${getErrorMessage(error)}`);
  }

  const records: Partial<Record<typeof SITE_SETTINGS_COMPATIBLE_PROVIDERS[number], StoredProviderSecretRecord>> = {};
  for (const row of data || []) {
    const provider = SITE_SETTINGS_COMPATIBLE_PROVIDERS.find(
      (candidate) => getProviderCompatSettingKey(candidate) === row.key
    );
    if (!provider) {
      continue;
    }

    const record = toStoredProviderSecretRecord(row.value, (row.updated_at as string | null) ?? null);
    if (record) {
      records[provider] = record;
    }
  }

  return records;
}

function decryptStoredProviderSecret(
  provider: AIProvider,
  record: StoredProviderSecretRecord | null
): string | null {
  if (!record) {
    return null;
  }

  try {
    return decryptSecret({
      encryptedValue: record.encryptedValue,
      iv: record.iv,
      authTag: record.authTag,
    });
  } catch (error) {
    logDecryptFailure(provider, error);
    return null;
  }
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

function normalizeLLMProvider(_provider?: unknown): LLMProvider {
  void _provider;
  return 'openai';
}

function normalizeLLMModel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOpenAIModel(value: unknown, fallback: string): string {
  const model = normalizeLLMModel(value, fallback);
  const lowered = model.toLowerCase();
  return lowered.startsWith('gpt-') || lowered.startsWith('o1') || lowered.startsWith('o3') || lowered.startsWith('o4')
    ? model
    : fallback;
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

function normalizeDefaults(raw: unknown): AIScrapingDefaults {
  const value = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};

  const llmProvider = normalizeLLMProvider(value.llm_provider);
  const llmModel = normalizeOpenAIModel(value.llm_model, getDefaultModelForProvider(llmProvider));
  const llmBaseUrl = null;
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
  const merged = { ...current, ...partial, llm_base_url: null };
  if (partial.llm_provider && partial.llm_model === undefined) {
    merged.llm_model = getDefaultModelForProvider(partial.llm_provider);
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
  const llmModel = normalizeOpenAIModel(value.llm_model, getDefaultModelForProvider(llmProvider));
  const llmBaseUrl = null;
  const confidenceThreshold = Number.isFinite(value.confidence_threshold)
    ? Number(value.confidence_threshold)
    : DEFAULT_AI_CONSOLIDATION_DEFAULTS.confidence_threshold;
  const llmSupportsBatchApi = true;

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
  const merged = { ...current, ...partial, llm_base_url: null };
  if (partial.llm_provider && partial.llm_model === undefined) {
    merged.llm_model = getDefaultModelForProvider(partial.llm_provider);
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
  const nowIso = new Date().toISOString();
  const record: StoredProviderSecretRecord = {
    encryptedValue: encrypted.encryptedValue,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    last4: trimmed.slice(-4),
    updatedAt: nowIso,
  };

  const { error } = await admin
    .from('ai_provider_credentials')
    .upsert(
      {
        provider,
        encrypted_value: record.encryptedValue,
        iv: record.iv,
        auth_tag: record.authTag,
        last4: record.last4,
        key_version: 1,
        updated_at: nowIso,
        updated_by: updatedBy,
      },
      { onConflict: 'provider' }
    );

  if (error) {
    if (usesSiteSettingsProviderCompat(provider) && isProviderConstraintError(error)) {
      await upsertProviderSecretCompatSetting(admin, provider, record);
      console.warn(
        `[Scraper API] Stored ${provider} API key in site_settings compatibility storage because ai_provider_credentials has not been migrated to accept that provider yet.`
      );
      return;
    }

    throw new Error(`Failed to store ${provider} API key: ${getErrorMessage(error)}`);
  }
}

export async function getAIScrapingCredentialStatuses(): Promise<Record<AIProvider, AICredentialStatus>> {
  const admin = getSupabaseAdmin();
  const [{ data, error }, compatRecords] = await Promise.all([
    admin
      .from('ai_provider_credentials')
      .select('provider, last4, updated_at'),
    getCompatProviderSecretStatuses(admin),
  ]);

  if (error) {
    throw new Error(`Failed to fetch AI credential statuses: ${getErrorMessage(error)}`);
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

  for (const provider of SITE_SETTINGS_COMPATIBLE_PROVIDERS) {
    if (statuses[provider].configured) {
      continue;
    }

    const record = compatRecords[provider];
    if (!record) {
      continue;
    }

    statuses[provider] = {
      provider,
      configured: true,
      last4: record.last4,
      updated_at: record.updatedAt,
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
  const directSecret = decryptStoredProviderSecret(
    provider,
    await getPrimaryProviderSecretRecord(admin, provider)
  );
  if (directSecret) {
    return directSecret;
  }

  if (!usesSiteSettingsProviderCompat(provider)) {
    return null;
  }

  return decryptStoredProviderSecret(
    provider,
    await getCompatProviderSecretRecord(admin, provider)
  );
}

export async function getAIScrapingRuntimeCredentials(): Promise<AIScrapingRuntimeCredentials> {
  const [defaults, openai, legacySearchKey] = await Promise.all([
    getAIScrapingDefaults(),
    getAIScrapingProviderSecret('openai'),
    getAIScrapingProviderSecret('serpapi'),
  ]);

  const resolvedOpenAI = resolveOpenAIApiKey(openai);
  const llmApiKey = resolvedOpenAI;

  const credentials: AIScrapingRuntimeCredentials = {
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model,
  };

  if (llmApiKey) {
    credentials.llm_api_key = llmApiKey;
  }
  if (resolvedOpenAI) {
    credentials.openai_api_key = resolvedOpenAI;
  }
  if (legacySearchKey) {
    credentials.serper_api_key = legacySearchKey;
    credentials.serpapi_api_key = legacySearchKey;
  }

  return credentials;
}

export async function getAIConsolidationRuntimeConfig(): Promise<AIConsolidationRuntimeConfig> {
  const [defaults, openai] = await Promise.all([
    getAIConsolidationDefaults(),
    getAIScrapingProviderSecret('openai'),
  ]);

  const resolvedOpenAI = resolveOpenAIApiKey(openai);
  const llmApiKey = resolvedOpenAI;

  return {
    llm_provider: defaults.llm_provider,
    llm_model: defaults.llm_model,
    llm_base_url: null,
    llm_api_key: llmApiKey,
    ...(resolvedOpenAI ? { openai_api_key: resolvedOpenAI } : {}),
    confidence_threshold: defaults.confidence_threshold,
    llm_supports_batch_api: defaults.llm_supports_batch_api,
  };
}
