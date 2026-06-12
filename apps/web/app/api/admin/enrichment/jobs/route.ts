/**
 * Enrichment Jobs API
 *
 * POST  - Create new enrichment jobs for selected UPCs
 * GET   - List active/recent enrichment jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { buildApprovedSourcePlans } from "@/lib/approved-sources/source-plan";
import { getAIScrapingRuntimeCredentials } from "@/lib/ai-scraping/credentials";

// =============================================================================
// POST - Create Enrichment Job
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    const body = await request.json();
    const { upcs, retryMode } = body;

    if (!Array.isArray(upcs) || upcs.length === 0) {
      return NextResponse.json(
        { error: "upcs array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (upcs.length > 500) {
      return NextResponse.json(
        { error: "Cannot process more than 500 UPCs at once" },
        { status: 400 }
      );
    }

    if (retryMode && retryMode !== "all" && retryMode !== "failed_or_untried") {
      return NextResponse.json(
        { error: `Invalid retryMode "${retryMode}". Must be "all" or "failed_or_untried".` },
        { status: 400 }
      );
    }

    // Validate UPCs exist with valid pipeline status.
    // Accept extracted, extracting, processed, and needs_attention for re-extraction.
    const { data: products, error: fetchError } = await supabase
      .from("products_ingestion")
      .select("upc, pipeline_status")
      .in("upc", upcs);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const validUpcs = (products || [])
      .filter((p: { upc: string; pipeline_status: string }) =>
        p.pipeline_status === "imported" ||
        p.pipeline_status === "extracting" ||
        p.pipeline_status === "processed" ||
        p.pipeline_status === "needs_attention"
      )
      .map((p: { upc: string }) => p.upc);

    if (validUpcs.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the selected UPCs are in Imported, Extracting, Processed, or Needs Attention status",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------------
    // Always use Approved Source Extraction. Build source plans with
    // optional retryMode for incremental re-extraction.
    // ------------------------------------------------------------------
    const plans = await buildApprovedSourcePlans(
      supabase,
      validUpcs,
      { retryMode },
    );

    const sourcePlansByUpc: Record<string, unknown> = {};
    const skippedUpcs: string[] = [];

    for (const [upc, result] of Object.entries(plans)) {
      if (result.ok) {
        sourcePlansByUpc[upc] = result.plan;
      } else {
        skippedUpcs.push(upc);
      }
    }

    const brandedUpcs = Object.keys(sourcePlansByUpc);

    if (brandedUpcs.length === 0) {
      const errorMessages = new Set<string>();
      for (const result of Object.values(plans)) {
        if (!result.ok && result.error) {
          errorMessages.add(result.error);
        }
      }
      const detailedError = errorMessages.size > 0
        ? Array.from(errorMessages).join("; ")
        : "None of the selected UPCs have an assigned brand with a configured source cascade. Configure brand sources in brand settings before extraction.";

      return NextResponse.json(
        {
          error: detailedError,
          skipped_upcs: skippedUpcs,
        },
        { status: 400 }
      );
    }

    // Credential preflight removed — the runner emits source_error outcomes
    // for missing or expired credentials, which route to Needs Attention.

    // Build job config with source plans
    const jobConfig: Record<string, unknown> = {
      source_plans_by_upc: sourcePlansByUpc,
      source_type: "approved_source_extraction",
      cascade_version: "v1",
      serp_fallback_policy: "run_when_all_distributors_clean_not_stocked",
    };

    // Resolve the active AI runtime once at enqueue time so the job model
    // and config trace match the profile that will be used by the runner.
    const aiRuntimeCreds = await getAIScrapingRuntimeCredentials();
    const aiConfigId = aiRuntimeCreds.config_id ?? null;

    // Create enrichment_jobs row
    const jobMode = "mixed";
    const jobModel = aiRuntimeCreds.llm_model;

    const { data: job, error: jobError } = await supabase
      .from("enrichment_jobs")
      .insert({
        status: "queued",
        upcs: brandedUpcs,
        total_count: brandedUpcs.length,
        completed_count: 0,
        failed_count: 0,
        model: jobModel,
        mode: jobMode,
        config: jobConfig,
        config_id: aiConfigId,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? "Failed to create enrichment job" },
        { status: 500 }
      );
    }

    // Create enrichment_attempts rows
    const attempts = brandedUpcs.map((upc: string) => ({
      job_id: job.id,
      upc,
      attempt_number: 1,
      status: "queued",
      mode: jobMode,
      model: jobModel,
      config_id: aiConfigId,
    }));

    const { error: attemptError } = await supabase
      .from("enrichment_attempts")
      .insert(attempts);

    if (attemptError) {
      // Clean up job on failure
      await supabase.from("enrichment_jobs").delete().eq("id", job.id);
      return NextResponse.json(
        { error: attemptError.message },
        { status: 500 }
      );
    }

    // Transition products to extracting (or keep processed/needs_attention
    // for re-extraction — the callback finalizes the status)
    const transitioningUpcs = brandedUpcs.filter((upc) => {
      const product = products?.find((p) => p.upc === upc);
      return product?.pipeline_status === "imported";
    });

    if (transitioningUpcs.length > 0) {
      const { error: updateError } = await supabase
        .from("products_ingestion")
        .update({
          pipeline_status: "extracting",
          updated_at: new Date().toISOString(),
        })
        .in("upc", transitioningUpcs);

      if (updateError) {
        console.error("Failed to update product statuses:", updateError);
      }
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      upcCount: brandedUpcs.length,
      attemptCount: attempts.length,
      ...(skippedUpcs.length > 0 ? { skipped_upcs: skippedUpcs } : {}),
    });
  } catch (err) {
    console.error("Error creating enrichment job:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET - List Enrichment Jobs
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    const { data: jobs, error } = await supabase
      .from("enrichment_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: jobs ?? [] });
  } catch (err) {
    console.error("Error listing enrichment jobs:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE - Cancel a Specific Enrichment Job
// =============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { error: "id (Job ID) query parameter is required" },
        { status: 400 }
      );
    }

    // 1. Get the job to know the UPCs
    const { data: job, error: getJobError } = await supabase
      .from("enrichment_jobs")
      .select("status, upcs")
      .eq("id", jobId)
      .single();

    if (getJobError || !job) {
      return NextResponse.json(
        { error: getJobError?.message ?? "Job not found" },
        { status: 404 }
      );
    }

    if (["completed", "completed_with_errors", "failed", "cancelled"].includes(job.status)) {
      return NextResponse.json(
        { error: `Job is already in a terminal state: ${job.status}` },
        { status: 400 }
      );
    }

    // 2. Update the job status to 'cancelled'
    const { error: updateJobError } = await supabase
      .from("enrichment_jobs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_message: "Job cancelled by administrator",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateJobError) {
      return NextResponse.json(
        { error: updateJobError.message },
        { status: 500 }
      );
    }

    // 3. Cancel all non-terminal attempts under this job
    const { error: updateAttemptsError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_message: "Attempt cancelled by administrator",
      })
      .eq("job_id", jobId)
      .in("status", ["queued", "running"]);

    if (updateAttemptsError) {
      console.error("[Cancel Job API] Failed to cancel attempts:", updateAttemptsError);
    }

    // 4. For any product UPC in this job, check if it's stuck in 'extracting'
    // and reset back to 'imported' if there are no other active attempts/jobs.
    if (Array.isArray(job.upcs) && job.upcs.length > 0) {
      // Find which of these UPCs are currently in 'extracting'
      const { data: productsToReset, error: productsError } = await supabase
        .from("products_ingestion")
        .select("upc")
        .in("upc", job.upcs)
        .eq("pipeline_status", "extracting");

      if (productsError) {
        console.error("[Cancel Job API] Failed to check products ingestion status:", productsError);
      } else if (productsToReset && productsToReset.length > 0) {
        const upcsToCheck = productsToReset.map((p) => p.upc);

        // Check if these UPCs have ANY OTHER active attempts (not this job) that are queued or running
        const { data: otherActiveAttempts, error: otherAttemptsError } = await supabase
          .from("enrichment_attempts")
          .select("upc")
          .in("upc", upcsToCheck)
          .neq("job_id", jobId)
          .in("status", ["queued", "running"]);

        if (otherAttemptsError) {
          console.error("[Cancel Job API] Failed to check other active attempts:", otherAttemptsError);
        } else {
          const upcsWithOtherAttempts = new Set(
            (otherActiveAttempts || []).map((a) => a.upc)
          );

          // UPCs that have no other active attempts can be safely reset to 'imported'
          const upcsToReset = upcsToCheck.filter((upc) => !upcsWithOtherAttempts.has(upc));

          if (upcsToReset.length > 0) {
            const { error: resetError } = await supabase
              .from("products_ingestion")
              .update({
                pipeline_status: "imported",
                updated_at: new Date().toISOString(),
              })
              .in("upc", upcsToReset);

            if (resetError) {
              console.error("[Cancel Job API] Failed to reset product statuses to imported:", resetError);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error cancelling enrichment job:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
