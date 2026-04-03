import {
  ACTIVE_CONSOLIDATION_STATUSES,
  ACTIVE_SCRAPE_JOB_STATUSES,
  type WorkflowPipelineTab,
} from "@/lib/pipeline/derivation";
import type { PipelineProduct } from "@/lib/pipeline/types";

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

interface QueryBuilder<Row>
  extends PromiseLike<QueryResult<Row>> {
  select(columns: string, options?: { count?: "exact" | "planned" | "estimated" }): QueryBuilder<Row>;
  eq(column: string, value: string): QueryBuilder<Row>;
  in(column: string, values: readonly string[]): QueryBuilder<Row>;
  not(column: string, operator: string, value: string): QueryBuilder<Row>;
  or(filters: string): QueryBuilder<Row>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<Row>;
  range(from: number, to: number): QueryBuilder<Row>;
}

export interface PipelineQuerySupabaseClient {
  from<Row = Record<string, unknown>>(
    table: string
  ): QueryBuilder<Row>;
}

interface ActiveIdentifiers {
  ids: string[];
  skus: string[];
}

const DEFAULT_LIMIT = 100;
const DEFAULT_OFFSET = 0;
const EMPTY_IDENTIFIERS: ActiveIdentifiers = { ids: [], skus: [] };
const NON_FATAL_CODES = new Set(["42P01", "42703", "PGRST204"]);

export async function queryImportedTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  const startedAt = Date.now();
  const result = await queryProductsByStatus(supabase, "imported", pagination);

  return {
    tab: "imported",
    products: result.products,
    count: result.count,
    durationMs: Date.now() - startedAt,
  };
}

export async function queryScrapingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  activeScrapeIdentifiers?: ActiveIdentifiers
): Promise<PipelineTabQueryResult> {
  const startedAt = Date.now();
  const resolvedActiveScrapeIdentifiers =
    activeScrapeIdentifiers ?? await getActiveScrapeIdentifiers(supabase);

  const result = await queryProductsByStatus(supabase, "scraped", pagination, {
    include: resolvedActiveScrapeIdentifiers,
  });

  return {
    tab: "scraping",
    products: result.products,
    count: result.count,
    durationMs: Date.now() - startedAt,
  };
}

export async function queryScrapedTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  activeScrapeIdentifiers?: ActiveIdentifiers
): Promise<PipelineTabQueryResult> {
  const startedAt = Date.now();
  const resolvedActiveScrapeIdentifiers =
    activeScrapeIdentifiers ?? await getActiveScrapeIdentifiers(supabase);

  const result = await queryProductsByStatus(supabase, "scraped", pagination, {
    exclude: resolvedActiveScrapeIdentifiers,
  });

  return {
    tab: "scraped",
    products: result.products,
    count: result.count,
    durationMs: Date.now() - startedAt,
  };
}

export async function queryConsolidatingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  activeConsolidationIdentifiers?: ActiveIdentifiers
): Promise<PipelineTabQueryResult> {
  const startedAt = Date.now();
  const resolvedActiveConsolidationIdentifiers =
    activeConsolidationIdentifiers
    ?? await getActiveConsolidationIdentifiers(supabase);

  const result = await queryProductsByStatus(supabase, "finalized", pagination, {
    include: resolvedActiveConsolidationIdentifiers,
  });

  return {
    tab: "consolidating",
    products: result.products,
    count: result.count,
    durationMs: Date.now() - startedAt,
  };
}

export async function queryFinalizingTabProducts(
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination,
  activeConsolidationIdentifiers?: ActiveIdentifiers
): Promise<PipelineTabQueryResult> {
  const startedAt = Date.now();
  const resolvedActiveConsolidationIdentifiers =
    activeConsolidationIdentifiers
    ?? await getActiveConsolidationIdentifiers(supabase);

  const result = await queryProductsByStatus(supabase, "finalized", pagination, {
    exclude: resolvedActiveConsolidationIdentifiers,
  });

  return {
    tab: "finalizing",
    products: result.products,
    count: result.count,
    durationMs: Date.now() - startedAt,
  };
}

export async function queryProductsForWorkflowTab(
  tab: WorkflowPipelineTab,
  supabase: PipelineQuerySupabaseClient,
  pagination?: PipelineTabPagination
): Promise<PipelineTabQueryResult> {
  switch (tab) {
    case "imported":
      return queryImportedTabProducts(supabase, pagination);
    case "scraping":
      return queryScrapingTabProducts(supabase, pagination);
    case "scraped":
      return queryScrapedTabProducts(supabase, pagination);
    case "consolidating":
      return queryConsolidatingTabProducts(supabase, pagination);
    case "finalizing":
      return queryFinalizingTabProducts(supabase, pagination);
    default:
      return queryImportedTabProducts(supabase, pagination);
  }
}

