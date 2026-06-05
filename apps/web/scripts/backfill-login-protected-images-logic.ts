import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import yaml from 'yaml';
import type { Database } from '../lib/supabase/database.types';
import { scraperConfigRequiresLogin } from '../lib/scraper-config-login';
import { FIXED_DISTRIBUTOR_CATALOG } from '../lib/approved-sources/distributor-catalog';
import type { FixedDistributorEntry } from '../lib/approved-sources/distributor-catalog';

type ImageRetryQueueInsert = Database['public']['Tables']['image_retry_queue']['Insert'];

type BackfillMode = 'dry-run' | 'execute';

interface ProductsIngestionBackfillRow {
  upc: string;
  sources: unknown;
}

interface SourceBackfillTarget {
  sourceName: string;
  imageUrl: string;
  normalizedUrl: string;
}

interface ProductBackfillCandidate {
  productId: string;
  upc: string;
  targets: SourceBackfillTarget[];
}

interface ProductSourceHelpers {
  extractImageCandidatesFromSourcePayload: (rawSource: unknown, max?: number) => string[];
  normalizeImageUrl: (url: string) => string;
  normalizeProductSources: (rawSources: unknown) => Record<string, unknown>;
}

interface LoginProtectedImageBackfillOptions {
  mode: BackfillMode;
  upcs?: string[];
  limit?: number;
  batchSize?: number;
}

interface LoginProtectedImageBackfillResult {
  mode: BackfillMode;
  scannedCount: number;
  totalFound: number;
  alreadyQueued: number;
  newlyQueued: number;
  errors: number;
  batchesProcessed: number;
  batchSize: number;
  productsWithTargets: number;
}

interface ScraperConfigLike {
  slug?: string;
  login?: unknown;
  workflows?: Array<{ action?: unknown; params?: unknown }>;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

let productSourceHelpersPromise: Promise<ProductSourceHelpers> | null = null;

async function loadProductSourceHelpers(): Promise<ProductSourceHelpers> {
  if (!productSourceHelpersPromise) {
    const modulePath = '../lib/product-sources.ts';
    productSourceHelpersPromise = import(modulePath).then((module) => ({
      extractImageCandidatesFromSourcePayload: module.extractImageCandidatesFromSourcePayload,
      normalizeImageUrl: module.normalizeImageUrl,
      normalizeProductSources: module.normalizeProductSources,
    }));
  }

  return productSourceHelpersPromise;
}

function isInlineImageDataUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(value.trim());
}

function getConfiguredPublicBaseUrl(): string | null {
  const base = process.env.PRODUCT_IMAGE_PUBLIC_BASE_URL?.trim();
  return base ? base.replace(/\/+$/, '') : null;
}

function isProductImageStorageUrl(value: string): boolean {
  const normalized = value.trim();

  if (
    normalized.includes('/storage/v1/object/public/product-images/') ||
    normalized.includes('/storage/v1/render/image/public/product-images/')
  ) {
    return true;
  }

  const configuredBase = getConfiguredPublicBaseUrl();
  return Boolean(configuredBase && normalized.startsWith(`${configuredBase}/`));
}

function isDurableProductImageReference(value: string): boolean {
  const normalized = value.trim();
  return isInlineImageDataUrl(normalized) || isProductImageStorageUrl(normalized);
}



/**
 * Derive login-protected source keys from the fixed distributor catalog.
 * This is the primary source of truth for auth-required sources;
 * it does not depend on local YAML config files.
 *
 * Returns canonical source slugs plus known aliases so backfills can match
 * existing persisted source keys like `petfoodex` or `phillips_crawl4ai`.
 */
export function resolveLoginProtectedSlugsFromCatalog(): string[] {
  return Array.from(
    new Set(
      FIXED_DISTRIBUTOR_CATALOG
        .filter((entry: FixedDistributorEntry) => entry.requiresAuth)
        .flatMap((entry: FixedDistributorEntry) => [entry.sourceSlug, ...entry.aliases])
        .map((slug) => slug.trim())
        .filter((slug) => slug.length > 0)
    )
  );
}

