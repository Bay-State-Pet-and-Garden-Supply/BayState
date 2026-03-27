import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import yaml from 'yaml';
import type { ImageRetryQueueInsert } from '../lib/supabase/database.types';

export type BackfillMode = 'dry-run' | 'execute';

interface ProductsIngestionBackfillRow {
  sku: string;
  sources: unknown;
}

interface SourceBackfillTarget {
  sourceName: string;
  imageUrl: string;
  normalizedUrl: string;
}

interface ProductBackfillCandidate {
  productId: string;
  sku: string;
  targets: SourceBackfillTarget[];
}

interface ProductSourceHelpers {
  extractImageCandidatesFromSourcePayload: (rawSource: unknown, max?: number) => string[];
  normalizeImageUrl: (url: string) => string;
  normalizeProductSources: (rawSources: unknown) => Record<string, unknown>;
}

export interface LoginProtectedImageBackfillOptions {
  mode: BackfillMode;
  skus?: string[];
  limit?: number;
  batchSize?: number;
}

export interface LoginProtectedImageBackfillResult {
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

function isProductImageStorageUrl(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.includes('/storage/v1/object/public/product-images/') ||
    normalized.includes('/storage/v1/render/image/public/product-images/')
  );
}

function isDurableProductImageReference(value: string): boolean {
  const normalized = value.trim();
  return isInlineImageDataUrl(normalized) || isProductImageStorageUrl(normalized);
}

function scraperConfigRequiresLogin(config: ScraperConfigLike): boolean {
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

async function loadLocalScraperConfigs(): Promise<ScraperConfigLike[]> {
  const configsDir = path.join(process.cwd(), 'apps/scraper/scrapers/configs');
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
        productId: row.sku,
        sku: row.sku,
        targets: dedupedTargets,
      },
    ];
  });
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

function resolveBatchSize(options: LoginProtectedImageBackfillOptions): number {
  const requested = options.batchSize ?? 100;
  if (!Number.isFinite(requested) || requested <= 0) {
    return 100;
  }
  return Math.floor(requested);
}

async function loadProductsIngestionRowsBatch(
  supabase: SupabaseClient,
  options: Pick<LoginProtectedImageBackfillOptions, 'skus' | 'limit'>,
  offset: number,
  batchSize: number,
): Promise<ProductsIngestionBackfillRow[]> {
  let query = supabase
    .from('products_ingestion')
    .select('sku, sources')
    .order('updated_at', { ascending: false })
    .range(offset, offset + batchSize - 1);

  if (options.skus && options.skus.length > 0) {
    query = query.in('sku', options.skus);
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
    .eq('sku', productId)
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
      productsWithTargets.add(candidate.sku);
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
              sku: candidate.productId,
              image_url: target.normalizedUrl,
              error_type: 'not_found_404',
              retry_count: 0,
              status: 'pending',
              scheduled_for: nowIso,
              last_error: `backfill: detected non-durable login-protected image for ${candidate.sku}`,
            });
            newlyQueued += 1;
            console.log(
              `[Login Image Backfill] queued sku=${candidate.sku} source=${target.sourceName} url=${target.normalizedUrl}`,
            );
          } catch (error) {
            errors += 1;
            const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
            console.error(
              `[Login Image Backfill] failed to queue sku=${candidate.sku} source=${target.sourceName} url=${target.normalizedUrl}: ${message}`,
            );
          }
        }
      } catch (error) {
        errors += candidate.targets.length;
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        console.error(`[Login Image Backfill] failed to process sku=${candidate.sku}: ${message}`);
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

export async function runLoginProtectedImageBackfill(
  options: LoginProtectedImageBackfillOptions,
): Promise<LoginProtectedImageBackfillResult> {
  const supabase = createSupabaseAdminClient();
  const configs = await loadLocalScraperConfigs();
  const loginProtectedScraperSlugs = resolveLoginProtectedScraperSlugs(configs);

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
    mode: 'execute',
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
      case '--sku': {
        const sku = argv[index + 1]?.trim();
        if (!sku) {
          throw new Error('Missing value for --sku');
        }
        options.skus = [...(options.skus ?? []), sku];
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
            '  --dry-run            Scan and report without inserting queue entries',
            '  --execute            Insert queue entries (default mode)',
            '  --sku <sku>          Limit to a single SKU (repeatable)',
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
