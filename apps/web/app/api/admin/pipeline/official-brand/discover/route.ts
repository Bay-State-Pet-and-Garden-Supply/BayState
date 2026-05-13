import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { runOfficialBrandDiscovery } from "@/lib/official-brand-discovery";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  let body: { cohort_id?: unknown; skus?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cohortId = typeof body.cohort_id === "string" && body.cohort_id.trim() ? body.cohort_id.trim() : null;
  const skus = Array.isArray(body.skus) ? body.skus.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];

  if (!cohortId || skus.length === 0) {
    return NextResponse.json({ error: "cohort_id and skus are required" }, { status: 400 });
  }

  try {
    const result = await runOfficialBrandDiscovery({ cohortId, skus });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Enrich response with per-SKU candidate breakdown
    const supabase = await createAdminClient();
    const { data: candidateRows } = await supabase
      .from("official_brand_url_candidates")
      .select("sku, selection_status")
      .eq("cohort_id", cohortId)
      .in("sku", skus);

    const candidatesPerSku: Record<string, number> = {};
    if (Array.isArray(candidateRows)) {
      for (const row of candidateRows) {
        const sku = row.sku as string | undefined;
        if (sku) {
          candidatesPerSku[sku] = (candidatesPerSku[sku] ?? 0) + 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      sku_count: result.skuCount,
      candidate_count: result.candidateCount,
      candidates_per_sku: candidatesPerSku,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    console.error("[Official Brand Discover]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
