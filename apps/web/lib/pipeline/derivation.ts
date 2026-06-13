/**
 * Pipeline tab derivation helpers.
 *
 * The workflow state is canonical across the database and admin UI. Legacy
 * helpers still exist for compatibility with tests and utility callers.
 */

import type { PersistedPipelineStatus, PipelineStage } from './types';

export const WORKFLOW_PIPELINE_TABS = [
  'imported',
  'extracting',
  'processed',
  'grouping',
  'merging',
  'reviewing',
  'publishing',
  'needs_attention',
  'failed',
] as const;

export type WorkflowPipelineTab = Extract<
  PipelineStage,
  (typeof WORKFLOW_PIPELINE_TABS)[number]
>;

export interface ProductTabDerivationInput {
  pipeline_status?: PersistedPipelineStatus | null;
  id?: string | number | null;
  upc?: string | null;
  in_storefront?: boolean | null;
}

interface ActivePipelineJobs {
  extracting: boolean;
  merging: boolean;
}

interface ActiveJobsLookupOptions {
  enrichmentTable?: string;
  enrichmentUpcColumn?: string;
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

export const ACTIVE_ENRICHMENT_JOB_STATUSES = [
  'queued',
  'running',
] as const;

export const ACTIVE_CONSOLIDATION_STATUSES = [
  'pending',
  'validating',
  'in_progress',
  'finalizing',
] as const;

const DEFAULT_ACTIVE_JOB_LOOKUP_OPTIONS: Required<ActiveJobsLookupOptions> = {
  enrichmentTable: 'enrichment_jobs',
  enrichmentUpcColumn: 'upcs',
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
    extracting: Boolean(activeJobs?.extracting),
    merging: Boolean(activeJobs?.merging),
  };
}

export function deriveTabFromProduct(
  product?: ProductTabDerivationInput | null,
  activeJobs?: Partial<ActivePipelineJobs> | null
): WorkflowPipelineTab {
  void activeJobs;

  switch (product?.pipeline_status) {
    case 'imported':
    case 'awaiting_brand':
      return 'imported';
    case 'extracting':
      return 'extracting';
    case 'processed':
      return 'processed';
    case 'grouping':
      return 'grouping';
    case 'merging':
      return 'merging';
    case 'reviewing':
      return 'reviewing';
    case 'publishing':
      return 'publishing';
    case 'needs_attention':
      return 'needs_attention';
    case 'failed':
      return 'imported'; // failed products show in the first tab for retry
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

  if (!identifiers.id && !identifiers.upc) {
    return { extracting: false, merging: false };
  }

  const lookup = {
    ...DEFAULT_ACTIVE_JOB_LOOKUP_OPTIONS,
    ...options,
  };

  const [extracting, merging] = await Promise.all([
    findActiveEnrichmentJob(identifiers, supabase, lookup),
    findActiveConsolidationJob(identifiers, supabase, lookup),
  ]);

  return { extracting, merging };
}

function getProductIdentifiers(product?: ProductTabDerivationInput | null): {
  id: string | number | null;
  upc: string | null;
} {
  return {
    id:
      typeof product?.id === 'string' || typeof product?.id === 'number'
        ? product.id
        : null,
    upc:
      typeof product?.upc === 'string' && product.upc.trim().length > 0
        ? product.upc.trim()
        : null,
  };
}

async function findActiveEnrichmentJob(
  identifiers: { id: string | number | null; upc: string | null },
  supabase: ActiveJobsSupabaseClient,
  options: Required<ActiveJobsLookupOptions>
): Promise<boolean> {
  const queries: Array<() => ActiveJobsQueryBuilder> = [];

  if (identifiers.upc) {
    const upc = identifiers.upc;

    queries.push(() =>
      supabase
        .from(options.enrichmentTable)
        .select('status')
        .contains(options.enrichmentUpcColumn, [upc])
        .in('status', ACTIVE_ENRICHMENT_JOB_STATUSES)
        .limit(1)
    );
  }

  return runQueryFallbacks(queries);
}

async function findActiveConsolidationJob(
  identifiers: { id: string | number | null; upc: string | null },
  supabase: ActiveJobsSupabaseClient,
  options: Required<ActiveJobsLookupOptions>
): Promise<boolean> {
  const productIds: Array<string | number> = [];

  if (identifiers.id !== null) {
    productIds.push(identifiers.id);
  }

  if (identifiers.upc) {
    productIds.push(identifiers.upc);
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