export async function queryWorkflowTabCounts(
  supabase: PipelineQuerySupabaseClient
): Promise<Record<WorkflowPipelineTab, number>> {
  const pagination = { limit: 1, offset: 0 };
  const [activeScrapeIdentifiers, activeConsolidationIdentifiers] =
    await Promise.all([
      getActiveScrapeIdentifiers(supabase),
      getActiveConsolidationIdentifiers(supabase),
    ]);

  const [imported, scraping, scraped, consolidating, finalizing] =
    await Promise.all([
      queryImportedTabProducts(supabase, pagination),
      queryScrapingTabProducts(supabase, pagination, activeScrapeIdentifiers),
      queryScrapedTabProducts(supabase, pagination, activeScrapeIdentifiers),
      queryConsolidatingTabProducts(supabase, pagination, activeConsolidationIdentifiers),
      queryFinalizingTabProducts(supabase, pagination, activeConsolidationIdentifiers),
    ]);

  return {
    imported: imported.count,
    scraping: scraping.count,
    scraped: scraped.count,
    consolidating: consolidating.count,
    finalizing: finalizing.count,
  };
}

async function getActiveScrapeIdentifiers(
  supabase: PipelineQuerySupabaseClient
): Promise<ActiveIdentifiers> {
  const query = supabase
    .from<{ product_id?: string | null; skus?: unknown }>("scrape_jobs")
    .select("product_id, skus")
    .in("status", ACTIVE_SCRAPE_JOB_STATUSES);

  const { data, error } = await query;

  if (error) {
    if (isNonFatalQueryError(error)) {
      return EMPTY_IDENTIFIERS;
    }

    throw new Error(error.message);
  }

  const idSet = new Set<string>();
  const skuSet = new Set<string>();

  for (const row of data ?? []) {
    if (typeof row.product_id === "string" && row.product_id.trim().length > 0) {
      idSet.add(row.product_id);
    }

    const skus = toStringArray(row.skus);
    for (const sku of skus) {
      skuSet.add(sku);
    }
  }

  return {
    ids: Array.from(idSet),
    skus: Array.from(skuSet),
  };
}

async function getActiveConsolidationIdentifiers(
  supabase: PipelineQuerySupabaseClient
): Promise<ActiveIdentifiers> {
  const query = supabase
    .from<{ product_ids?: unknown }>("consolidation_batches")
    .select("product_ids")
    .in("status", ACTIVE_CONSOLIDATION_STATUSES);

  const { data, error } = await query;

  if (error) {
    if (isNonFatalQueryError(error)) {
      return EMPTY_IDENTIFIERS;
    }

    throw new Error(error.message);
  }

  const idSet = new Set<string>();
  const skuSet = new Set<string>();

  for (const row of data ?? []) {
    const identifiers = toStringArray(row.product_ids);
    for (const identifier of identifiers) {
      if (looksLikeUuid(identifier)) {
        idSet.add(identifier);
      } else {
        skuSet.add(identifier);
      }
    }
  }

  return {
    ids: Array.from(idSet),
    skus: Array.from(skuSet),
  };
}

async function queryProductsByStatus(
  supabase: PipelineQuerySupabaseClient,
  status: "imported" | "scraped" | "finalized",
  pagination?: PipelineTabPagination,
  options?: {
    include?: ActiveIdentifiers;
    exclude?: ActiveIdentifiers;
  }
): Promise<{ products: PipelineProduct[]; count: number }> {
  const { limit, offset } = normalizePagination(pagination);
  const include = options?.include ?? EMPTY_IDENTIFIERS;
  const exclude = options?.exclude ?? EMPTY_IDENTIFIERS;

  if (
    options?.include
    && include.ids.length === 0
    && include.skus.length === 0
  ) {
    return { products: [], count: 0 };
  }

  let query = supabase
    .from<PipelineProduct>("products_ingestion")
    .select("*", { count: "exact" })
    .eq("pipeline_status", status)
    .order("updated_at", { ascending: false });

  if (include.ids.length > 0 && include.skus.length > 0) {
    query = query.or(
      `id.in.${toInFilterList(include.ids)},sku.in.${toInFilterList(include.skus)}`
    );
  } else if (include.ids.length > 0) {
    query = query.in("id", include.ids);
  } else if (include.skus.length > 0) {
    query = query.in("sku", include.skus);
  }

  if (exclude.ids.length > 0) {
    query = query.not("id", "in", toInFilterList(exclude.ids));
  }

  if (exclude.skus.length > 0) {
    query = query.not("sku", "in", toInFilterList(exclude.skus));
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  return {
    products: (data ?? []) as PipelineProduct[],
    count: count ?? 0,
  };
}

function normalizePagination(pagination?: PipelineTabPagination): {
  limit: number;
  offset: number;
} {
  const limit =
    typeof pagination?.limit === "number" && pagination.limit > 0
      ? Math.floor(pagination.limit)
      : DEFAULT_LIMIT;

  const offset =
    typeof pagination?.offset === "number" && pagination.offset >= 0
      ? Math.floor(pagination.offset)
      : DEFAULT_OFFSET;

  return { limit, offset };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toInFilterList(values: readonly string[]): string {
  return `(${values.map(quotePostgrestValue).join(",")})`;
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isNonFatalQueryError(error: QueryError): boolean {
  if (error.code && NON_FATAL_CODES.has(error.code)) {
    return true;
  }

  return /does not exist|could not find/i.test(error.message);
}
