import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface GeminiFeatureFlags {
  GEMINI_AI_SEARCH_ENABLED: boolean;
  GEMINI_CRAWL4AI_ENABLED: boolean;
  GEMINI_BATCH_ENABLED: boolean;
  GEMINI_PARALLEL_RUN_ENABLED: boolean;
  GEMINI_TRAFFIC_PERCENT: number;
  GEMINI_PARALLEL_SAMPLE_PERCENT: number;
}

export interface GeminiFeatureFlagAuditEntry {
  id: string;
  updated_at: string;
  updated_by: string | null;
  source: string;
  reason: string | null;
  changed_keys: string[];
  previous: GeminiFeatureFlags;
  next: GeminiFeatureFlags;
}

const GEMINI_FEATURE_FLAGS_SETTINGS_KEY = 'gemini_feature_flags';
const GEMINI_FEATURE_FLAGS_AUDIT_SETTINGS_KEY = 'gemini_feature_flags_audit_log';
export const DEFAULT_GEMINI_FEATURE_FLAGS: GeminiFeatureFlags = {
  GEMINI_AI_SEARCH_ENABLED: false,
  GEMINI_CRAWL4AI_ENABLED: false,
  GEMINI_BATCH_ENABLED: false,
  GEMINI_PARALLEL_RUN_ENABLED: false,
  GEMINI_TRAFFIC_PERCENT: 0,
  GEMINI_PARALLEL_SAMPLE_PERCENT: 10,
};

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

function normalizePercent(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.trunc(value)));
}

function normalizeGeminiFeatureFlags(raw: unknown): GeminiFeatureFlags {
  const value = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};

  return {
    GEMINI_AI_SEARCH_ENABLED: value.GEMINI_AI_SEARCH_ENABLED === true,
    GEMINI_CRAWL4AI_ENABLED: value.GEMINI_CRAWL4AI_ENABLED === true,
    GEMINI_BATCH_ENABLED: value.GEMINI_BATCH_ENABLED === true,
    GEMINI_PARALLEL_RUN_ENABLED: value.GEMINI_PARALLEL_RUN_ENABLED === true,
    GEMINI_TRAFFIC_PERCENT: normalizePercent(
      value.GEMINI_TRAFFIC_PERCENT,
      DEFAULT_GEMINI_FEATURE_FLAGS.GEMINI_TRAFFIC_PERCENT
    ),
    GEMINI_PARALLEL_SAMPLE_PERCENT: normalizePercent(
      value.GEMINI_PARALLEL_SAMPLE_PERCENT,
      DEFAULT_GEMINI_FEATURE_FLAGS.GEMINI_PARALLEL_SAMPLE_PERCENT
    ),
  };
}

function normalizeAuditEntry(raw: unknown): GeminiFeatureFlagAuditEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const changedKeys = Array.isArray(value.changed_keys)
    ? value.changed_keys.filter((key): key is string => typeof key === 'string')
    : [];

  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : new Date().toISOString(),
    updated_by: typeof value.updated_by === 'string' ? value.updated_by : null,
    source: typeof value.source === 'string' && value.source.trim() ? value.source.trim() : 'api',
    reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : null,
    changed_keys: changedKeys,
    previous: normalizeGeminiFeatureFlags(value.previous),
    next: normalizeGeminiFeatureFlags(value.next),
  };
}

async function getSiteSetting(key: string): Promise<unknown | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) {
    return null;
  }

  return data.value;
}

async function upsertSiteSetting(key: string, value: unknown): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('site_settings')
    .upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    throw new Error(`Failed to persist ${key}: ${error.message}`);
  }
}

function getChangedKeys(previous: GeminiFeatureFlags, next: GeminiFeatureFlags): string[] {
  const keys = Object.keys(DEFAULT_GEMINI_FEATURE_FLAGS) as Array<keyof GeminiFeatureFlags>;
  return keys.filter((key) => previous[key] !== next[key]);
}

export async function getGeminiFeatureFlags(): Promise<GeminiFeatureFlags> {
  const rawValue = await getSiteSetting(GEMINI_FEATURE_FLAGS_SETTINGS_KEY);
  if (!rawValue) {
    return DEFAULT_GEMINI_FEATURE_FLAGS;
  }

  return normalizeGeminiFeatureFlags(rawValue);
}

export async function getGeminiFeatureFlagsSafe(): Promise<GeminiFeatureFlags> {
  try {
    return await getGeminiFeatureFlags();
  } catch (error) {
    console.warn('[GeminiFeatureFlags] Falling back to defaults:', error);
    return DEFAULT_GEMINI_FEATURE_FLAGS;
  }
}

export async function getGeminiFeatureFlagAuditLog(limit = 20): Promise<GeminiFeatureFlagAuditEntry[]> {
  const rawValue = await getSiteSetting(GEMINI_FEATURE_FLAGS_AUDIT_SETTINGS_KEY);
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((item) => normalizeAuditEntry(item))
    .filter((item): item is GeminiFeatureFlagAuditEntry => item !== null)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, Math.max(1, limit));
}

async function appendGeminiFeatureFlagAuditEntry(entry: GeminiFeatureFlagAuditEntry): Promise<void> {
  const existing = await getGeminiFeatureFlagAuditLog(100);
  const next = [entry, ...existing].slice(0, 100);
  await upsertSiteSetting(GEMINI_FEATURE_FLAGS_AUDIT_SETTINGS_KEY, next);
}

export async function upsertGeminiFeatureFlags(
  partial: Partial<GeminiFeatureFlags>,
  updatedBy: string | null,
  options?: {
    reason?: string | null;
    source?: string;
  }
): Promise<GeminiFeatureFlags> {
  const current = await getGeminiFeatureFlags();
  const next = normalizeGeminiFeatureFlags({ ...current, ...partial });
  const changedKeys = getChangedKeys(current, next);

  if (changedKeys.length === 0) {
    return next;
  }

  await upsertSiteSetting(GEMINI_FEATURE_FLAGS_SETTINGS_KEY, next);
  await appendGeminiFeatureFlagAuditEntry({
    id: crypto.randomUUID(),
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
    source: options?.source?.trim() || 'api',
    reason: options?.reason?.trim() || null,
    changed_keys: changedKeys,
    previous: current,
    next,
  });

  return next;
}

function isPercentMatch(subjectKey: string, percent: number): boolean {
  if (percent <= 0) {
    return false;
  }
  if (percent >= 100) {
    return true;
  }

  const digest = crypto.createHash('sha256').update(subjectKey).digest();
  return digest.readUInt32BE(0) % 100 < percent;
}

export function shouldUseGeminiTraffic(flags: GeminiFeatureFlags, subjectKey: string): boolean {
  return flags.GEMINI_BATCH_ENABLED && isPercentMatch(subjectKey, flags.GEMINI_TRAFFIC_PERCENT);
}

export function shouldCreateGeminiParallelRun(flags: GeminiFeatureFlags, subjectKey: string): boolean {
  return flags.GEMINI_PARALLEL_RUN_ENABLED && isPercentMatch(subjectKey, flags.GEMINI_PARALLEL_SAMPLE_PERCENT);
}
