import type { WorkflowPipelineTab } from "@/lib/pipeline/derivation";
import type {
  PersistedPipelineStatus,
  PipelineProduct,
} from "@/lib/pipeline/types";

interface PipelineTabPagination {
  limit?: number;
  offset?: number;
}

interface PipelineTabQueryResult {
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
  in(column: string, values: string[]): QueryBuilder<Row>;
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

function getStatusesForTab(tab: WorkflowPipelineTab): PersistedPipelineStatus[] {
  if (tab === "imported") {
    return ["imported", "awaiting_brand"];
  }
  return [tab];
}

async function queryProductsByStatuses(
  supabase: PipelineQuerySupabaseClient,
  statuses: PersistedPipelineStatus[],
  pagination?: PipelineTabPagination
): Promise<{ products: PipelineProduct[]; count: number }> {
  const { limit, offset } = normalizePagination(pagination);

  const { data, error, count } = await supabase
    .from<PipelineProduct>("products_ingestion")
    .select("*", { count: "exact" })
    .in("pipeline_status", statuses)
    .order("upc", { ascending: true })
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
  const result = await queryProductsByStatuses(
    supabase,
    getStatusesForTab(tab),
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

function queryExtractingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  return queryTab("extracting", supabase, pagination);
}

function queryProcessedTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeEnrichmentIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("processed", supabase, pagination);
}

function queryMergingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeConsolidationIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("merging", supabase, pagination);
}

function queryReviewingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeConsolidationIdentifiers?: unknown,
  _storefrontIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("reviewing", supabase, pagination);
}

function queryPublishingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  _activeConsolidationIdentifiers?: unknown,
  _storefrontIdentifiers?: unknown
): Promise<PipelineTabQueryResult> {
  return queryTab("publishing", supabase, pagination);
}

function queryFailedTabProducts(
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
    extracting,
    processed,
    merging,
    reviewing,
    publishing,
    failed,
  ] = await Promise.all([
    queryImportedTabProducts(supabase, pagination),
    queryExtractingTabProducts(supabase, pagination),
    queryProcessedTabProducts(supabase, pagination),
    queryMergingTabProducts(supabase, pagination),
    queryReviewingTabProducts(supabase, pagination),
    queryPublishingTabProducts(supabase, pagination),
    queryFailedTabProducts(supabase, pagination),
  ]);

  return {
    imported: imported.count,
    extracting: extracting.count,
    processed: processed.count,
    merging: merging.count,
    reviewing: reviewing.count,
    publishing: publishing.count,
    failed: failed.count,
  };
}
