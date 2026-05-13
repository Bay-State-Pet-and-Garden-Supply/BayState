import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { normalizeOfficialBrandUrl } from "@/lib/official-brand-workflow";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AddManualUrlRequest {
  sku?: unknown;
  url?: unknown;
  cohort_id?: unknown;
}

interface CohortLookupRow {
  id?: string | null;
  brand_id?: string | null;
  brands?: { id?: string | null } | Array<{ id?: string | null }> | null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toSingleBrand(
  value: CohortLookupRow["brands"],
): { id?: string | null } | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  let body: AddManualUrlRequest;
  try {
    body = (await request.json()) as AddManualUrlRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const sku = toOptionalString(body.sku);
  const url = toOptionalString(body.url);
  const cohortId = toOptionalString(body.cohort_id);

  if (!sku || !url || !cohortId) {
    return NextResponse.json(
      { error: "sku, url, and cohort_id are required" },
      { status: 400 },
    );
  }

  const normalized = normalizeOfficialBrandUrl(url);
  if (!normalized) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data: product, error: productError } = await supabase
    .from("products_ingestion")
    .select("sku, cohort_id")
    .eq("sku", sku)
    .maybeSingle();

  if (productError) {
    console.error("[Official Brand Add URL] Product lookup failed:", productError);
    return NextResponse.json({ error: "Failed to validate product" }, { status: 500 });
  }

  if (!product || product.cohort_id !== cohortId) {
    return NextResponse.json(
      { error: "SKU does not belong to the requested cohort" },
      { status: 400 },
    );
  }

  const { data: cohort, error: cohortError } = await supabase
    .from("cohort_batches")
    .select("id, brand_id, brands(id)")
    .eq("id", cohortId)
    .maybeSingle();

  if (cohortError) {
    console.error("[Official Brand Add URL] Cohort lookup failed:", cohortError);
    return NextResponse.json({ error: "Failed to validate cohort" }, { status: 500 });
  }

  if (!cohort) {
    return NextResponse.json({ error: "Cohort not found" }, { status: 404 });
  }

  const cohortRow = cohort as CohortLookupRow;
  const brand = toSingleBrand(cohortRow.brands);
  const nowIso = new Date().toISOString();
  const reviewedBy = auth.user.email ?? auth.user.id;

  const { error: clearError } = await supabase
    .from("official_brand_url_candidates")
    .update({ selection_status: "candidate", updated_at: nowIso })
    .eq("sku", sku)
    .eq("selection_status", "selected")
    .neq("normalized_url", normalized.normalizedUrl);

  if (clearError) {
    console.error("[Official Brand Add URL] Failed to clear previous selection:", clearError);
    return NextResponse.json(
      { error: "Failed to clear previous selection" },
      { status: 500 },
    );
  }

  const row = {
    sku,
    cohort_id: cohortId,
    brand_id: toOptionalString(cohortRow.brand_id) ?? toOptionalString(brand?.id),
    url: normalized.url,
    normalized_url: normalized.normalizedUrl,
    normalized_domain: normalized.normalizedDomain,
    candidate_source: "manual",
    selection_status: "selected",
    reviewed_at: nowIso,
    reviewed_by: reviewedBy,
    metadata: { source: "official_brand_review_manual_url" },
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from("official_brand_url_candidates")
    .upsert(row, { onConflict: "sku,normalized_url" })
    .select(
      "id, sku, cohort_id, url, normalized_url, normalized_domain, selection_status, selection_tier, composite_score, confidence, rank, title, snippet, candidate_source, appeared_in_phases, discovery_job_id, extraction_job_id, error_message, reviewed_at, reviewed_by",
    )
    .single();

  if (error) {
    console.error("[Official Brand Add URL] Insert failed:", error);
    return NextResponse.json({ error: "Failed to add URL" }, { status: 500 });
  }

  return NextResponse.json({ success: true, candidate: data });
}
