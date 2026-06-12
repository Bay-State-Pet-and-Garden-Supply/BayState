/**
 * Source Cascade Backend Helpers
 *
 * The Source Cascade is a per-brand ordered list of distributor sources.
 * Admin configures it once per brand in brand settings; extraction blocks
 * until the cascade is configured.
 *
 * These helpers support:
 *   - Cascade readiness checks (is a brand ready to scrape?)
 *   - Loading and persisting cascade entries
 *   - Computing incremental re-extraction targets from source attempt history
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXED_DISTRIBUTOR_CATALOG } from "./distributor-catalog";

// =============================================================================
// Database row shapes (local, matching the generated supabase types)
// =============================================================================

interface BrandSourceRow {
  id: string;
  brand_id: string;
  source_type: string;
  source_slug: string;
  display_name: string;
  domains: string[];
  asset_domains: string[];
  crawl4ai_adapter_slug: string;
  requires_auth: boolean;
  credential_ref: string | null;
  search_mode: string;
  allowed_fields: string[];
  priority: number;
  enabled: boolean;
}

interface SourceAttemptRow {
  source_slug: string;
  outcome: string;
  attempted_at: string;
}

// =============================================================================
// 1. isCascadeConfigured
// =============================================================================

/**
 * Check if a brand's Source Cascade is configured and ready for extraction.
 *
 * A brand is cascade-ready when:
 *   1. `brands.source_cascade_configured_at` is set (admin has saved a cascade)
 *   2. At least one enabled distributor source exists in `brand_sources`
 */
export async function isCascadeConfigured(
  db: SupabaseClient,
  brandId: string,
): Promise<boolean> {
  // Check cascade timestamp on brand
  const { data: brand } = await db
    .from("brands")
    .select("source_cascade_configured_at")
    .eq("id", brandId)
    .single();

  if (!brand?.source_cascade_configured_at) {
    return false;
  }

  // Check for at least one enabled distributor source
  const { count: distributorCount } = await db
    .from("brand_sources")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("source_type", "distributor")
    .eq("enabled", true);

  return (distributorCount ?? 0) > 0;
}

// =============================================================================
// 2. getCascadeReadiness
// =============================================================================

/**
 * Bulk cascade readiness check for multiple brands.
 *
 * Returns a map keyed by brandId with:
 *   - `configured`: true if brand is cascade-ready
 *   - `reason`: human-readable explanation when not configured
 */
export async function getCascadeReadiness(
  db: SupabaseClient,
  brandIds: string[],
): Promise<Record<string, { configured: boolean; reason?: string }>> {
  if (brandIds.length === 0) {
    return {};
  }

  // Load brand cascade metadata
  const { data: brands } = await db
    .from("brands")
    .select("id, source_cascade_configured_at, name")
    .in("id", brandIds);

  const brandMap = new Map<string, { name: string; configuredAt: string | null }>(
    (brands ?? []).map((b: { id: string; name: string; source_cascade_configured_at: string | null }) => [
      b.id,
      { name: b.name, configuredAt: b.source_cascade_configured_at },
    ]),
  );

  // Load enabled distributor counts per brand
  const { data: sourceCounts } = await db
    .from("brand_sources")
    .select("brand_id, id")
    .in("brand_id", brandIds)
    .eq("source_type", "distributor")
    .eq("enabled", true);

  const countByBrand = new Map<string, number>();
  for (const row of sourceCounts ?? []) {
    const current = countByBrand.get(row.brand_id) ?? 0;
    countByBrand.set(row.brand_id, current + 1);
  }

  // Build result map
  const results: Record<string, { configured: boolean; reason?: string }> = {};

  for (const brandId of brandIds) {
    const brand = brandMap.get(brandId);
    if (!brand) {
      results[brandId] = {
        configured: false,
        reason: "Brand record not found",
      };
      continue;
    }

    if (!brand.configuredAt) {
      results[brandId] = {
        configured: false,
        reason: `Source cascade not configured for brand "${brand.name}". Configure distributor priorities in brand settings.`,
      };
      continue;
    }

    const distributorCount = countByBrand.get(brandId) ?? 0;
    if (distributorCount === 0) {
      results[brandId] = {
        configured: false,
        reason: `Brand "${brand.name}" has a cascade timestamp but no enabled distributor sources. Enable at least one distributor in brand settings.`,
      };
      continue;
    }

    results[brandId] = { configured: true };
  }

  return results;
}

// =============================================================================
// 3. getCascadeEntries
// =============================================================================

/**
 * Load all enabled distributor sources in a brand's Source Cascade.
 *
 * Returns rows ordered by priority ASC. Only includes `source_type = 'distributor'`
 * entries — the official brand site (terminal SERP fallback) is handled separately
 * in the plan builder and is not part of the cascade.
 */
export async function getCascadeEntries(
  db: SupabaseClient,
  brandId: string,
): Promise<BrandSourceRow[]> {
  const { data: sources } = await db
    .from("brand_sources")
    .select(
      "id, brand_id, source_type, source_slug, display_name, domains, asset_domains, crawl4ai_adapter_slug, requires_auth, credential_ref, search_mode, allowed_fields, priority, enabled",
    )
    .eq("brand_id", brandId)
    .eq("source_type", "distributor")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  return (sources ?? []) as BrandSourceRow[];
}

// =============================================================================
// 4. upsertBrandCascade
// =============================================================================

