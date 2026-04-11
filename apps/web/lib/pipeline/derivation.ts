/**
 * Pipeline tab derivation helpers.
 *
 * Persisted ingestion statuses stay canonical in the database while admin tabs
 * are derived from the current product status plus any active background work.
 */

import type { PersistedPipelineStatus, PipelineStage } from './types';

export const WORKFLOW_PIPELINE_TABS = [
  'imported',
  'scraping',
  'scraped',
  'consolidating',
  'finalized',
  'export',
  'failed',
] as const;

export type WorkflowPipelineTab = Extract<
  PipelineStage,
  (typeof WORKFLOW_PIPELINE_TABS)[number]
>;

export interface ProductTabDerivationInput {
  pipeline_status?: PersistedPipelineStatus | null;
  id?: string | number | null;
  sku?: string | null;
  in_storefront?: boolean | null;
}

export interface ActivePipelineJobs {
  scraping: boolean;
  consolidation: boolean;
}

export interface ActiveJobsLookupOptions {
  scrapeTable?: string;
  scrapeProductIdColumn?: string;
  scrapeSkuArrayColumn?: string;
  consolidationTable?: string;
  consolidationProductIdsColumn?: string;
}

export interface ActiveJobsQueryError {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
}

export interface ActiveJobsQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  data: Row[] | null;
  error: ActiveJobsQueryError | null;
}

export interface ActiveJobsQueryBuilder<
  Row extends Record<string, unknown> = Record<string, unknown>,
> extends PromiseLike<ActiveJobsQueryResult<Row>> {
  select(columns: string): ActiveJobsQueryBuilder<Row>;
  eq(column: string, value: string | number): ActiveJobsQueryBuilder<Row>;
  in(column: string, values: readonly string[]): ActiveJobsQueryBuilder<Row>;
  contains(
    column: string,
    value: readonly (string | number)[]
  ): ActiveJobsQueryBuilder<Row>;
  limit(count: number): ActiveJobsQueryBuilder<Row>;
}

export interface ActiveJobsSupabaseClient {
  from<Row extends Record<string, unknown> = Record<string, unknown>>(
    table: string
  ): ActiveJobsQueryBuilder<Row>;
}

export const ACTIVE_SCRAPE_JOB_STATUSES = [
  'pending',
  'claimed',
  'running',
] as const;

export const ACTIVE_CONSOLIDATION_STATUSES = [
  'pending',
  'validating',
  'in_progress',
  'finalizing',
] as const;

const DEFAULT_ACTIVE_JOB_LOOKUP_OPTIONS: Required<ActiveJobsLookupOptions> = {
  scrapeTable: 'scrape_jobs',
  scrapeProductIdColumn: 'product_id',
  scrapeSkuArrayColumn: 'skus',
  consolidationTable: 'consolidation_batches',
  consolidationProductIdsColumn: 'product_ids',
};

const NON_FATAL_QUERY_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204']);

const NON_FATAL_QUERY_ERROR_MESSAGE_SNIPPETS = [
  'does not exist',
  'could not find the table',
  'could not find the relation',
  'column',
];

export function normalizeActiveJobs(
  activeJobs?: Partial<ActivePipelineJobs> | null
): ActivePipelineJobs {
  return {
    scraping: Boolean(activeJobs?.scraping),
    consolidation: Boolean(activeJobs?.consolidation),
  };
}

export function deriveTabFromProduct(
  product?: ProductTabDerivationInput | null,
  activeJobs?: Partial<ActivePipelineJobs> | null
): WorkflowPipelineTab {
  const resolvedActiveJobs = normalizeActiveJobs(activeJobs);

  switch (product?.pipeline_status) {
    case 'imported':
      return 'imported';
    case 'scraped':
      return resolvedActiveJobs.scraping ? 'scraping' : 'scraped';
    case 'finalized':
      if (resolvedActiveJobs.consolidation) {
        return 'consolidating';
      }
      return product?.in_storefront ? 'export' : 'finalized';
    case 'failed':
      return 'failed';
    default:
      return 'imported';
  }
}

