/**
 * Fallback URL Extraction (reused from existing Official Brand infrastructure)
 *
 * Extracts product data from selected URL candidates discovered via SERPER.
 * This is the second phase of the fallback workflow — after URL candidates
 * are reviewed and selected in the URL Review workspace, this endpoint
 * queues fallback extraction jobs on the scraper runner.
 *
 * The extraction runs as `direct_url_extraction` jobs on the runner.
 * See: lib/pipeline/fallback-orchestration.ts for the full fallback flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { scrapeProducts } from "@/lib/pipeline-scraping";
// TODO(Phase 8): remove after migration to enrichment_targets + enrichment_jobs
// import { queueFallbackExtractionJob } from "@/lib/pipeline/fallback-orchestration";
import { normalizeOfficialBrandDomain } from "@/lib/official-brand-workflow";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface StartExtractionRequest {
  cohort_id?: unknown;
  skus?: unknown;
}

interface BrandRelationRow {
  id?: string | null;
  name?: string | null;
  official_domains?: unknown;
  preferred_domains?: unknown;
}

interface CohortLookupRow {
  id?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  brands?: BrandRelationRow | BrandRelationRow[] | null;
}

interface SelectedCandidateRow {
  sku?: string | null;
  url?: string | null;
  candidate_source?: string | null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => toOptionalString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function toSingleBrand(value: CohortLookupRow["brands"]): BrandRelationRow | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeDomainList(...values: Array<unknown>): string[] | undefined {
  const domains: string[] = [];
  const seen = new Set<string>();

  values
    .flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []))
    .forEach((entry) => {
      if (typeof entry !== "string") {
        return;
      }

      const normalized = normalizeOfficialBrandDomain(entry);
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      domains.push(normalized);
    });

  return domains.length > 0 ? domains : undefined;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  let body: StartExtractionRequest;
  try {
    body = (await request.json()) as StartExtractionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cohortId = toOptionalString(body.cohort_id);
  const skus = toStringArray(body.skus);

  if (!cohortId || skus.length === 0) {
    return NextResponse.json(
      { error: "cohort_id and skus are required" },
      { status: 400 },
    );
  }

  const supabase = await createAdminClient();

  const { data: membershipRows, error: membershipError } = await supabase
    .from("products_ingestion")
    .select("sku, cohort_id")
    .in("sku", skus);

  if (membershipError) {
    console.error("[Official Brand Extract] Membership validation failed:", membershipError);
    return NextResponse.json(
      { error: "Failed to validate cohort membership" },
      { status: 500 },
    );
  }

  const membershipBySku = new Map(
    (membershipRows ?? []).map((row) => [row.sku, row.cohort_id]),
  );
  const invalidSkus = skus.filter((sku) => membershipBySku.get(sku) !== cohortId);
  if (invalidSkus.length > 0) {
    return NextResponse.json(
      {
        error: "Official Brand extraction can only run on products from the selected cohort",
        invalid_skus: invalidSkus,
      },
      { status: 400 },
    );
  }

  const { data: cohortData, error: cohortError } = await supabase
    .from("cohort_batches")
    .select("id, brand_name, brand_id, brands(id, name, official_domains, preferred_domains)")
    .eq("id", cohortId)
    .maybeSingle();

  if (cohortError) {
    console.error("[Official Brand Extract] Cohort lookup failed:", cohortError);
    return NextResponse.json({ error: "Failed to load cohort" }, { status: 500 });
  }

  if (!cohortData) {
    return NextResponse.json({ error: "Cohort not found" }, { status: 404 });
  }

  const cohortRow = cohortData as CohortLookupRow;
  const brand = toSingleBrand(cohortRow.brands);
  const brandId = toOptionalString(cohortRow.brand_id) ?? toOptionalString(brand?.id);
  const brandName = toOptionalString(cohortRow.brand_name) ?? toOptionalString(brand?.name);

  if (!brandId || !brandName) {
    return NextResponse.json(
      { error: "Official Brand extraction requires the cohort to have an assigned registry brand" },
      { status: 400 },
    );
  }

  const { data: selectedRows, error: selectedError } = await supabase
    .from("official_brand_url_candidates")
    .select("sku, url, candidate_source")
    .eq("cohort_id", cohortId)
    .eq("selection_status", "selected")
    .in("sku", skus);

  if (selectedError) {
    console.error("[Official Brand Extract] Candidate lookup failed:", selectedError);
    return NextResponse.json(
      { error: "Failed to load selected candidates" },
      { status: 500 },
    );
  }

  const urlsBySku: Record<string, string> = {};
  const urlSourceBySku: Record<string, "manual" | "serper"> = {};
  const duplicateSkus = new Set<string>();
  (selectedRows as SelectedCandidateRow[] | null ?? []).forEach((row) => {
    const sku = toOptionalString(row.sku);
    const url = toOptionalString(row.url);
    if (!sku || !url) {
      return;
    }

    if (urlsBySku[sku]) {
      duplicateSkus.add(sku);
      return;
    }

    urlsBySku[sku] = url;
    urlSourceBySku[sku] = row.candidate_source === "manual" ? "manual" : "serper";
  });

  if (duplicateSkus.size > 0) {
    return NextResponse.json(
      {
        error: "Multiple selected candidates found for one or more SKUs",
        duplicate_skus: Array.from(duplicateSkus),
      },
      { status: 409 },
    );
  }

  const missingSkus = skus.filter((sku) => !urlsBySku[sku]);
  if (missingSkus.length > 0) {
    return NextResponse.json(
      {
        error: "Every SKU must have a selected Official Brand URL before extraction",
        missing_skus: missingSkus,
      },
      { status: 400 },
    );
  }

  const officialDomains = normalizeDomainList(brand?.official_domains);
  const preferredDomains = normalizeDomainList(brand?.preferred_domains);

  try {
    // TODO(Phase 8): replace with enrichment_jobs creation
    // const jobId = await queueFallbackExtractionJob(supabase, skus, {
    //   urlsBySku, urlSourceBySku, cohort: { ... }, approvedBy: ...
    // });
    const jobId = "placeholder_migration_phase"; // Placeholder until enrichment_jobs are ready

    const nowIso = new Date().toISOString();
    const { error: statusError } = await supabase
      .from("products_ingestion")
      .update({ pipeline_status: "extracting", updated_at: nowIso })
      .in("sku", skus)
      .in("pipeline_status", ["url_review", "extracting"]);

    if (statusError) {
      console.error("[Fallback Extract] Failed to move products into extracting:", statusError);
      return NextResponse.json(
        { error: "Failed to mark products as extracting" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      jobIds: [jobId],
      skuCount: skus.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Fallback Extract] Failed to queue extraction job:", err);
    return NextResponse.json(
      { error: `Failed to start fallback extraction: ${message}` },
      { status: 500 },
    );
  }
}