/**
 * Upsert distributor cascade entries for a brand and mark the cascade as
 * configured.
 *
 * For each entry in `entries`:
 *   - Find existing `brand_sources` row with `(brand_id, source_type='distributor', source_slug)`
 *   - If found: update `priority` and `enabled`
 *   - If not found: insert a new row using `FIXED_DISTRIBUTOR_CATALOG` for
 *     default metadata (domains, adapter slug, etc.)
 *
 * After all upserts, sets `brands.source_cascade_configured_at = now()` and
 * `source_cascade_configured_by = adminUserId`.
 *
 * @param db          Supabase admin client
 * @param brandId     The brand to configure
 * @param entries     Ordered cascade entries with source slug, enabled state, and priority
 * @param adminUserId The auth.user.id of the admin performing the update
 */
export async function upsertBrandCascade(
  db: SupabaseClient,
  brandId: string,
  entries: {
    sourceSlug: string;
    enabled: boolean;
    priority: number;
  }[],
  adminUserId: string,
): Promise<void> {
  // Get existing distributor brand_sources for this brand
  const { data: existingSources } = await db
    .from("brand_sources")
    .select("id, source_slug, source_type")
    .eq("brand_id", brandId)
    .eq("source_type", "distributor");

  const existingMap = new Map<string, string>(
    (existingSources ?? []).map((s: { id: string; source_slug: string }) => [s.source_slug, s.id]),
  );

  for (const entry of entries) {
    const existingId = existingMap.get(entry.sourceSlug);

    if (existingId) {
      // Update existing row
      const { error } = await db
        .from("brand_sources")
        .update({
          priority: entry.priority,
          enabled: entry.enabled,
        })
        .eq("id", existingId);

      if (error) {
        console.error(
          `[SourceCascade] Failed to update brand_source ${entry.sourceSlug} for brand ${brandId}:`,
          error,
        );
      }
    } else {
      // Look up catalog entry for defaults
      const catalogEntry = FIXED_DISTRIBUTOR_CATALOG.find(
        (c) => c.sourceSlug === entry.sourceSlug,
      );

      if (!catalogEntry) {
        console.warn(
          `[SourceCascade] No catalog entry found for sourceSlug "${entry.sourceSlug}" — skipping insert`,
        );
        continue;
      }

      // Insert new row from catalog defaults + entry overrides
      const { error } = await db
        .from("brand_sources")
        .insert({
          brand_id: brandId,
          source_type: "distributor",
          source_slug: catalogEntry.sourceSlug,
          display_name: catalogEntry.displayName,
          domains: catalogEntry.domains,
          asset_domains: catalogEntry.assetDomains,
          crawl4ai_adapter_slug: catalogEntry.adapterSlug,
          requires_auth: catalogEntry.requiresAuth,
          credential_ref: catalogEntry.credentialRef,
          search_mode: catalogEntry.searchMode,
          allowed_fields: catalogEntry.allowedFields,
          priority: entry.priority,
          enabled: entry.enabled,
        });

      if (error) {
        console.error(
          `[SourceCascade] Failed to insert brand_source ${entry.sourceSlug} for brand ${brandId}:`,
          error,
        );
      }
    }
  }

  // Mark cascade as configured
  const { error: brandUpdateError } = await db
    .from("brands")
    .update({
      source_cascade_configured_at: new Date().toISOString(),
      source_cascade_configured_by: adminUserId,
    })
    .eq("id", brandId);

  if (brandUpdateError) {
    console.error(
      `[SourceCascade] Failed to set source_cascade_configured_at for brand ${brandId}:`,
      brandUpdateError,
    );
  }
}

// =============================================================================
// 5. getLatestSourceOutcomes
// =============================================================================

/**
 * Get the latest outcome per source_slug for a given UPC.
 *
 * Queries `enrichment_source_attempts` using DISTINCT ON to get the most
 * recent attempt for each source. Returns a map of sourceSlug → { outcome,
 * attemptedAt }.
 */
export async function getLatestSourceOutcomes(
  db: SupabaseClient,
  upc: string,
): Promise<Map<string, { outcome: string; attemptedAt: string }>> {
  // Use a subquery with ROW_NUMBER to get latest per source_slug
  // Supabase's JS client doesn't support DISTINCT ON, so we query all
  // and deduplicate in JS.
  const { data: rows } = await db
    .from("enrichment_source_attempts")
    .select("source_slug, outcome, attempted_at")
    .eq("upc", upc)
    .order("attempted_at", { ascending: false });

  const outcomes = new Map<string, { outcome: string; attemptedAt: string }>();

  for (const row of (rows ?? []) as SourceAttemptRow[]) {
    // Only keep the first (latest) per source_slug since we order DESC
    if (!outcomes.has(row.source_slug)) {
      outcomes.set(row.source_slug, {
        outcome: row.outcome,
        attemptedAt: row.attempted_at,
      });
    }
  }

  return outcomes;
}

// =============================================================================
// 6. getUntriedAndErroredSources
// =============================================================================

/**
 * Given a UPC and all cascade source slugs, return only the sources that
 * should be retried in an incremental re-extraction.
 *
 * A source is included if EITHER:
 *   - It has never been attempted (no rows in enrichment_source_attempts)
 *   - Its latest outcome was `source_error`
 *
 * Sources with latest outcome `found` or `not_stocked` are excluded.
 *
 * @param upc                The target UPC
 * @param allCascadeSources  All source slugs in the brand's source cascade
 * @returns                  Subset of `allCascadeSources` that need retrying
 */
export async function getUntriedAndErroredSources(
  db: SupabaseClient,
  upc: string,
  allCascadeSources: string[],
): Promise<string[]> {
  if (allCascadeSources.length === 0) {
    return [];
  }

  const latestOutcomes = await getLatestSourceOutcomes(db, upc);

  return allCascadeSources.filter((sourceSlug) => {
    const outcome = latestOutcomes.get(sourceSlug);
    if (!outcome) {
      // Never attempted — include
      return true;
    }
    // Include only if it errored
    return outcome.outcome === "source_error";
  });
}
