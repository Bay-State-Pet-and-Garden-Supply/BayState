/**
 * Bulk Source Cascade Readiness API
 *
 * POST  — Check cascade readiness for multiple brands at once.
 *         Uses getCascadeReadiness() from source-cascade.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { getCascadeReadiness } from "@/lib/approved-sources/source-cascade";

// =============================================================================
// POST
// =============================================================================

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { brandIds } = body as { brandIds?: string[] };

    if (!Array.isArray(brandIds) || brandIds.length === 0) {
      return NextResponse.json(
        { error: "brandIds array is required and must be non-empty" },
        { status: 400 },
      );
    }

    if (brandIds.length > 200) {
      return NextResponse.json(
        { error: "Cannot check more than 200 brands at once" },
        { status: 400 },
      );
    }

    const supabase = await createAdminClient();
    const readiness = await getCascadeReadiness(supabase, brandIds);

    return NextResponse.json({
      readiness,
    });
  } catch (err) {
    console.error("[Bulk Cascade Readiness] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