export function resolveLoginProtectedScraperSlugs(configs: ScraperConfigLike[]): string[] {
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

async function loadScraperConfigs(supabase: SupabaseClient): Promise<ScraperConfigLike[]> {
  const dirname = () => {
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  };

  // Try multiple paths: relative to script dir, relative to cwd
  const scriptDir = dirname();
  const possiblePaths = [
    path.resolve(scriptDir, '..', '..', 'scraper', 'scrapers', 'configs'),
    path.resolve(scriptDir, '..', '..', 'apps', 'scraper', 'scrapers', 'configs'),
    path.join(process.cwd(), 'apps/scraper/scrapers/configs'),
    path.join(process.cwd(), '../scraper/scrapers/configs'),
  ];
  let configsDir = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      configsDir = p;
      break;
    }
  }
  if (!configsDir) {
    console.warn('[Login Image Backfill] No scraper configs directory found. Skipping YAML config loading.');
    return [];
  }
  if (!fs.existsSync(configsDir)) {
    return [];
  }

  const filenames = fs
    .readdirSync(configsDir)
    .filter((filename) => filename.endsWith('.yaml') || filename.endsWith('.yml'));

  const configs: ScraperConfigLike[] = [];

  filenames.forEach((filename) => {
    try {
      const fullPath = path.join(configsDir, filename);
      const content = fs.readFileSync(fullPath, 'utf8');
      const parsed = yaml.parse(content);
      const slug = filename.replace(/\.ya?ml$/i, '').trim();
      if (!slug || !isRecord(parsed)) {
        return;
      }

      configs.push({
        slug,
        login: parsed.login,
        requires_login: parsed.requires_login,
        workflows: Array.isArray(parsed.workflows)
          ? parsed.workflows.map((step) => (isRecord(step) ? step : {}))
          : [],
      });
    } catch (error) {
      console.warn(`[Login Image Backfill] Failed to parse scraper config ${filename}:`, error);
    }
  });

  return configs;
}

function sourceRequiresLogin(
  sourceName: string,
  sourcePayload: unknown,
  loginProtectedSet: Set<string>,
): boolean {
  if (loginProtectedSet.has(sourceName)) {
    return true;
  }

  if (!isRecord(sourcePayload)) {
    return false;
  }

  return sourcePayload.requires_login === true;
}

function dedupeTargets(targets: SourceBackfillTarget[]): SourceBackfillTarget[] {
  const byKey = new Map<string, SourceBackfillTarget>();
  targets.forEach((target) => {
    const key = `${target.sourceName}|${target.normalizedUrl}`;
    if (!byKey.has(key)) {
      byKey.set(key, target);
    }
  });
  return Array.from(byKey.values());
}

