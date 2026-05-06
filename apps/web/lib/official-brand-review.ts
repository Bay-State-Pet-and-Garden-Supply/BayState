import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNormalizedDomainList } from "@/lib/official-brand-workflow";
import type {
  CandidatesBySkuResponse,
  OfficialBrandCandidateReviewItem,
  OfficialBrandCandidateSource,
  OfficialBrandReviewCohort,
  OfficialBrandReviewSummary,
  OfficialBrandSelectionStatus,
  OfficialBrandSkuReview,
} from "@/lib/official-brand-review-types";

interface BrandRelationRow {
  id?: string | null;
  name?: string | null;
  official_domains?: unknown;
  preferred_domains?: unknown;
}

interface CohortRow {
  id?: string | null;
  name?: string | null;
  brand_name?: string | null;
  brand_id?: string | null;
  brands?: BrandRelationRow | BrandRelationRow[] | null;
}

interface ProductRow {
  sku?: string | null;
  cohort_id?: string | null;
  input?: unknown;
}

interface CandidateRow {
  id?: string | null;
  sku?: string | null;
  cohort_id?: string | null;
  url?: string | null;
  normalized_url?: string | null;
  normalized_domain?: string | null;
  selection_status?: string | null;
  selection_tier?: string | null;
  composite_score?: unknown;
  confidence?: unknown;
  rank?: unknown;
  title?: string | null;
  snippet?: string | null;
  candidate_source?: string | null;
  appeared_in_phases?: unknown;
  predicted_name?: string | null;
  discovery_job_id?: string | null;
  extraction_job_id?: string | null;
  error_message?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  updated_at?: string | null;
}

