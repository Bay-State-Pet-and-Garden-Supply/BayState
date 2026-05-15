/**
 * Enrichment Jobs API
 *
 * POST  - Create new enrichment jobs for selected SKUs
 * GET   - List active/recent enrichment jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { buildApprovedSourcePlans } from "@/lib/approved-sources/source-plan";

// =============================================================================
// POST - Create Enrichment Job
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    const body = await request.json();
    const {
      skus,
      targetIds,
      mode,
      model,
      config,
      selectedDistributorSlug,
    } = body;

    if (!Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json(
        { error: "skus array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (skus.length > 500) {
      return NextResponse.json(
        { error: "Cannot process more than 500 SKUs at once" },
        { status: 400 }
      );
    }

    // Validate SKUs exist with valid pipeline status
    const { data: products, error: fetchError } = await supabase
      .from("products_ingestion")
      .select("sku, pipeline_status")
      .in("sku", skus);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const validSkus = (products || [])
      .filter((p: { sku: string; pipeline_status: string }) =>
        p.pipeline_status === "imported" ||
        p.pipeline_status === "url_review" ||
        p.pipeline_status === "extracting"
      )
      .map((p: { sku: string }) => p.sku);

    if (validSkus.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the selected SKUs are in Imported or Extracting status",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------------
    // Approved Source Extraction: build source plans if selectedDistributorSlug
    // is provided, or if we detect approved-source mode.
    // ------------------------------------------------------------------
    const useApprovedSources =
      config?.source_type === "approved_source_extraction" ||
      selectedDistributorSlug !== undefined;

    let sourcePlansBySku: Record<string, unknown> | undefined;
    let skippedSkus: string[] = [];
    let brandedSkus: string[] = [...validSkus];

    if (useApprovedSources) {
      const plans = await buildApprovedSourcePlans(
        supabase,
        validSkus,
        selectedDistributorSlug
          ? { selectedDistributorSlug }
          : undefined,
      );

      sourcePlansBySku = {};
      for (const [sku, result] of Object.entries(plans)) {
        if (result.ok) {
          sourcePlansBySku[sku] = result.plan;
        } else {
          skippedSkus.push(sku);
        }
      }

      brandedSkus = Object.keys(sourcePlansBySku);

      if (brandedSkus.length === 0) {
        return NextResponse.json(
          {
            error:
              "None of the selected SKUs have an assigned brand. " +
              "Assign a brand before starting approved source extraction.",
            skipped_skus: skippedSkus,
          },
          { status: 400 }
        );
      }
    }

    // Resolve targets for non-approved-source path
    let targetMap: Record<string, string | null> = {};

    if (!useApprovedSources) {
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const { data: targets } = await supabase
          .from("enrichment_targets")
          .select("sku, url")
          .in("id", targetIds)
          .in("sku", brandedSkus);

        if (targets) {
          for (const t of targets) {
            targetMap[t.sku] = t.url;
          }
        }
      } else {
        // Use selected targets
        const { data: selectedTargets } = await supabase
          .from("enrichment_targets")
          .select("sku, url")
          .in("sku", brandedSkus)
          .eq("selected", true)
          .eq("status", "selected");

        if (selectedTargets) {
          for (const t of selectedTargets) {
            targetMap[t.sku] = t.url;
          }
        }

        // For SKUs without a selected target, mark them as needing URL review
        const skusWithoutTargets = brandedSkus.filter(
          (sku: string) => !targetMap[sku],
        );
        if (skusWithoutTargets.length > 0) {
          for (const sku of skusWithoutTargets) {
            targetMap[sku] = null;
          }
        }
      }
    }

    // Build job config with optional source plans
    const jobConfig: Record<string, unknown> = config ?? {};
    if (sourcePlansBySku && Object.keys(sourcePlansBySku).length > 0) {
      jobConfig.source_plans_by_sku = sourcePlansBySku;
      jobConfig.source_type = "approved_source_extraction";
    }

    // Create enrichment_jobs row
    const jobMode = mode ?? "mixed";
    const jobModel = model ?? null;

    const { data: job, error: jobError } = await supabase
      .from("enrichment_jobs")
      .insert({
        status: "queued",
        skus: brandedSkus,
        total_count: brandedSkus.length,
        completed_count: 0,
        failed_count: 0,
        model: jobModel,
        mode: jobMode,
        config: jobConfig,
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
    const attempts = brandedSkus.map((sku: string) => ({
      job_id: job.id,
      sku,
      attempt_number: 1,
      status: "queued",
      mode: jobMode,
      model: jobModel,
      source_url: useApprovedSources ? null : targetMap[sku],
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

    // Transition products to extracting
    const { error: updateError } = await supabase
      .from("products_ingestion")
      .update({
        pipeline_status: "extracting",
        updated_at: new Date().toISOString(),
      })
      .in("sku", brandedSkus);

    if (updateError) {
      console.error("Failed to update product statuses:", updateError);
      // Non-fatal: enrichment job still created
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      skuCount: brandedSkus.length,
      attemptCount: attempts.length,
      ...(skippedSkus.length > 0 ? { skipped_skus: skippedSkus } : {}),
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
