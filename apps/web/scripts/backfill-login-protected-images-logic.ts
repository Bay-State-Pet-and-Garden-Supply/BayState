import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLocalScraperConfigs } from '../lib/admin/scrapers/configs';
import type { ScraperConfig } from '../lib/admin/scrapers/types';
import {
  extractImageCandidatesFromSourcePayload,
  extractSourceMetadata,
  normalizeImageUrl,
  normalizeProductSources,
  removeImageFieldsFromSourcePayload,
} from '../lib/product-sources';
import { isDurableProductImageReference } from '../lib/product-image-storage';

type BackfillMode = 'dry-run' | 'execute';

interface ProductsIngestionBackfillRow {
  sku: string;
  sources: unknown;
  consolidated: unknown;
  selected_images: unknown;
  image_candidates: string[] | null;
  pipeline_status: string | null;
  input: unknown;
}

interface ScrapeContextItem {
  sku: string;
  product_name?: string;
  price?: number;
  brand?: string;
  category?: string;
}

type StandardSkuContext = {
  product_name?: string;
  price?: number;
  brand?: string;
  category?: string;
};

export interface LoginProtectedImageBackfillCandidate {
  sku: string;
  pipelineStatus: string | null;
  affectedSources: string[];
  staleSourceImages: string[];
  staleSelectedImages: string[];
  staleConsolidatedImages: string[];
  staleImageCandidates: string[];
  requiresRepublish: boolean;
  updatedSources: Record<string, unknown>;
  updatedConsolidated: Record<string, unknown>;
  updatedSelectedImages: unknown[];
  updatedImageCandidates: string[];
}

export interface LoginProtectedImageBackfillOptions {
  mode: BackfillMode;
  skus?: string[];
  limit?: number;
  maxWorkers?: number;
  chunkSize?: number;
}

