/**
 * POST /api/admin/enrichment/jobs
 *
 * Admin endpoint to start a Source Cascade extraction job.
 * Replaces the deprecated /api/admin/pipeline/scrape endpoint.
 *
 * This is the primary entry point for triggering cascade extraction
 * from the Imported tab, re-extraction from Processed/NeedsAttention,
 * and test-mode extraction.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { scrapeProducts } from "@/lib/pipeline-scraping";
import type { ScrapeOptions } from "@/lib/pipeline-scraping-types";
import { createAdminClient } from "@/lib/supabase/server";
import { getCascadeReadiness } from "@/lib/approved-sources/source-cascade";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { upcs, retryMode, testMode } = body as {
      upcs?: string[];
      retryMode?: "all" | "failed_or_untried";
      testMode?: boolean;
    };

    if (!Array.isArray(upcs) || upcs.length === 0) {
      return NextResponse.json(
        { error: "upcs array is required and must be non-empty" },
        { status: 400 },
      );
    }

    if (upcs.length > 500) {
      return NextResponse.json(
        { error: "Cannot start extraction for more than 500 UPCs at once" },
        { status: 400 },
      );
    }

    const options: ScrapeOptions = {
      retryMode: retryMode ?? "all",
      testMode: testMode ?? false,
    };

    const result = await scrapeProducts(upcs, options);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          skippedUpcs: result.skippedUpcs,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      jobIds: result.jobIds,
      skippedUpcs: result.skippedUpcs,
    });
  } catch (err) {
    console.error("[Admin Enrichment Jobs] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