export async function collectLoginProtectedImageBackfillCandidates(
  rows: ProductsIngestionBackfillRow[],
  loginProtectedScraperSlugs: string[],
): Promise<ProductBackfillCandidate[]> {
  const loginProtectedSet = new Set(loginProtectedScraperSlugs);
  const helpers = await loadProductSourceHelpers();

  return rows.flatMap((row) => {
    const normalizedSources = helpers.normalizeProductSources(row.sources);
    const targets: SourceBackfillTarget[] = [];

    Object.entries(normalizedSources).forEach(([sourceName, sourcePayload]) => {
      if (!sourceRequiresLogin(sourceName, sourcePayload, loginProtectedSet)) {
        return;
      }

      const images = helpers.extractImageCandidatesFromSourcePayload(sourcePayload, 128);
      images.forEach((imageUrl) => {
        const normalizedUrl = helpers.normalizeImageUrl(imageUrl);
        if (!normalizedUrl || isDurableProductImageReference(normalizedUrl)) {
          return;
        }

        targets.push({
          sourceName,
          imageUrl,
          normalizedUrl,
        });
      });
    });

    const dedupedTargets = dedupeTargets(targets);
    if (dedupedTargets.length === 0) {
      return [];
    }

    return [
      {
        productId: row.upc,
        upc: row.upc,
        targets: dedupedTargets,
      },
    ];
  });
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

function resolveBatchSize(options: LoginProtectedImageBackfillOptions): number {
  const requested = options.batchSize ?? 100;
  if (!Number.isFinite(requested) || requested <= 0) {
    return 100;
  }
  return Math.floor(requested);
}

async function loadProductsIngestionRowsBatch(
  supabase: SupabaseClient,
  options: Pick<LoginProtectedImageBackfillOptions, 'upcs' | 'limit'>,
  offset: number,
  batchSize: number,
): Promise<ProductsIngestionBackfillRow[]> {
  let query = supabase
    .from('products_ingestion')
    .select('upc, sources')
    .order('updated_at', { ascending: false })
    .range(offset, offset + batchSize - 1);

  if (options.upcs && options.upcs.length > 0) {
    query = query.in('upc', options.upcs);
  }

  if (typeof options.limit === 'number' && options.limit > 0) {
    const endIndex = Math.max(Math.min(options.limit - 1, offset + batchSize - 1), offset - 1);
    if (endIndex < offset) {
      return [];
    }
    query = query.range(offset, endIndex);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load products_ingestion rows: ${error.message}`);
  }

  return Array.isArray(data) ? (data as ProductsIngestionBackfillRow[]) : [];
}

async function getExistingQueueEntries(
  supabase: SupabaseClient,
  productId: string,
  normalizedUrls: string[],
): Promise<Set<string>> {
  if (normalizedUrls.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('image_retry_queue')
    .select('image_url')
    .eq('upc', productId)
    .in('image_url', normalizedUrls);

  if (error) {
    throw new Error(`Failed to query image_retry_queue for product ${productId}: ${error.message}`);
  }

  const existing = new Set<string>();
  const helpers = await loadProductSourceHelpers();
  (data ?? []).forEach((row) => {
    if (typeof row?.image_url === 'string') {
      existing.add(helpers.normalizeImageUrl(row.image_url));
    }
  });

  return existing;
}

async function insertRetryQueueEntry(
  supabase: SupabaseClient,
  payload: ImageRetryQueueInsert & { last_error: string },
): Promise<void> {
  const withPriority = {
    ...payload,
    priority: 'backfill',
  };

  const { error: priorityError } = await supabase.from('image_retry_queue').insert(withPriority);
  if (!priorityError) {
    return;
  }

  const missingPriorityColumn = /column.+priority|priority.+does not exist/i.test(priorityError.message);
  if (!missingPriorityColumn) {
    throw new Error(`Failed to insert retry queue entry: ${priorityError.message}`);
  }

  const { error: fallbackError } = await supabase.from('image_retry_queue').insert(payload);
  if (fallbackError) {
    throw new Error(`Failed to insert retry queue entry: ${fallbackError.message}`);
  }
}

export async function executeLoginProtectedImageBackfillWithClient(
  supabase: SupabaseClient,
  loginProtectedScraperSlugs: string[],
  options: LoginProtectedImageBackfillOptions,
): Promise<LoginProtectedImageBackfillResult> {
  const batchSize = resolveBatchSize(options);
  const nowIso = new Date().toISOString();

  let offset = 0;
  let batchesProcessed = 0;
  let scannedCount = 0;
  let totalFound = 0;
  let alreadyQueued = 0;
  let newlyQueued = 0;
  let errors = 0;
  const productsWithTargets = new Set<string>();

  while (true) {
    const rows = await loadProductsIngestionRowsBatch(supabase, options, offset, batchSize);
    if (rows.length === 0) {
      break;
    }

    batchesProcessed += 1;
    scannedCount += rows.length;
    offset += rows.length;

    const candidates = await collectLoginProtectedImageBackfillCandidates(rows, loginProtectedScraperSlugs);

    for (const candidate of candidates) {
      productsWithTargets.add(candidate.upc);
      totalFound += candidate.targets.length;

      try {
        const normalizedUrls = candidate.targets.map((target) => target.normalizedUrl);
        const existingEntries = await getExistingQueueEntries(
          supabase,
          candidate.productId,
          normalizedUrls,
        );

        for (const target of candidate.targets) {
          if (existingEntries.has(target.normalizedUrl)) {
            alreadyQueued += 1;
            continue;
          }

          if (options.mode === 'dry-run') {
            newlyQueued += 1;
            continue;
          }

          try {
            await insertRetryQueueEntry(supabase, {
              upc: candidate.productId,
              image_url: target.normalizedUrl,
              error_type: 'auth_401',
              retry_count: 0,
              status: 'pending',
              scheduled_for: nowIso,
              last_error: `backfill: detected non-durable login-protected image for ${candidate.upc}`,
            });
            newlyQueued += 1;
            console.log(
              `[Login Image Backfill] queued upc=${candidate.upc} source=${target.sourceName} url=${target.normalizedUrl}`,
            );
          } catch (error) {
            errors += 1;
            const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
            console.error(
              `[Login Image Backfill] failed to queue upc=${candidate.upc} source=${target.sourceName} url=${target.normalizedUrl}: ${message}`,
            );
          }
        }
      } catch (error) {
        errors += candidate.targets.length;
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        console.error(`[Login Image Backfill] failed to process upc=${candidate.upc}: ${message}`);
      }
    }

    console.log(
      `[Login Image Backfill] batch=${batchesProcessed} scanned=${scannedCount} found=${totalFound} alreadyQueued=${alreadyQueued} queued=${newlyQueued} errors=${errors}`,
    );

    if (rows.length < batchSize) {
      break;
    }

    if (typeof options.limit === 'number' && options.limit > 0 && scannedCount >= options.limit) {
      break;
    }
  }

  return {
    mode: options.mode,
    scannedCount,
    totalFound,
    alreadyQueued,
    newlyQueued,
    errors,
    batchesProcessed,
    batchSize,
    productsWithTargets: productsWithTargets.size,
  };
}

async function runLoginProtectedImageBackfill(
  options: LoginProtectedImageBackfillOptions,
): Promise<LoginProtectedImageBackfillResult> {
  const supabase = createSupabaseAdminClient();

  // Primary source: fixed distributor catalog (doesn't depend on local YAML files)
  const catalogSlugs = resolveLoginProtectedSlugsFromCatalog();

  // Fallback source: local YAML scraper configs (if available)
  const configs = await loadScraperConfigs(supabase);
  const yamlSlugs = resolveLoginProtectedScraperSlugs(configs);

  // Merge both, preferring catalog slugs (canonical names)
  const loginProtectedScraperSlugs = [...new Set([...catalogSlugs, ...yamlSlugs])];

  console.log(
    `[Login Image Backfill] Resolved ${loginProtectedScraperSlugs.length} login-protected scraper slugs: ` +
    `${loginProtectedScraperSlugs.join(', ')} ` +
    `(catalog=${catalogSlugs.length}, yaml=${yamlSlugs.length})`
  );

  return executeLoginProtectedImageBackfillWithClient(
    supabase,
    loginProtectedScraperSlugs,
    options,
  );
}

function parseIntegerFlag(flag: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): LoginProtectedImageBackfillOptions {
  const options: LoginProtectedImageBackfillOptions = {
    mode: 'dry-run',
    batchSize: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--dry-run':
        options.mode = 'dry-run';
        break;
      case '--execute':
        options.mode = 'execute';
        break;
      case '--upc': {
        const upc = argv[index + 1]?.trim();
        if (!upc) {
          throw new Error('Missing value for --upc');
        }
        options.upcs = [...(options.upcs ?? []), upc];
        index += 1;
        break;
      }
      case '--limit':
        options.limit = parseIntegerFlag('--limit', argv[index + 1]);
        index += 1;
        break;
      case '--batch-size':
        options.batchSize = parseIntegerFlag('--batch-size', argv[index + 1]);
        index += 1;
        break;
      case '--help':
      case '-h':
        console.log(
          [
            'Usage:',
            '  node apps/web/scripts/backfill-login-protected-images-logic.ts [options]',
            '',
            'Options:',
            '  --dry-run            Scan and report without inserting queue entries (default mode)',
            '  --execute            Insert queue entries',
            '  --upc <upc>          Limit to a single UPC (repeatable)',
            '  --limit <number>     Maximum products_ingestion rows to scan',
            '  --batch-size <num>   Products processed per batch (default: 100)',
          ].join('\n'),
        );
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runLoginProtectedImageBackfill(options);
  console.log(JSON.stringify(result, null, 2));
}

const isCommonJsEntryPoint = typeof require !== 'undefined' && require.main === module;
const isEsmEntryPoint =
  typeof require === 'undefined' &&
  typeof process.argv[1] === 'string' &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isCommonJsEntryPoint || isEsmEntryPoint) {
  main().catch((error) => {
    console.error('[Login Image Backfill] Failed:', error);
    process.exit(1);
  });
}
