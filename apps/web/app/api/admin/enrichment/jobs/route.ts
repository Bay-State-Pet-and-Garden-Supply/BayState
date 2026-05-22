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
    const {
      upcs,
      targetIds,
      mode,
      model,
      config,
      selectedDistributorSlug,
      extractionMode: rawExtractionMode,
      forceRefresh: rawForceRefresh,
    } = body;

    const extractionMode = rawExtractionMode ?? "mixed";
    const forceRefresh = rawForceRefresh ?? false;

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

    // Validate extractionMode
    const VALID_EXTRACTION_MODES = ["mixed", "distributor_only", "ai_only"];
    if (!VALID_EXTRACTION_MODES.includes(extractionMode)) {
      return NextResponse.json(
        {
          error: `Invalid extractionMode "${extractionMode}". Must be one of: ${VALID_EXTRACTION_MODES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate UPCs exist with valid pipeline status
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
        p.pipeline_status === "extracting"
      )
      .map((p: { upc: string }) => p.upc);

    if (validUpcs.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the selected UPCs are in Imported or Extracting status",
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

    let sourcePlansByUpc: Record<string, unknown> | undefined;
    let skippedUpcs: string[] = [];
    let freshSkippedUpcs: string[] = [];
    let brandedUpcs: string[] = [...validUpcs];

    if (useApprovedSources) {
      const plans = await buildApprovedSourcePlans(
        supabase,
        validUpcs,
        {
          selectedDistributorSlug,
          extractionMode,
          forceRefresh,
        },
      );

      sourcePlansByUpc = {};
      const requiredCredentialSlugs = new Set<string>();

      for (const [upc, result] of Object.entries(plans)) {
        if (result.ok) {
          sourcePlansByUpc[upc] = result.plan;
          
          // Collect required credentials from the plan priority list
          const plan = result.plan as any;
          if (plan.priority && Array.isArray(plan.priority)) {
            for (const entry of plan.priority) {
              if (entry.requiresAuth) {
                const credRef = entry.credentialRef || entry.sourceSlug;
                if (credRef) {
                  requiredCredentialSlugs.add(credRef);
                }
              }
            }
          }
        } else {
          skippedUpcs.push(upc);
          if (result.code === "all_sources_fresh") {
            freshSkippedUpcs.push(upc);
          }
        }
      }

      brandedUpcs = Object.keys(sourcePlansByUpc);

        // Branded UPCs length check moved down to after source plan building
        if (brandedUpcs.length === 0) {
          if (freshSkippedUpcs.length > 0 && freshSkippedUpcs.length === skippedUpcs.length) {
            return NextResponse.json({
              success: true,
              jobId: null,
              upcCount: 0,
              attemptCount: 0,
              skipped_upcs: skippedUpcs,
              message: "All requested approved sources are already fresh. Use Force refresh to re-scrape.",
            });
          }

          const errorMessages = new Set<string>();
        for (const [upc, result] of Object.entries(plans)) {
          if (!result.ok && result.error) {
            errorMessages.add(result.error);
          }
        }
        const detailedError = errorMessages.size > 0
          ? Array.from(errorMessages).join("; ")
          : "None of the selected UPCs have an assigned brand. Assign a brand before starting approved source extraction.";

        return NextResponse.json(
          {
            error: detailedError,
            skipped_upcs: skippedUpcs,
          },
          { status: 400 }
        );
      }

      // Check if credentials are set for all required sources
      if (requiredCredentialSlugs.size > 0) {
        const slugs = Array.from(requiredCredentialSlugs);
        const { data: dbCreds, error: dbCredsError } = await supabase
          .from("scraper_credentials")
          .select("scraper_slug, credential_type")
          .in("scraper_slug", slugs);

        if (dbCredsError) {
          return NextResponse.json(
            { error: `Database error checking credentials: ${dbCredsError.message}` },
            { status: 500 }
          );
        }

        const missingMap: Record<string, string[]> = {};
        for (const slug of slugs) {
          const matchingCreds = (dbCreds || []).filter(
            (c: { scraper_slug: string }) => c.scraper_slug === slug
          );
          
          const hasLogin = matchingCreds.some(
            (c: { credential_type: string }) => c.credential_type === "login"
          );
          const hasPassword = matchingCreds.some(
            (c: { credential_type: string }) => c.credential_type === "password"
          );
          
          const missingTypes: string[] = [];
          if (!hasLogin) missingTypes.push("Username");
          if (!hasPassword) missingTypes.push("Password");
          
          if (missingTypes.length > 0) {
            missingMap[slug] = missingTypes;
          }
        }

        if (Object.keys(missingMap).length > 0) {
          const friendlyNames: Record<string, string> = {
            phillips: "Phillips Pet",
            orgill: "Orgill",
            petfoodex: "Pet Food Experts",
          };
          
          const errorDetails = Object.entries(missingMap)
            .map(([slug, missing]) => {
              const name = friendlyNames[slug] || slug;
              return `${name} (missing: ${missing.join(" and ")})`;
            })
            .join(", ");

          return NextResponse.json(
            {
              error: `Scrape cannot be started. Credentials are not configured in Settings for: ${errorDetails}. Please go to Settings to configure them before starting a scrape.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Resolve targets for non-approved-source path
    let targetMap: Record<string, string | null> = {};

    if (!useApprovedSources) {
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const { data: targets } = await supabase
          .from("enrichment_targets")
          .select("upc, url")
          .in("id", targetIds)
          .in("upc", brandedUpcs);

        if (targets) {
          for (const t of targets) {
            targetMap[t.upc] = t.url;
          }
        }
      } else {
        // Use selected targets
        const { data: selectedTargets } = await supabase
          .from("enrichment_targets")
          .select("upc, url")
          .in("upc", brandedUpcs)
          .eq("selected", true)
          .eq("status", "selected");

        if (selectedTargets) {
          for (const t of selectedTargets) {
            targetMap[t.upc] = t.url;
          }
        }

        // For UPCs without a selected target, mark them as needing URL review
        const upcsWithoutTargets = brandedUpcs.filter(
          (upc: string) => !targetMap[upc],
        );
        if (upcsWithoutTargets.length > 0) {
          for (const upc of upcsWithoutTargets) {
            targetMap[upc] = null;
          }
        }
      }
    }

    // Build job config with optional source plans
    const jobConfig: Record<string, unknown> = config ?? {};
    if (sourcePlansByUpc && Object.keys(sourcePlansByUpc).length > 0) {
      jobConfig.source_plans_by_upc = sourcePlansByUpc;
      jobConfig.source_type = "approved_source_extraction";
      jobConfig.extraction_mode = extractionMode;
      jobConfig.force_refresh = forceRefresh;
    }

    // Resolve the active AI runtime once at enqueue time so the job model
    // and config trace match the profile that will be used by the runner.
    const aiRuntimeCreds = await getAIScrapingRuntimeCredentials();
    const aiConfigId = aiRuntimeCreds.config_id ?? null;

    // Create enrichment_jobs row
    const jobMode = mode ?? extractionMode ?? "mixed";
    const jobModel = jobMode === "distributor_only" ? null : (model ?? aiRuntimeCreds.llm_model);

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
      source_url: useApprovedSources ? null : targetMap[upc],
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

    // Transition products to extracting
    const { error: updateError } = await supabase
      .from("products_ingestion")
      .update({
        pipeline_status: "extracting",
        updated_at: new Date().toISOString(),
      })
      .in("upc", brandedUpcs);

    if (updateError) {
      console.error("Failed to update product statuses:", updateError);
      // Non-fatal: enrichment job still created
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      upcCount: brandedUpcs.length,
      attemptCount: attempts.length,
      ...(skippedUpcs.length > 0 ? { skipped_upcs: skippedUpcs } : {}),
      ...(freshSkippedUpcs.length > 0
        ? {
            message: `Skipped ${freshSkippedUpcs.length} UPC${freshSkippedUpcs.length === 1 ? "" : "s"} because the requested approved sources are already fresh.`,
          }
        : {}),
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
