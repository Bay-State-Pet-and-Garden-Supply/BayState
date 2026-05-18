import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/enrichment/reset
 * Cancels all active/queued enrichment jobs and attempts, and resets stuck 'extracting' products back to 'imported'.
 * This is meant as a recovery mechanism if scraper runners fail silently or jobs become permanently stranded.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const supabase = await createAdminClient();

    // 1. Identify and cancel all active enrichment jobs
    const { data: activeJobs, error: activeJobsError } = await supabase
      .from("enrichment_jobs")
      .select("id, skus")
      .in("status", ["queued", "running", "claimed"]);

    if (activeJobsError) {
      console.error("[Enrichment Reset API] Failed to check active jobs:", activeJobsError);
      return NextResponse.json({ error: "Failed to check active jobs" }, { status: 500 });
    }

    let jobsCancelled = 0;
    let productsReset = 0;

    if (activeJobs && activeJobs.length > 0) {
      const activeJobIds = activeJobs.map((j) => j.id);

      // Cancel jobs
      const { error: cancelJobsError } = await supabase
        .from("enrichment_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: "Job cancelled by administrator recovery reset",
          updated_at: new Date().toISOString(),
        })
        .in("id", activeJobIds);

      if (cancelJobsError) {
        console.error("[Enrichment Reset API] Failed to cancel jobs:", cancelJobsError);
        return NextResponse.json({ error: "Failed to cancel active jobs" }, { status: 500 });
      }
      jobsCancelled = activeJobs.length;

      // Fail attempts
      const { error: failAttemptsError } = await supabase
        .from("enrichment_attempts")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: "Job cancelled by administrator recovery reset",
        })
        .in("job_id", activeJobIds)
        .in("status", ["queued", "running"]);

      if (failAttemptsError) {
        console.error("[Enrichment Reset API] Failed to fail attempts:", failAttemptsError);
        // Non-fatal, proceed
      }
    }

    // 2. Safely cancel any loose/unlinked active attempts
    const { error: looseAttemptsError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: "Attempt cancelled by administrator recovery reset",
      })
      .in("status", ["queued", "running"]);

    if (looseAttemptsError) {
      console.error("[Enrichment Reset API] Failed to cancel loose attempts:", looseAttemptsError);
    }

    // 3. Reset products stuck in 'extracting' status back to 'imported'
    const { data: stuckProducts, error: selectError } = await supabase
      .from("products_ingestion")
      .select("sku")
      .eq("pipeline_status", "extracting");

    if (selectError) {
      console.error("[Enrichment Reset API] Failed to select stuck products:", selectError);
      return NextResponse.json({ error: "Failed to identify stuck products" }, { status: 500 });
    }

    if (stuckProducts && stuckProducts.length > 0) {
      const skusToReset = stuckProducts.map((p) => p.sku);

      const { error: resetError } = await supabase
        .from("products_ingestion")
        .update({
          pipeline_status: "imported",
          updated_at: new Date().toISOString(),
        })
        .in("sku", skusToReset);

      if (resetError) {
        console.error("[Enrichment Reset API] Failed to reset product statuses:", resetError);
        return NextResponse.json({ error: "Failed to reset product statuses" }, { status: 500 });
      }
      productsReset = skusToReset.length;
    }

    return NextResponse.json({
      success: true,
      jobs_cancelled: jobsCancelled,
      products_reset: productsReset,
    });
  } catch (error) {
    console.error("[Enrichment Reset API] Reset error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset enrichment pipeline" },
      { status: 500 }
    );
  }
}
