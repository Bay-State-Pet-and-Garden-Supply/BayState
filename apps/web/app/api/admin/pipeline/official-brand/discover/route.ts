import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { runOfficialBrandDiscovery } from "@/lib/official-brand-discovery";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
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
    return NextResponse.json({ success: true, sku_count: result.skuCount, candidate_count: result.candidateCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    console.error("[Official Brand Discover]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
