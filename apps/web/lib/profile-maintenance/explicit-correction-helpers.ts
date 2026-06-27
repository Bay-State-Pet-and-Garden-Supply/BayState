/**
 * Explicit Correction helpers — aggregate field-level corrections into
 * draft Profile Versions (created_from='explicit_correction').
 *
 * See docs/plans/site-extraction-profiles-implementation-plan.md §Phase 10
 * and docs/adr/0008-declarative-field-evidence-rules.md
 */

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal shape of a row selected from explicit_extraction_corrections.
 */
export interface CorrectionRow {
  id: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
  target_field: string;
  correction_type: 'accepted' | 'rejected';
  evidence_summary: Record<string, unknown>;
}

/**
 * The aggregated Field Evidence Rules shape produced by
 * aggregateCorrectionsIntoRules.  Groups corrections by target_field
 * and separates accepted / rejected evidence.
 */
export interface AggregatedCorrectionRules {
  /** Map of target_field → { accepted: [...], rejected: [...] } */
  corrections: Record<
    string,
    {
      accepted: Array<{ correction_id: string; evidence_summary: Record<string, unknown> }>;
      rejected: Array<{ correction_id: string; evidence_summary: Record<string, unknown> }>;
    }
  >;
  /** Metadata about the aggregation */
  _meta: {
    correction_count: number;
    source_fields: string[];
    aggregated_at: string;
  };
}

// =============================================================================
// Public helpers
// =============================================================================

/**
 * Aggregate an array of explicit corrections into a Field Evidence Rules
 * JSON object.  Groups by target_field and separates accepted/rejected
 * evidence.
 *
 * The output is intended to be stored in
 * site_extraction_profile_versions.rules and consumed downstream by
 * validation / approval / activation.
 */
export function aggregateCorrectionsIntoRules(
  corrections: CorrectionRow[],
): AggregatedCorrectionRules {
  const fieldMap: Record<
    string,
    {
      accepted: Array<{ correction_id: string; evidence_summary: Record<string, unknown> }>;
      rejected: Array<{ correction_id: string; evidence_summary: Record<string, unknown> }>;
    }
  > = {};

  for (const c of corrections) {
    if (!fieldMap[c.target_field]) {
      fieldMap[c.target_field] = { accepted: [], rejected: [] };
    }
    const entry = {
      correction_id: c.id,
      evidence_summary: c.evidence_summary,
    };
    if (c.correction_type === 'accepted') {
      fieldMap[c.target_field].accepted.push(entry);
    } else {
      fieldMap[c.target_field].rejected.push(entry);
    }
  }

  const allFields = Object.keys(fieldMap).sort();

  return {
    corrections: fieldMap,
    _meta: {
      correction_count: corrections.length,
      source_fields: allFields,
      aggregated_at: new Date().toISOString(),
    },
  };
}

/**
 * Recursively sort the keys of an object (and all nested objects) for
 * deterministic serialization.  Arrays are preserved in order.
 */
function stableSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSortKeys);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stableSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute a deterministic version_hash from the aggregated rules.
 *
 * Uses SHA-256 with stable JSON serialization (recursively sorted keys)
 * so the same rules always produce the same hash.
 */
export function computeVersionHash(rules: Record<string, unknown>): string {
  const stable = JSON.stringify(stableSortKeys(rules));
  return crypto.createHash('sha256').update(stable).digest('hex').substring(0, 32);
}

/**
 * Options for createDraftVersionFromCorrections
 */
export interface CreateDraftVersionOptions {
  /** The profile that will own the new draft version */
  profileId: string;
  /** Auth user ID creating the version */
  createdBy: string;
  /** Brand, source, domain scope (for logging / validation) */
  brandId: string;
  sourceSlug: string;
  canonicalDomain: string;
}

/**
 * Create a draft site_extraction_profile_version row from a set of
 * explicit corrections.
 *
 * Steps:
 * 1. Determine the next version_number for the profile.
 * 2. Aggregate corrections into Field Evidence Rules.
 * 3. Compute a deterministic version_hash.
 * 4. Insert the version row with created_from='explicit_correction'.
 *
 * @returns The created version row, or null on failure.
 */
export async function createDraftVersionFromCorrections(
  supabase: SupabaseClient,
  corrections: CorrectionRow[],
  options: CreateDraftVersionOptions,
): Promise<Record<string, unknown> | null> {
  if (corrections.length === 0) {
    console.warn('[ExplicitCorrection] No corrections provided for draft version creation');
    return null;
  }

  const { profileId, createdBy } = options;

  // 1. Determine next version_number
  const { data: latestVersion } = await supabase
    .from('site_extraction_profile_versions')
    .select('version_number')
    .eq('profile_id', profileId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latestVersion?.version_number ?? 0) + 1;

  // 2. Aggregate rules
  const rules = aggregateCorrectionsIntoRules(corrections);
  const versionHash = computeVersionHash(rules as unknown as Record<string, unknown>);

  // 3. Insert draft version
  const { data: newVersion, error } = await supabase
    .from('site_extraction_profile_versions')
    .insert({
      profile_id: profileId,
      version_number: versionNumber,
      status: 'draft',
      rules: rules as unknown as Record<string, unknown>,
      version_hash: versionHash,
      created_from: 'explicit_correction',
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    console.error(
      `[ExplicitCorrection] Failed to create draft version for profile ${profileId}:`,
      error.message,
    );
    return null;
  }

  return newVersion;
}

/**
 * Build a simple compiled_crawl4ai_schema stub based on aggregated rules.
 * This is optional — the promote route may not always have enough
 * information to produce a working schema — but provides a starting point
 * for validation.
 */
export function buildStubCrawl4aiSchema(
  rules: AggregatedCorrectionRules,
): Record<string, unknown> {
  const fields = rules._meta.source_fields.map((field) => ({
    name: field,
    selector: '', // Empty — admin will refine via AI draft
    type: 'text',
  }));

  return {
    name: 'explicit-correction-draft',
    baseSelector: '', // Empty — needs AI schema draft to fill
    fields,
    metadata: {
      source: 'explicit_correction',
      correction_count: rules._meta.correction_count,
      aggregated_at: rules._meta.aggregated_at,
    },
  };
}
