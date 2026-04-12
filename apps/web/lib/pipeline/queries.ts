import type { WorkflowPipelineTab } from "@/lib/pipeline/derivation";
import type {
  PersistedPipelineStatus,
  PipelineProduct,
} from "@/lib/pipeline/types";

export interface PipelineTabPagination {
  limit?: number;
  offset?: number;
}

export interface PipelineTabQueryResult {
  tab: WorkflowPipelineTab;
  products: PipelineProduct[];
  count: number;
  durationMs: number;
}

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<Row> {
  data: Row[] | null;
  error: QueryError | null;
  count?: number | null;
}

interface QueryBuilder<Row> extends PromiseLike<QueryResult<Row>> {
  select(
    columns: string,
    options?: { count?: "exact" | "planned" | "estimated" }
  ): QueryBuilder<Row>;
  eq(column: string, value: string): QueryBuilder<Row>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<Row>;
  range(from: number, to: number): QueryBuilder<Row>;
}

export interface PipelineQuerySupabaseClient {
  from<Row = Record<string, unknown>>(table: string): QueryBuilder<Row>;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_OFFSET = 0;

function normalizePagination(pagination?: PipelineTabPagination): {
  limit: number;
  offset: number;
} {
  return {
    limit:
      typeof pagination?.limit === "number" && pagination.limit > 0
        ? Math.floor(pagination.limit)
        : DEFAULT_LIMIT,
    offset:
      typeof pagination?.offset === "number" && pagination.offset >= 0
        ? Math.floor(pagination.offset)
        : DEFAULT_OFFSET,
  };
}

function getStatusForTab(tab: WorkflowPipelineTab): PersistedPipelineStatus {
  return tab;
}

async function queryProductsByStatus(
  supabase: PipelineQuerySupabaseClient,
  status: PersistedPipelineStatus,
  pagination?: PipelineTabPagination
): Promise<{ products: PipelineProduct[]; count: number }> {
  const { limit, offset } = normalizePagination(pagination);

  const { data, error, count } = await supabase
    .from<PipelineProduct>("products_ingestion")
    .select("*", { count: "exact" })
    .eq("pipeline_status", status)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  return {
    products: (data ?? []) as PipelineProduct[],
    count: count ?? 0,
  };
}

async function queryTab(
  tab: WorkflowPipelineTab,
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  const startedAt = Date.now();
  const result = await queryProductsByStatus(
    supabase,
    getStatusForTab(tab),
    pagination
  );

  return {
    tab,
    products: result.products,
    count: result.count,
    durationMs: Date.now() - startedAt,
  };
}

export function queryImportedTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  return queryTab("imported", supabase, pagination);
}

export function queryScrapingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeScrapeIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("scraping", supabase, pagination);
}

export function queryScrapedTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeScrapeIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("scraped", supabase, pagination);
}

export function queryConsolidatingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeConsolidationIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("consolidating", supabase, pagination);
}

export function queryFinalizingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeConsolidationIdentifiers?: unknown,
  _storefrontIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("finalizing", supabase, pagination);
}

export const queryFinalizedTabProducts = queryFinalizingTabProducts;

export function queryExportTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeConsolidationIdentifiers?: unknown,
  _storefrontIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("exporting", supabase, pagination);
}

export function queryFailedTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  return queryTab("failed", supabase, pagination);
}

export function queryProductsForWorkflowTab(
  tab: WorkflowPipelineTab,
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  return queryTab(tab, supabase, pagination);
}

export async function queryWorkflowTabCounts(
  supabase: PipelineQuerySupabaseClient
): Promise<Record<WorkflowPipelineTab, number>> {
  const pagination = { limit: 1, offset: 0 };
  const [
    imported,
    scraping,
    scraped,
    consolidating,
    finalizing,
    exporting,
    failed,
  ] = await Promise.all([
    queryImportedTabProducts(supabase, pagination),
    queryScrapingTabProducts(supabase, pagination),
    queryScrapedTabProducts(supabase, pagination),
    queryConsolidatingTabProducts(supabase, pagination),
    queryFinalizingTabProducts(supabase, pagination),
    queryExportTabProducts(supabase, pagination),
    queryFailedTabProducts(supabase, pagination),
  ]);

  return {
    imported: imported.count,
    scraping: scraping.count,
    scraped: scraped.count,
    consolidating: consolidating.count,
    finalizing: finalizing.count,
    exporting: exporting.count,
    failed: failed.count,
  };
}
