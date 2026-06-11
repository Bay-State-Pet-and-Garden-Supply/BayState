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

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  // Helper to fetch names by UPC
  const fetchProductNames = async (upcList: string[]) => {
    const upcToName = new Map<string, string>();
    if (upcList.length === 0) return upcToName;

    try {
      const { data: ingestionRows } = await supabase
        .from("products_ingestion")
        .select("upc, input")
        .in("upc", upcList);

      for (const row of ingestionRows || []) {
        const input = row.input as { name?: string; title?: string } | null;
        const name = input?.name || input?.title || "";
        if (name) {
          upcToName.set(row.upc, name);
        }
      }

      const missingUpcs = upcList.filter((upc) => !upcToName.has(upc));
      if (missingUpcs.length > 0) {
        const { data: productRows } = await supabase
          .from("products")
          .select("upc, name")
          .in("upc", missingUpcs);

        for (const row of productRows || []) {
          if (row.name) {
            upcToName.set(row.upc, row.name);
          }
        }
      }
    } catch (err) {
      console.warn("[Pipeline Run Items] Failed to fetch product names:", err);
    }
    return upcToName;
  };

  // ---------------------------------------------------------------
  // 1. Try batch_job_items first (consolidation runs)
  // ---------------------------------------------------------------
  let batchQuery = supabase
    .from("batch_job_items")
    .select(
      "upc, status, error_message, started_at, completed_at, attempt_count, created_at",
    )
    .eq("batch_job_id", id);

  if (statusFilter) {
    batchQuery = batchQuery.eq("status", statusFilter);
  }

  const { data: batchItems, error: batchItemsError } = await batchQuery
    .order("created_at", { ascending: false })
    .limit(100);

  if (!batchItemsError && batchItems && batchItems.length > 0) {
    const upcList = Array.from(new Set(batchItems.map((item) => item.upc).filter(Boolean)));
    const nameMap = await fetchProductNames(upcList);

    return NextResponse.json({
      items: batchItems.map((item) => ({
        upc: item.upc,
        name: nameMap.get(item.upc) || null,
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
  let chunkQuery = supabase
    .from("scrape_job_chunks")
    .select("status, upcs, error_message, started_at, completed_at")
    .eq("job_id", id);

  if (statusFilter) {
    chunkQuery = chunkQuery.eq("status", statusFilter);
  }

  const { data: chunks, error: chunksError } = await chunkQuery.limit(50);

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
      upc: string;
      status: string;
      errorMessage: string | null;
      startedAt: string | null;
      completedAt: string | null;
      attemptCount: number | undefined;
    }> = [];
    for (const chunk of chunks) {
      const upcs = (chunk.upcs as string[]) || [];
      if (upcs.length === 0) continue;
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

    const upcList = Array.from(new Set(items.map((item) => item.upc).filter(Boolean)));
    const nameMap = await fetchProductNames(upcList);

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        name: nameMap.get(item.upc) || null,
      })),
    });
  }

  // ---------------------------------------------------------------
  // 3. No items found
  // ---------------------------------------------------------------
  return NextResponse.json({ items: [] });
}
