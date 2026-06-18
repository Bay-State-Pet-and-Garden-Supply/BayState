/**
 * Packaging Vision & Title Normalization Settings
 *
 * Reads packaging extraction and title suggestion settings from site_settings.
 * Follows the same pattern as other site_settings consumers in the codebase.
 */

import { createAdminClient } from '@/lib/supabase/server';

/**
 * Packaging title mode controls how packaging evidence affects the draft title.
 * - disabled: no packaging extraction.
 * - shadow: extract + compare internally, no draft mutation.
 * - suggestion: show packaging-suggested normalized title with an apply action.
 * - auto_draft_high_confidence: auto-apply packaging-backed title when confidence gates pass.
 */
export type PackagingTitleMode =
  | 'disabled'
  | 'shadow'
  | 'suggestion'
  | 'auto_draft_high_confidence';

/**
 * External API fallback policy for packaging extraction.
 * - none: no external fallback (self-hosted only).
 * - external_api: allow fallback to configured external VLM/OCR provider.
 */
export type FallbackPolicy = 'none' | 'external_api';

export interface PackagingVisionSettings {
  /** Title normalization mode */
  packaging_title_mode: PackagingTitleMode;
  /** External API fallback policy */
  fallback_policy: FallbackPolicy;
  /** Maximum seconds to wait for packaging extraction before proceeding without it */
  packaging_timeout_seconds: number;
}

const PACKAGING_DEFAULTS: PackagingVisionSettings = {
  packaging_title_mode: 'shadow',
  fallback_policy: 'none',
  packaging_timeout_seconds: 600,
};

/**
 * Load packaging vision settings from site_settings.
 * Returns defaults for any missing or unparseable keys.
 */
export async function getPackagingVisionSettings(): Promise<PackagingVisionSettings> {
  const supabase = await createAdminClient();
  const keys = ['packaging_title_mode', 'packaging_fallback_policy', 'packaging_timeout_seconds'];

  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', keys);

  if (error) {
    console.error('[PackagingSettings] Failed to load settings:', error);
    return { ...PACKAGING_DEFAULTS };
  }

  if (!data || data.length === 0) {
    return { ...PACKAGING_DEFAULTS };
  }

  const settingsMap = new Map<string, unknown>();
  for (const row of data) {
    settingsMap.set(row.key, row.value);
  }

  const mode = settingsMap.get('packaging_title_mode');
  const fallback = settingsMap.get('packaging_fallback_policy');
  const timeout = settingsMap.get('packaging_timeout_seconds');

  return {
    packaging_title_mode: isValidTitleMode(mode) ? mode : PACKAGING_DEFAULTS.packaging_title_mode,
    fallback_policy: isValidFallbackPolicy(fallback) ? fallback : PACKAGING_DEFAULTS.fallback_policy,
    packaging_timeout_seconds:
      typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
        ? timeout
        : PACKAGING_DEFAULTS.packaging_timeout_seconds,
  };
}

/**
 * Get a single packaging setting value.
 */
export async function getPackagingTitleMode(): Promise<PackagingTitleMode> {
  const settings = await getPackagingVisionSettings();
  return settings.packaging_title_mode;
}

/**
 * Get the packaging timeout in seconds.
 */
export async function getPackagingTimeoutSeconds(): Promise<number> {
  const settings = await getPackagingVisionSettings();
  return settings.packaging_timeout_seconds;
}

/**
 * Get the external fallback policy.
 */
export async function getPackagingFallbackPolicy(): Promise<FallbackPolicy> {
  const settings = await getPackagingVisionSettings();
  return settings.fallback_policy;
}

function isValidTitleMode(value: unknown): value is PackagingTitleMode {
  return (
    typeof value === 'string' &&
    ['disabled', 'shadow', 'suggestion', 'auto_draft_high_confidence'].includes(value)
  );
}

function isValidFallbackPolicy(value: unknown): value is FallbackPolicy {
  return typeof value === 'string' && ['none', 'external_api'].includes(value);
}
