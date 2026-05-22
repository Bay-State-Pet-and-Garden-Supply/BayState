import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/consolidation/[batchId]/retry
 *
 * Resets failed items in a consolidation batch back to 'pending' so they
 * can be re-processed. Updates the parent batch_jobs status accordingly.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { batchId } = await params;
  const supabase = await createAdminClient();

  // ---------------------------------------------------------------
  // 1. Verify the batch exists
  // ---------------------------------------------------------------
  const { data: batchJob, error: batchError } = await supabase
    .from("batch_jobs")
    .select("id, status, total_requests, completed_requests, failed_requests")
    .eq("id", batchId)
    .single();

  if (batchError || !batchJob) {
    console.error("[Consolidation Retry] Batch not found:", batchId, batchError);
    return NextResponse.json(
      { error: "Batch job not found" },
      { status: 404 },
    );
  }

  // ---------------------------------------------------------------
  // 2. Reset failed batch_job_items → pending
  // ---------------------------------------------------------------
  const { data: resetItems, error: resetError } = await supabase
    .from("batch_job_items")
    .update({
      status: "pending",
      attempt_count: 0,
      error_message: null,
      started_at: null,
      completed_at: null,
      response_payload: null,
      parsed_result: null,
    })
    .eq("batch_job_id", batchId)
    .eq("status", "failed")
    .select("upc");

  if (resetError) {
    console.error(
      "[Consolidation Retry] Failed to reset items:",
      resetError,
    );
    return NextResponse.json(
      { error: "Failed to reset failed items" },
      { status: 500 },
    );
  }

  const resetCount = resetItems?.length || 0;

  // ---------------------------------------------------------------
  // 3. Update parent batch_jobs status
  // ---------------------------------------------------------------
  // Re-read the actual count of remaining failed items to avoid race
  // conditions if another admin clicked retry concurrently.
  const { count: actualFailedCount, error: countError } = await supabase
    .from("batch_job_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_job_id", batchId)
    .eq("status", "failed");

  if (countError) {
    console.error(
      "[Consolidation Retry] Failed to count remaining failed items:",
      countError,
    );
    return NextResponse.json(
      { error: "Failed to verify retry state" },
      { status: 500 },
    );
  }

  const newFailedRequests = actualFailedCount ?? 0;

  const { error: updateError } = await supabase
    .from("batch_jobs")
    .update({
      status: "pending",
      failed_requests: newFailedRequests,
    })
    .eq("id", batchId);

  if (updateError) {
    console.error(
      "[Consolidation Retry] Failed to update batch status:",
      updateError,
    );
    return NextResponse.json(
      { error: "Failed to update batch status after retry" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    resetCount,
  });
}