export interface LoginProtectedImageBackfillResult {
  mode: BackfillMode;
  scannedCount: number;
  candidateCount: number;
  updatedCount: number;
  queuedJobIds: string[];
  candidates: Array<Pick<
    LoginProtectedImageBackfillCandidate,
    | 'sku'
    | 'pipelineStatus'
    | 'affectedSources'
    | 'staleSourceImages'
    | 'staleSelectedImages'
    | 'staleConsolidatedImages'
    | 'staleImageCandidates'
    | 'requiresRepublish'
  >>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/[$,]/g, '');
    if (!normalized) {
      return undefined;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeImageKey(value: string): string {
  return normalizeImageUrl(value);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function scraperConfigRequiresLogin(config: ScraperConfig): boolean {
  if (config.login && isRecord(config.login)) {
    return true;
  }

  const loginKeywords = ['login', 'authenticate', 'sign_in', 'signin', 'password', 'username'];
  const workflows = Array.isArray(config.workflows) ? config.workflows : [];

  return workflows.some((step) => {
    const action = typeof step?.action === 'string' ? step.action.toLowerCase() : '';
    if (loginKeywords.some((keyword) => action.includes(keyword))) {
      return true;
    }

    const paramsString = step?.params ? JSON.stringify(step.params).toLowerCase() : '';
    return loginKeywords.some((keyword) => paramsString.includes(keyword));
  });
}

export function resolveLoginProtectedScraperSlugs(configs: ScraperConfig[]): string[] {
  return configs
    .map((config) => {
      const slug = typeof config.slug === 'string' ? config.slug.trim() : '';
      if (!slug || !scraperConfigRequiresLogin(config)) {
        return null;
      }
      return slug;
    })
    .filter((slug): slug is string => Boolean(slug));
}

function filterStringArray(
  values: unknown,
  staleKeys: Set<string>,
): { kept: string[]; removed: string[] } {
  if (!Array.isArray(values)) {
    return { kept: [], removed: [] };
  }

  const kept: string[] = [];
  const removed: string[] = [];

  values.forEach((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }

    if (staleKeys.has(normalizeImageKey(value))) {
      removed.push(value);
      return;
    }

    kept.push(value);
  });

  return {
    kept: dedupeStrings(kept),
    removed: dedupeStrings(removed),
  };
}

function filterSelectedImages(
  value: unknown,
  staleKeys: Set<string>,
): { kept: unknown[]; removed: string[] } {
  if (!Array.isArray(value)) {
    return { kept: [], removed: [] };
  }

  const kept: unknown[] = [];
  const removed: string[] = [];

  value.forEach((entry) => {
    if (typeof entry === 'string') {
      if (staleKeys.has(normalizeImageKey(entry))) {
        removed.push(entry);
      } else {
        kept.push(entry);
      }
      return;
    }

    if (isRecord(entry) && typeof entry.url === 'string') {
      if (staleKeys.has(normalizeImageKey(entry.url))) {
        removed.push(entry.url);
      } else {
        kept.push(entry);
      }
      return;
    }

    kept.push(entry);
  });

  return {
    kept,
    removed: dedupeStrings(removed),
  };
}

function filterConsolidatedImages(
  value: unknown,
  staleKeys: Set<string>,
): { kept: Record<string, unknown>; removed: string[] } {
  const consolidated = isRecord(value) ? { ...value } : {};
  const { kept, removed } = filterStringArray(consolidated.images, staleKeys);

  if (kept.length > 0) {
    consolidated.images = kept;
  } else {
    delete consolidated.images;
  }

  return {
    kept: consolidated,
    removed,
  };
}

export function collectLoginProtectedImageBackfillCandidates(
  rows: ProductsIngestionBackfillRow[],
  loginProtectedScraperSlugs: string[],
): LoginProtectedImageBackfillCandidate[] {
  const loginProtectedSet = new Set(loginProtectedScraperSlugs);

  return rows.flatMap((row) => {
    const normalizedSources = normalizeProductSources(row.sources);
    const updatedSources: Record<string, unknown> = {
      ...normalizedSources,
      ...extractSourceMetadata(row.sources),
    };
    const staleSourceImages: string[] = [];
    const affectedSources: string[] = [];
    const staleKeys = new Set<string>();

    Object.entries(normalizedSources).forEach(([sourceName, sourcePayload]) => {
      if (!loginProtectedSet.has(sourceName)) {
        return;
      }

      const sourceImages = extractImageCandidatesFromSourcePayload(sourcePayload, 128);
      const staleImages = sourceImages.filter((image) => !isDurableProductImageReference(image));

      if (staleImages.length === 0) {
        return;
      }

      affectedSources.push(sourceName);
      staleImages.forEach((image) => {
        staleKeys.add(normalizeImageKey(image));
        staleSourceImages.push(image);
      });
      updatedSources[sourceName] = removeImageFieldsFromSourcePayload(sourcePayload);
    });

    if (affectedSources.length === 0) {
      return [];
    }

    const { kept: updatedSelectedImages, removed: staleSelectedImages } = filterSelectedImages(
      row.selected_images,
      staleKeys,
    );
    const { kept: updatedImageCandidates, removed: staleImageCandidates } = filterStringArray(
      row.image_candidates,
      staleKeys,
    );
    const { kept: updatedConsolidated, removed: staleConsolidatedImages } = filterConsolidatedImages(
      row.consolidated,
      staleKeys,
    );

    return [
      {
        sku: row.sku,
        pipelineStatus: row.pipeline_status,
        affectedSources: affectedSources.sort(),
        staleSourceImages: dedupeStrings(staleSourceImages),
        staleSelectedImages,
        staleConsolidatedImages,
        staleImageCandidates,
        requiresRepublish: row.pipeline_status === 'published',
        updatedSources,
        updatedConsolidated,
        updatedSelectedImages,
        updatedImageCandidates,
      },
    ];
  });
}

async function loadScrapeContextItems(
  supabase: SupabaseClient,
  skus: string[],
): Promise<ScrapeContextItem[]> {
  const { data, error } = await supabase
    .from('products_ingestion')
    .select('sku, input')
    .in('sku', skus);

  if (error) {
    console.warn('[Login Image Backfill] Failed to load scrape context:', error);
    return skus.map((sku) => ({ sku }));
  }

  const rows = Array.isArray(data) ? (data as Array<{ sku: string; input: unknown }>) : [];
  const inputBySku = new Map(rows.map((row) => [row.sku, row.input]));

  return skus.map((sku) => {
    const input = inputBySku.get(sku);
    const inputRecord = isRecord(input) ? input : {};

    return {
      sku,
      product_name: toOptionalString(inputRecord.name),
      price: toOptionalNumber(inputRecord.price),
      brand: toOptionalString(inputRecord.brand),
      category: toOptionalString(inputRecord.category),
    };
  });
}

function buildStandardSkuContext(items: ScrapeContextItem[]): Record<string, StandardSkuContext> | null {
  const entries = items
    .map((item) => {
      const context: StandardSkuContext = {
        product_name: item.product_name,
        price: item.price,
        brand: item.brand,
        category: item.category,
      };

      return Object.values(context).some((value) => value !== undefined)
        ? ([item.sku, context] as const)
        : null;
    })
    .filter((entry): entry is readonly [string, StandardSkuContext] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function groupCandidatesBySourceSet(
  candidates: LoginProtectedImageBackfillCandidate[],
): Array<{ scrapers: string[]; skus: string[] }> {
  const grouped = new Map<string, { scrapers: string[]; skus: Set<string> }>();

  candidates.forEach((candidate) => {
    const scrapers = [...candidate.affectedSources].sort();
    const key = scrapers.join('|');
    const current = grouped.get(key) ?? { scrapers, skus: new Set<string>() };
    current.skus.add(candidate.sku);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((group) => ({
    scrapers: group.scrapers,
    skus: Array.from(group.skus).sort(),
  }));
}

async function createScrapeJob(
  supabase: SupabaseClient,
  group: { scrapers: string[]; skus: string[] },
  options: { maxWorkers: number; chunkSize: number },
): Promise<string> {
  const nowIso = new Date().toISOString();
  const scrapeContextItems = await loadScrapeContextItems(supabase, group.skus);
  const skuContext = buildStandardSkuContext(scrapeContextItems);

  const { data: job, error: jobError } = await supabase
    .from('scrape_jobs')
    .insert({
      skus: group.skus,
      scrapers: group.scrapers,
      test_mode: false,
      max_workers: options.maxWorkers,
      status: 'pending',
      attempt_count: 0,
      max_attempts: 3,
      backoff_until: null,
      lease_token: null,
      leased_at: null,
      lease_expires_at: null,
      heartbeat_at: null,
      runner_name: null,
      started_at: null,
      type: 'standard',
      config: skuContext ? { sku_context: skuContext } : null,
      metadata: {
        source: 'login_image_backfill',
        mode: 'scrapers',
        affected_sources: group.scrapers,
      },
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to create scrape job for ${group.scrapers.join(', ')}: ${jobError?.message ?? 'unknown error'}`);
  }

  const chunks = [];
  for (let index = 0; index < group.skus.length; index += options.chunkSize) {
    chunks.push({
      job_id: job.id,
      chunk_index: chunks.length,
      skus: group.skus.slice(index, index + options.chunkSize),
      scrapers: group.scrapers,
      status: 'pending',
      updated_at: nowIso,
    });
  }

  const { error: chunksError } = await supabase.from('scrape_job_chunks').insert(chunks);

  if (chunksError) {
    await supabase.from('scrape_jobs').delete().eq('id', job.id);
    throw new Error(`Failed to create scrape chunks for job ${job.id}: ${chunksError.message}`);
  }

  return job.id;
}

async function recordAuditEntries(
  supabase: SupabaseClient,
  candidates: LoginProtectedImageBackfillCandidate[],
): Promise<void> {
  const auditRows = candidates.map((candidate) => ({
    job_type: 'login_image_backfill',
    job_id: randomUUID(),
    from_state: candidate.pipelineStatus ?? 'unknown',
    to_state: candidate.pipelineStatus ?? 'unknown',
    actor_id: null,
    actor_type: 'system',
    metadata: {
      sku: candidate.sku,
      affected_sources: candidate.affectedSources,
      stale_source_images: candidate.staleSourceImages,
      stale_selected_images: candidate.staleSelectedImages,
      stale_consolidated_images: candidate.staleConsolidatedImages,
      stale_image_candidates: candidate.staleImageCandidates,
      timestamp: new Date().toISOString(),
    },
  }));

  const { error } = await supabase.from('pipeline_audit_log').insert(auditRows);

  if (error) {
    console.warn('[Login Image Backfill] Failed to write audit log entries:', error);
  }
}

export async function executeLoginProtectedImageBackfillWithClient(
  supabase: SupabaseClient,
  rows: ProductsIngestionBackfillRow[],
  loginProtectedScraperSlugs: string[],
  options: LoginProtectedImageBackfillOptions,
): Promise<LoginProtectedImageBackfillResult> {
  const candidates = collectLoginProtectedImageBackfillCandidates(rows, loginProtectedScraperSlugs);

  if (options.mode === 'dry-run' || candidates.length === 0) {
    return {
      mode: options.mode,
      scannedCount: rows.length,
      candidateCount: candidates.length,
      updatedCount: 0,
      queuedJobIds: [],
      candidates: candidates.map((candidate) => ({
        sku: candidate.sku,
        pipelineStatus: candidate.pipelineStatus,
        affectedSources: candidate.affectedSources,
        staleSourceImages: candidate.staleSourceImages,
        staleSelectedImages: candidate.staleSelectedImages,
        staleConsolidatedImages: candidate.staleConsolidatedImages,
        staleImageCandidates: candidate.staleImageCandidates,
        requiresRepublish: candidate.requiresRepublish,
      })),
    };
  }

  let updatedCount = 0;

  for (const candidate of candidates) {
    const { error } = await supabase
      .from('products_ingestion')
      .update({
        sources: candidate.updatedSources,
        consolidated: candidate.updatedConsolidated,
        selected_images: candidate.updatedSelectedImages,
        image_candidates: candidate.updatedImageCandidates,
        updated_at: new Date().toISOString(),
      })
      .eq('sku', candidate.sku);

    if (error) {
      throw new Error(`Failed to update products_ingestion for ${candidate.sku}: ${error.message}`);
    }

    updatedCount += 1;
  }

  await recordAuditEntries(supabase, candidates);

  const queuedJobIds: string[] = [];
  const groups = groupCandidatesBySourceSet(candidates);

  for (const group of groups) {
    const jobId = await createScrapeJob(supabase, group, {
      maxWorkers: options.maxWorkers ?? 3,
      chunkSize: options.chunkSize ?? 50,
    });
    queuedJobIds.push(jobId);
  }

  return {
    mode: options.mode,
    scannedCount: rows.length,
    candidateCount: candidates.length,
    updatedCount,
    queuedJobIds,
    candidates: candidates.map((candidate) => ({
      sku: candidate.sku,
      pipelineStatus: candidate.pipelineStatus,
      affectedSources: candidate.affectedSources,
      staleSourceImages: candidate.staleSourceImages,
      staleSelectedImages: candidate.staleSelectedImages,
      staleConsolidatedImages: candidate.staleConsolidatedImages,
      staleImageCandidates: candidate.staleImageCandidates,
      requiresRepublish: candidate.requiresRepublish,
    })),
  };
}

function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadProductsIngestionRows(
  supabase: SupabaseClient,
  options: Pick<LoginProtectedImageBackfillOptions, 'skus' | 'limit'>,
): Promise<ProductsIngestionBackfillRow[]> {
  let query = supabase
    .from('products_ingestion')
    .select('sku, sources, consolidated, selected_images, image_candidates, pipeline_status, input')
    .order('updated_at', { ascending: false });

  if (options.skus && options.skus.length > 0) {
    query = query.in('sku', options.skus);
  } else {
    const limit = options.limit ?? 500;
    query = query.range(0, Math.max(limit - 1, 0));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load products_ingestion rows: ${error.message}`);
  }

  return Array.isArray(data) ? (data as ProductsIngestionBackfillRow[]) : [];
}

export async function runLoginProtectedImageBackfill(
  options: LoginProtectedImageBackfillOptions,
): Promise<LoginProtectedImageBackfillResult> {
  const supabase = createSupabaseAdminClient();
  const configs = await getLocalScraperConfigs();
  const loginProtectedScraperSlugs = resolveLoginProtectedScraperSlugs(configs);
  const rows = await loadProductsIngestionRows(supabase, options);

  return executeLoginProtectedImageBackfillWithClient(
    supabase,
    rows,
    loginProtectedScraperSlugs,
    options,
  );
}