export async function getActiveJobsForProduct(
  product: ProductTabDerivationInput | null | undefined,
  supabase: ActiveJobsSupabaseClient,
  options?: ActiveJobsLookupOptions
): Promise<ActivePipelineJobs> {
  const identifiers = getProductIdentifiers(product);

  if (!identifiers.id && !identifiers.sku) {
    return { scraping: false, consolidation: false };
  }

  const lookup = {
    ...DEFAULT_ACTIVE_JOB_LOOKUP_OPTIONS,
    ...options,
  };

  const [scraping, consolidation] = await Promise.all([
    findActiveScrapeJob(identifiers, supabase, lookup),
    findActiveConsolidationJob(identifiers, supabase, lookup),
  ]);

  return { scraping, consolidation };
}

function getProductIdentifiers(product?: ProductTabDerivationInput | null): {
  id: string | number | null;
  sku: string | null;
} {
  return {
    id:
      typeof product?.id === 'string' || typeof product?.id === 'number'
        ? product.id
        : null,
    sku:
      typeof product?.sku === 'string' && product.sku.trim().length > 0
        ? product.sku.trim()
        : null,
  };
}

async function findActiveScrapeJob(
  identifiers: { id: string | number | null; sku: string | null },
  supabase: ActiveJobsSupabaseClient,
  options: Required<ActiveJobsLookupOptions>
): Promise<boolean> {
  const queries: Array<() => ActiveJobsQueryBuilder> = [];

  if (identifiers.id !== null) {
    const productId = identifiers.id;

    queries.push(() =>
      supabase
        .from(options.scrapeTable)
        .select('status')
        .eq(options.scrapeProductIdColumn, productId)
        .in('status', ACTIVE_SCRAPE_JOB_STATUSES)
        .limit(1)
    );
  }

  if (identifiers.sku) {
    const sku = identifiers.sku;

    queries.push(() =>
      supabase
        .from(options.scrapeTable)
        .select('status')
        .contains(options.scrapeSkuArrayColumn, [sku])
        .in('status', ACTIVE_SCRAPE_JOB_STATUSES)
        .limit(1)
    );
  }

  return runQueryFallbacks(queries);
}

async function findActiveConsolidationJob(
  identifiers: { id: string | number | null; sku: string | null },
  supabase: ActiveJobsSupabaseClient,
  options: Required<ActiveJobsLookupOptions>
): Promise<boolean> {
  const productIds: Array<string | number> = [];

  if (identifiers.id !== null) {
    productIds.push(identifiers.id);
  }

  if (identifiers.sku) {
    productIds.push(identifiers.sku);
  }

  const queries = productIds.map(
    (productId) =>
      () =>
        supabase
          .from(options.consolidationTable)
          .select('status')
          .contains(options.consolidationProductIdsColumn, [productId])
          .in('status', ACTIVE_CONSOLIDATION_STATUSES)
          .limit(1)
  );

  return runQueryFallbacks(queries);
}

async function runQueryFallbacks(
  queries: Array<() => ActiveJobsQueryBuilder>
): Promise<boolean> {
  for (const buildQuery of queries) {
    const hasMatch = await queryHasRows(buildQuery());
    if (hasMatch) {
      return true;
    }
  }

  return false;
}

async function queryHasRows(
  query: ActiveJobsQueryBuilder
): Promise<boolean> {
  const { data, error } = await query;

  if (error) {
    if (isNonFatalQueryError(error)) {
      return false;
    }

    throw new Error(error.message);
  }

  return Array.isArray(data) && data.length > 0;
}

function isNonFatalQueryError(error: ActiveJobsQueryError): boolean {
  if (error.code && NON_FATAL_QUERY_ERROR_CODES.has(error.code)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return NON_FATAL_QUERY_ERROR_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet)
  );
}
