import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";

/**
 * GET /api/admin/pipeline/runs/:id/items
 *
 * Returns per-item status and error details for a pipeline run.
 *
 * - For consolidation runs (batch_jobs): returns batch_job_items
 * - For scrape runs (scrape_jobs): returns scrape_job_chunks expanded to items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createAdminClient();

  // ---------------------------------------------------------------
  // 1. Try batch_job_items first (consolidation runs)
  // ---------------------------------------------------------------
  const { data: batchItems, error: batchItemsError } = await supabase
    .from("batch_job_items")
    .select(
      "upc, status, error_message, started_at, completed_at, attempt_count, created_at",
    )
    .eq("batch_job_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!batchItemsError && batchItems && batchItems.length > 0) {
    return NextResponse.json({
      items: batchItems.map((item) => ({
        upc: item.upc,
        status: item.status,
        errorMessage: item.error_message,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        attemptCount: item.attempt_count,
      })),
    });
  }

  // ---------------------------------------------------------------
  // 2. Fall back to scrape_job_chunks (scrape runs)
  // ---------------------------------------------------------------
  const { data: chunks, error: chunksError } = await supabase
    .from("scrape_job_chunks")
    .select("status, upcs, error_message, started_at, completed_at")
    .eq("job_id", id)
    .limit(50);

  if (chunksError) {
    console.error("[Pipeline Run Items] Failed to fetch chunks:", chunksError);
    return NextResponse.json(
      { error: "Failed to fetch run items" },
      { status: 500 },
    );
  }

  if (chunks && chunks.length > 0) {
    // Expand chunks into per-UPC items
    const items: Array<{
      upc: string | null;
      status: string;
      errorMessage: string | null;
      startedAt: string | null;
      completedAt: string | null;
      attemptCount: number | undefined;
    }> = [];
    for (const chunk of chunks) {
      const upcs = (chunk.upcs as string[]) || [];
      if (upcs.length === 0) continue; // skip chunks without UPC lists
      for (const upc of upcs) {
        items.push({
          upc,
          status: chunk.status,
          errorMessage: chunk.error_message,
          startedAt: chunk.started_at,
          completedAt: chunk.completed_at,
          attemptCount: undefined,
        });
      }
    }

    return NextResponse.json({ items });
  }

  // ---------------------------------------------------------------
  // 3. No items found
  // ---------------------------------------------------------------
  return NextResponse.json({ items: [] });
}
