/**
 * Source Attempts API
 *
 * POST - Fetch enrichment source attempts for given UPCs, filtered by outcome.
 * Used by the Needs Attention view to group source errors.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();
    const body = await request.json();
    const { upcs, outcomes } = body as {
      upcs?: string[];
      outcomes?: string[];
    };

    if (!Array.isArray(upcs) || upcs.length === 0) {
      return NextResponse.json(
        { error: "upcs array is required" },
        { status: 400 }
      );
    }

    if (upcs.length > 500) {
      return NextResponse.json(
        { error: "Cannot query more than 500 UPCs at once" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("enrichment_source_attempts")
      .select("upc, source_slug, source_type, display_name, outcome, error_code, error_message, attempted_at, confidence")
      .in("upc", upcs);

    if (Array.isArray(outcomes) && outcomes.length > 0) {
      query = query.in("outcome", outcomes);
    }

    const { data: attempts, error } = await query.order("attempted_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ attempts: attempts ?? [] });
  } catch (err) {
    console.error("Error fetching source attempts:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
