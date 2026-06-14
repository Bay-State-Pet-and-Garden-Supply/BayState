import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { processBatchQueue } from "@/lib/consolidation";

/**
 * POST /api/admin/consolidation/[batchId]/retry
 *
 * Resets failed items in a consolidation batch back to 'pending' and
 * immediately processes them so they don't sit in the queue.
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

  // ---------------------------------------------------------------
  // 4. Process the reset items immediately
  // ---------------------------------------------------------------
  let processedCount = 0;
  let completedCount = 0;
  let failedAgainCount = 0;

  try {
    const chunkSize = 5;
    const maxIterations = Math.ceil(resetCount / chunkSize) + 2;

    for (let i = 0; i < maxIterations; i++) {
      const pr = await processBatchQueue(batchId, { limit: chunkSize });
      if ('success' in pr && !pr.success) break;
      if ('processed' in pr) {
        processedCount += pr.processed;
        completedCount += pr.completed;
        failedAgainCount += pr.failed;
        if (pr.processed === 0 || pr.status.is_complete || pr.status.is_failed) break;
      }
    }
  } catch (err) {
    console.error("[Consolidation Retry] Processing error:", err);
  }

  return NextResponse.json({
    success: true,
    resetCount,
    processedCount,
    completedCount,
    failedAgainCount,
  });
}
