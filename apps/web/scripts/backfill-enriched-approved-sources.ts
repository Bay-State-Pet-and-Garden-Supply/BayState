import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeDistributorSlug } from '../lib/approved-sources/distributor-catalog';

type BackfillMode = 'dry-run' | 'execute';

interface ProductsIngestionRow {
  upc: string;
  sources: unknown;
}

interface BackfillOptions {
  mode: BackfillMode;
  limit?: number;
  upcs?: string[];
}

interface BackfillSummary {
  mode: BackfillMode;
  scanned: number;
  eligible: number;
  updated: number;
  skippedExistingApprovedSources: number;
  skippedMissingEnriched: number;
  ambiguous: number;
  invalid: number;
  samples: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizeSourceSlug(sourceSlug: unknown, sourceType: unknown): string | null {
  const normalizedSlug = toOptionalString(sourceSlug);
  if (!normalizedSlug) {
    return null;
  }

  if (toOptionalString(sourceType) === 'distributor') {
    return normalizeDistributorSlug(normalizedSlug);
  }

  return normalizedSlug;
}

function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SECRET_KEY are set.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function parseArgs(argv: string[]): BackfillOptions {
  let mode: BackfillMode = 'dry-run';
  let limit: number | undefined;
  let upcs: string[] | undefined;

  argv.forEach((arg) => {
    if (arg === '--execute') {
      mode = 'execute';
      return;
    }

    if (arg === '--dry-run') {
      mode = 'dry-run';
      return;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        limit = value;
      }
      return;
    }

    if (arg.startsWith('--upcs=')) {
      upcs = arg
        .slice('--upcs='.length)
        .split(',')
        .map((upc) => upc.trim())
        .filter(Boolean);
    }
  });

  return { mode, limit, upcs };
}

async function loadRows(supabase: SupabaseClient, options: BackfillOptions): Promise<ProductsIngestionRow[]> {
  let query = supabase
    .from('products_ingestion')
    .select('upc, sources')
    .order('updated_at', { ascending: false });

  if (options.upcs && options.upcs.length > 0) {
    query = query.in('upc', options.upcs);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load products_ingestion rows: ${error.message}`);
  }

  return (data ?? []) as ProductsIngestionRow[];
}

function resolveBackfillTarget(enrichedSource: Record<string, unknown>): {
  activeSourceSlug: string | null;
  uniqueSourceSlugs: string[];
} {
  const activeSourceSlug = canonicalizeSourceSlug(
    enrichedSource.active_source_slug ?? enrichedSource.source_slug,
    enrichedSource.source_type,
  );

  const sourceResults = Array.isArray(enrichedSource.source_results)
    ? enrichedSource.source_results
    : [];
  const sourceSlugs = Array.from(new Set(
    sourceResults
      .map((sourceResult) => {
        if (!isRecord(sourceResult)) {
          return null;
        }
        return canonicalizeSourceSlug(sourceResult.sourceSlug, sourceResult.sourceType);
      })
      .filter((sourceSlug): sourceSlug is string => Boolean(sourceSlug)),
  ));

  return {
    activeSourceSlug: activeSourceSlug ?? sourceSlugs[0] ?? null,
    uniqueSourceSlugs: sourceSlugs,
  };
}

function buildBackfilledEnrichedSource(
  enrichedSource: Record<string, unknown>,
  activeSourceSlug: string,
): Record<string, unknown> {
  const { approved_sources: _existingApprovedSources, ...snapshot } = enrichedSource;
  const normalizedSnapshot = {
    ...snapshot,
    source_slug: toOptionalString(snapshot.source_slug) ?? activeSourceSlug,
    active_source_slug: activeSourceSlug,
  };

  return {
    ...enrichedSource,
    source_slug: toOptionalString(enrichedSource.source_slug) ?? activeSourceSlug,
    active_source_slug: activeSourceSlug,
    approved_sources: {
      [activeSourceSlug]: normalizedSnapshot,
    },
  };
}

async function runBackfill(options: BackfillOptions): Promise<BackfillSummary> {
  const supabase = createSupabaseAdminClient();
  const rows = await loadRows(supabase, options);

  const summary: BackfillSummary = {
    mode: options.mode,
    scanned: rows.length,
    eligible: 0,
    updated: 0,
    skippedExistingApprovedSources: 0,
    skippedMissingEnriched: 0,
    ambiguous: 0,
    invalid: 0,
    samples: [],
  };

  for (const row of rows) {
    if (!isRecord(row.sources)) {
      summary.skippedMissingEnriched += 1;
      continue;
    }

    const enrichedSource = isRecord(row.sources.enriched)
      ? row.sources.enriched
      : null;
    if (!enrichedSource) {
      summary.skippedMissingEnriched += 1;
      continue;
    }

    if (isRecord(enrichedSource.approved_sources)) {
      summary.skippedExistingApprovedSources += 1;
      continue;
    }

    const { activeSourceSlug, uniqueSourceSlugs } = resolveBackfillTarget(enrichedSource);
    if (!activeSourceSlug) {
      summary.invalid += 1;
      continue;
    }

    summary.eligible += 1;
    if (uniqueSourceSlugs.length > 1) {
      summary.ambiguous += 1;
    }

    const updatedSources = {
      ...row.sources,
      enriched: buildBackfilledEnrichedSource(enrichedSource, activeSourceSlug),
    };

    if (summary.samples.length < 10) {
      const suffix = uniqueSourceSlugs.length > 1 ? ' (ambiguous legacy collapse)' : '';
      summary.samples.push(`${row.upc} -> ${activeSourceSlug}${suffix}`);
    }

    if (options.mode === 'execute') {
      const { error } = await supabase
        .from('products_ingestion')
        .update({
          sources: updatedSources,
          updated_at: new Date().toISOString(),
        })
        .eq('upc', row.upc);

      if (error) {
        throw new Error(`Failed to update UPC ${row.upc}: ${error.message}`);
      }
    }

    summary.updated += 1;
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await runBackfill(options);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.ambiguous > 0) {
    console.log('\nNote: ambiguous rows had multiple historical source slugs in source_results.');
    console.log('Only the current top-level enriched snapshot was preserved under active_source_slug.');
  }

  if (options.mode === 'dry-run') {
    console.log('\nDry run only. Re-run with --execute to persist changes.');
  }
}

main().catch((error) => {
  console.error('[Backfill Enriched Approved Sources] Failed:', error);
  process.exitCode = 1;
});