interface OfficialBrandCandidatesFilters {
  cohortId: string;
  status?: OfficialBrandSelectionStatus;
  discoveryJobId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toOptionalRank(value: unknown): number | null {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function toIntegerArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value
    .map((entry) => toOptionalNumber(entry))
    .filter((entry): entry is number => entry !== null)
    .map((entry) => Math.trunc(entry));

  return numbers.length > 0 ? Array.from(new Set(numbers)).sort((a, b) => a - b) : null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function toSingleBrand(value: CohortRow["brands"]): BrandRelationRow | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}



function getProductName(input: unknown): string | null {
  if (!isRecord(input)) {
    return null;
  }

  return toOptionalString(input.name);
}

function isSelectionStatus(value: unknown): value is OfficialBrandSelectionStatus {
  return (
    value === "candidate" ||
    value === "selected" ||
    value === "rejected" ||
    value === "extracted" ||
    value === "failed"
  );
}

function isCandidateSource(value: unknown): value is OfficialBrandCandidateSource {
  return value === "serper" || value === "manual";
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return direction === "asc" ? left - right : right - left;
}

function sortCandidates(
  candidates: OfficialBrandCandidateReviewItem[],
): OfficialBrandCandidateReviewItem[] {
  return [...candidates].sort((left, right) => {
    const scoreCompare = compareNullableNumbers(
      left.composite_score,
      right.composite_score,
      "desc",
    );
    if (scoreCompare !== 0) return scoreCompare;

    const rankCompare = compareNullableNumbers(left.rank, right.rank, "asc");
    if (rankCompare !== 0) return rankCompare;

    const confidenceCompare = compareNullableNumbers(
      left.confidence,
      right.confidence,
      "desc",
    );
    if (confidenceCompare !== 0) return confidenceCompare;

    return left.url.localeCompare(right.url);
  });
}

function mapCandidate(row: CandidateRow): OfficialBrandCandidateReviewItem | null {
  const id = toOptionalString(row.id);
  const sku = toOptionalString(row.sku);
  const url = toOptionalString(row.url);
  const normalizedUrl = toOptionalString(row.normalized_url);
  const normalizedDomain = toOptionalString(row.normalized_domain);

  if (!id || !sku || !url || !normalizedUrl || !normalizedDomain) {
    return null;
  }

  return {
    id,
    sku,
    url,
    normalized_url: normalizedUrl,
    normalized_domain: normalizedDomain,
    selection_status: isSelectionStatus(row.selection_status)
      ? row.selection_status
      : "candidate",
    selection_tier: toOptionalString(row.selection_tier),
    composite_score: toOptionalNumber(row.composite_score),
    confidence: toOptionalNumber(row.confidence),
    rank: toOptionalRank(row.rank),
    title: toOptionalString(row.title),
    snippet: toOptionalString(row.snippet),
    candidate_source: isCandidateSource(row.candidate_source)
      ? row.candidate_source
      : "serper",
    appeared_in_phases: toIntegerArray(row.appeared_in_phases),
    discovery_job_id: toOptionalString(row.discovery_job_id),
    extraction_job_id: toOptionalString(row.extraction_job_id),
    error_message: toOptionalString(row.error_message),
    reviewed_at: toOptionalString(row.reviewed_at),
    reviewed_by: toOptionalString(row.reviewed_by),
  };
}

function summarize(skus: OfficialBrandSkuReview[]): OfficialBrandReviewSummary {
  return {
    total_skus: skus.length,
    skus_with_selection: skus.filter((entry) =>
      entry.candidates.some((candidate) => candidate.selection_status === "selected"),
    ).length,
    skus_without_candidates: skus.filter((entry) => entry.candidate_count === 0)
      .length,
    skus_reviewed: skus.filter((entry) => entry.has_been_reviewed).length,
    skus_extracted: skus.filter((entry) =>
      entry.candidates.some((candidate) => candidate.selection_status === "extracted"),
    ).length,
  };
}

function buildSkuReview(args: {
  sku: string;
  cohortId: string;
  productName: string | null;
  candidates: OfficialBrandCandidateReviewItem[];
}): OfficialBrandSkuReview {
  const candidates = sortCandidates(args.candidates);
  const selected = candidates.find(
    (candidate) => candidate.selection_status === "selected",
  );

  return {
    sku: args.sku,
    product_name: args.productName,
    register_name: args.productName,
    predicted_name: null,
    cohort_id: args.cohortId,
    candidates,
    selected_url: selected?.url ?? null,
    candidate_count: candidates.length,
    has_been_reviewed: candidates.some((candidate) => Boolean(candidate.reviewed_at)),
  };
}

function getPredictedNameBySku(candidateRows: CandidateRow[]): Map<string, string> {
  const predictedBySku = new Map<string, string>();
  candidateRows.forEach((row) => {
    const sku = toOptionalString(row.sku);
    const predictedName = toOptionalString(row.predicted_name);
    if (sku && predictedName && !predictedBySku.has(sku)) {
      predictedBySku.set(sku, predictedName);
    }
  });
  return predictedBySku;
}

export async function loadOfficialBrandCandidates(
  supabase: SupabaseClient,
  filters: OfficialBrandCandidatesFilters,
): Promise<CandidatesBySkuResponse> {
  const cohortId = filters.cohortId.trim();
  if (!cohortId) {
    throw new Error("cohort_id is required");
  }

  const { data: cohortData, error: cohortError } = await supabase
    .from("cohort_batches")
    .select(
      "id, name, brand_name, brand_id, brands(id, name, official_domains, preferred_domains)",
    )
    .eq("id", cohortId)
    .maybeSingle();

  if (cohortError) {
    throw new Error(`Failed to load cohort: ${cohortError.message}`);
  }

  if (!cohortData) {
    throw new Error("Cohort not found");
  }

  const cohortRow = cohortData as CohortRow;
  const brand = toSingleBrand(cohortRow.brands);
  const officialDomains = buildNormalizedDomainList(
    toStringList(brand?.official_domains),
  );
  const preferredDomains = buildNormalizedDomainList(toStringList(brand?.preferred_domains));
  const cohort: OfficialBrandReviewCohort = {
    id: cohortId,
    name: toOptionalString(cohortRow.name),
    brand_name:
      toOptionalString(cohortRow.brand_name) ??
      toOptionalString(brand?.name) ??
      "Unknown Brand",
    official_domains: officialDomains,
    preferred_domains: preferredDomains,
  };

  const productsResult = await supabase
    .from("products_ingestion")
    .select("sku, cohort_id, input")
    .eq("cohort_id", cohortId)
    .in("pipeline_status", ["url_review", "extracting"])
    .order("sku", { ascending: true });

  if (productsResult.error) {
    throw new Error(`Failed to load cohort products: ${productsResult.error.message}`);
  }

  const productRows = Array.isArray(productsResult.data)
    ? (productsResult.data as ProductRow[])
    : [];
  const productsBySku = new Map<string, string | null>();
  productRows.forEach((row) => {
    const sku = toOptionalString(row.sku);
    if (sku) {
      productsBySku.set(sku, getProductName(row.input));
    }
  });

  const activeSkus = Array.from(productsBySku.keys());
  let candidateRows: CandidateRow[] = [];

  if (activeSkus.length > 0) {
    let query = supabase
      .from("official_brand_url_candidates")
      .select(
        "id, sku, cohort_id, url, normalized_url, normalized_domain, selection_status, selection_tier, composite_score, confidence, rank, title, snippet, candidate_source, appeared_in_phases, predicted_name, discovery_job_id, extraction_job_id, error_message, reviewed_at, reviewed_by, updated_at",
      )
      .eq("cohort_id", cohortId)
      .in("sku", activeSkus);

    if (filters.status) {
      query = query.eq("selection_status", filters.status);
    }

    if (filters.discoveryJobId) {
      query = query.eq("discovery_job_id", filters.discoveryJobId);
    }

    const candidatesResult = await query;

    if (candidatesResult.error) {
      throw new Error(
        `Failed to load Official Brand candidates: ${candidatesResult.error.message}`,
      );
    }

    candidateRows = Array.isArray(candidatesResult.data)
      ? (candidatesResult.data as CandidateRow[])
      : [];
  }

  const predictedBySku = getPredictedNameBySku(candidateRows);

  const candidatesBySku = new Map<string, OfficialBrandCandidateReviewItem[]>();
  candidateRows.forEach((row) => {
    const candidate = mapCandidate(row);
    if (!candidate) {
      return;
    }

    const existing = candidatesBySku.get(candidate.sku) ?? [];
    existing.push(candidate);
    candidatesBySku.set(candidate.sku, existing);
  });

  // Use products_ingestion as the authoritative SKU list. Stale candidate rows
  // for inactive pipeline statuses must not resurrect ghost SKUs.
  const allSkus = Array.from(productsBySku.keys()).sort((left, right) =>
    left.localeCompare(right),
  );

  const skus = allSkus.map((sku) => {
    const review = buildSkuReview({
      sku,
      cohortId,
      productName: productsBySku.get(sku) ?? null,
      candidates: candidatesBySku.get(sku) ?? [],
    });
    return {
      ...review,
      predicted_name: predictedBySku.get(sku) ?? review.predicted_name,
    };
  });

  return {
    skus,
    cohort,
    summary: summarize(skus),
  };
}
