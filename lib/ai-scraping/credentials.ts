import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type AIProvider = 'openai' | 'brave';

export interface AIScrapingDefaults {
  llm_model: 'gpt-4o-mini' | 'gpt-4o';
  max_search_results: number;
  max_steps: number;
  confidence_threshold: number;
}

export interface AICredentialStatus {
  provider: AIProvider;
  configured: boolean;
  last4: string | null;
  updated_at: string | null;
}

const AI_DEFAULTS_SETTINGS_KEY = 'ai_scraping_defaults';

const DEFAULT_AI_SCRAPING_DEFAULTS: AIScrapingDefaults = {
  llm_model: 'gpt-4o-mini',
  max_search_results: 5,
  max_steps: 15,
  confidence_threshold: 0.7,
};

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
    if (required) {
      throw new Error('AI_CREDENTIALS_ENCRYPTION_KEY is not configured');
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
    if (required) {
      throw new Error('AI_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (utf8) or base64-encoded 32 bytes');
    }
    return null;
  }

  return keyBuffer;
}

function encryptSecret(secret: string): { encryptedValue: string; iv: string; authTag: string } {
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

function decryptSecret(payload: { encryptedValue: string; iv: string; authTag: string }): string {
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

function normalizeDefaults(raw: unknown): AIScrapingDefaults {
  const value = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};

  const llmModel = value.llm_model === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini';
  const maxSearchResults = Number.isFinite(value.max_search_results) ? Number(value.max_search_results) : DEFAULT_AI_SCRAPING_DEFAULTS.max_search_results;
  const maxSteps = Number.isFinite(value.max_steps) ? Number(value.max_steps) : DEFAULT_AI_SCRAPING_DEFAULTS.max_steps;
  const confidenceThreshold = Number.isFinite(value.confidence_threshold)
    ? Number(value.confidence_threshold)
    : DEFAULT_AI_SCRAPING_DEFAULTS.confidence_threshold;

  return {
    llm_model: llmModel,
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
  const next = normalizeDefaults({ ...current, ...partial });

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
    brave: { provider: 'brave', configured: false, last4: null, updated_at: null },
  };

  for (const row of data || []) {
    const provider = row.provider as AIProvider;
    if (provider !== 'openai' && provider !== 'brave') {
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
    return null;
  }

  try {
    return decryptSecret({
      encryptedValue: data.encrypted_value as string,
      iv: data.iv as string,
      authTag: data.auth_tag as string,
    });
  } catch {
    return null;
  }
}

export async function getAIScrapingRuntimeCredentials(): Promise<{ openai_api_key?: string; brave_api_key?: string } | null> {
  const [openai, brave] = await Promise.all([
    getAIScrapingProviderSecret('openai'),
    getAIScrapingProviderSecret('brave'),
  ]);

  const credentials: { openai_api_key?: string; brave_api_key?: string } = {};

  if (openai) {
    credentials.openai_api_key = openai;
  }
  if (brave) {
    credentials.brave_api_key = brave;
  }

  return Object.keys(credentials).length > 0 ? credentials : null;
}
