import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CohortSummaryRow {
  cohort_id: string;
  name: string | null;
  brand_name: string | null;
  product_count: number;
  skus_with_selection: number;
  skus_extracted: number;
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products_ingestion")
    .select("sku, cohort_id")
    .eq("pipeline_status", "url_review");

  if (error) {
    console.error("[URL Review Cohorts] Failed to load products:", error);
    return NextResponse.json({ error: "Failed to load review queue" }, { status: 500 });
  }

  if (!products || products.length === 0) {
    return NextResponse.json({ cohorts: [] });
  }

  const rawRows = products as Array<{ sku?: string | null; cohort_id?: string | null }>;

  const cohortIds = Array.from(
    new Set(rawRows.map((row) => row.cohort_id).filter(Boolean) as string[]),
  );

  if (cohortIds.length === 0) {
    return NextResponse.json({ cohorts: [] });
  }

  const { data: cohortRows, error: cohortError } = await supabase
    .from("cohort_batches")
    .select("id, name, brand_name, brands(name)")
    .in("id", cohortIds);

  if (cohortError) {
    console.error("[URL Review Cohorts] Failed to load cohort metadata:", cohortError);
    return NextResponse.json({ error: "Failed to load cohort metadata" }, { status: 500 });
  }

  const cohortMeta = new Map<string, { name: string | null; brand_name: string | null }>();
  const rawCohortRows = (cohortRows ?? []) as Array<{
    id?: string | null;
    name?: string | null;
    brand_name?: string | null;
    brands?: { name?: string | null } | Array<{ name?: string | null }> | null;
  }>;

  rawCohortRows.forEach((row) => {
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
    if (!id) return;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
    let brandName = typeof row.brand_name === "string" && row.brand_name.trim() ? row.brand_name.trim() : null;

    if (!brandName && row.brands) {
      const b = Array.isArray(row.brands) ? row.brands[0] : row.brands;
      brandName = (typeof b?.name === "string" && b.name.trim()) ? b.name.trim() : null;
    }

    cohortMeta.set(id, { name, brand_name: brandName });
  });

  const skuByCohort = new Map<string, string[]>();
  rawRows.forEach((row) => {
    const cid = row.cohort_id;
    if (!cid) return;
    const existing = skuByCohort.get(cid) ?? [];
    existing.push(row.sku ?? "");
    skuByCohort.set(cid, existing);
  });

  const { data: selectedCounts, error: selectedCountError } = await supabase
    .from("official_brand_url_candidates")
    .select("sku, cohort_id, selection_status")
    .in("cohort_id", cohortIds)
    .in("selection_status", ["selected", "extracted"]);

  if (selectedCountError) {
    console.error("[URL Review Cohorts] Failed to load candidate counts:", selectedCountError);
    return NextResponse.json({ error: "Failed to load candidate counts" }, { status: 500 });
  }

  const selectedByCohort = new Map<string, Set<string>>();
  const extractedByCohort = new Map<string, Set<string>>();
  const rawCandidates = (selectedCounts ?? []) as Array<{
    sku?: string | null;
    cohort_id?: string | null;
    selection_status?: string | null;
  }>;

  rawCandidates.forEach((row) => {
    const cid = row.cohort_id;
    const sku = row.sku;
    if (!cid || !sku) return;
    if (row.selection_status === "selected") {
      const set = selectedByCohort.get(cid) ?? new Set();
      set.add(sku);
      selectedByCohort.set(cid, set);
    } else if (row.selection_status === "extracted") {
      const set = extractedByCohort.get(cid) ?? new Set();
      set.add(sku);
      extractedByCohort.set(cid, set);
    }
  });

  const cohorts: CohortSummaryRow[] = cohortIds
    .map((cid) => {
      const meta = cohortMeta.get(cid);
      const productsForCohort = skuByCohort.get(cid) ?? [];
      const selected = selectedByCohort.get(cid)?.size ?? 0;
      const extracted = extractedByCohort.get(cid)?.size ?? 0;

      return {
        cohort_id: cid,
        name: meta?.name ?? null,
        brand_name: meta?.brand_name ?? null,
        product_count: productsForCohort.length,
        skus_with_selection: selected,
        skus_extracted: extracted,
      };
    })
    .filter((c) => c.product_count > 0)
    .sort((a, b) => (b.product_count - a.product_count));

  return NextResponse.json({ cohorts });
}
