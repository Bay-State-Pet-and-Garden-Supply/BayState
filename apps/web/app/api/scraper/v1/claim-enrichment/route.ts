/**
 * POST /api/scraper/v1/claim-enrichment
 *
 * Runner claim endpoint for the Source Cascade.
 *
 * The scraper runner (apps/scraper/core/api_client.py claim_enrichment())
 * polls this endpoint to claim the next queued enrichment attempt.
 *
 * Flow:
 * 1. Validate runner auth via API key
 * 2. Call existing RPC claim_next_pending_enrichment_attempt to atomically
 *    claim a queued enrichment_attempt row
 * 3. Load the parent enrichment_jobs row for config, credentials, source plans
 * 4. Return the runner-expected JSON payload with hydrated fields
 *
 * The RPC exists in the DB (from 20260521204047_rename_sku_to_upc_v5).
 * It returns minimal fields; this route hydrates the response with
 * job config, AI credentials, and per-UPC source plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateRunnerAuth } from "@/lib/scraper-auth";

export async function POST(request: NextRequest) {
  // 1. Validate runner authentication
  const apiKey = request.headers.get("X-API-Key");
  const authorization = request.headers.get("Authorization");

  const runner = await validateRunnerAuth({ apiKey, authorization });
  if (!runner) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 },
    );
  }

  try {
    // 2. Parse request body
    const body = await request.json().catch(() => ({}));
    const runnerName =
      body.runner_name || runner.runnerName || "unknown-runner";
    const maxAttempts =
      typeof body.max_attempts === "number" ? body.max_attempts : 1;

    const supabase = await createAdminClient();

    // 3. Call the existing RPC to atomically claim an attempt
    // The RPC's default claim duration is 15 minutes, matching the runner's
    // heartbeat interval. It uses FOR UPDATE SKIP LOCKED to handle concurrent runners.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "claim_next_pending_enrichment_attempt",
      {
        p_runner_name: runnerName,
        p_claim_duration_minutes: 15,
      },
    );

    if (rpcError) {
      console.error("[Claim Enrichment] RPC error:", rpcError);
      return NextResponse.json(
        { error: "Failed to claim enrichment attempt" },
        { status: 500 },
      );
    }

    if (!rpcResult) {
      // No pending attempts available — return empty (runner handles this)
      return NextResponse.json({ attempts: [] }, { status: 200 });
    }

    // The RPC returns a JSON object — parse it
    const claimed: Record<string, unknown> =
      typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    const attemptId = String(claimed.id ?? "");
    const jobId = String(claimed.job_id ?? "");
    const upc = String(claimed.upc ?? "");
    const sourceUrl = String(claimed.source_url ?? "approved_source_extraction");
    const targetId = claimed.target_id ? String(claimed.target_id) : null;
    const mode = String(claimed.mode ?? "mixed");
    const model = claimed.model ? String(claimed.model) : null;
    const leaseToken = claimed.lease_token ? String(claimed.lease_token) : null;
    const leaseExpiresAt = claimed.lease_expires_at
      ? String(claimed.lease_expires_at)
      : null;

    // 4. Load the parent job row for config and source plans
    // NOTE: enrichment_jobs does not have an ai_credentials column —
    // credentials are resolved at runtime by the runner via /api/scraper/v1/credentials
    const { data: job, error: jobError } = await supabase
      .from("enrichment_jobs")
      .select(
        "id, config, test_mode",
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(
        "[Claim Enrichment] Failed to load job row:",
        jobError?.message ?? "job not found",
      );
      // Return the basic claim even without job data — runner will handle
      return NextResponse.json({
        attempts: [
          {
            id: attemptId,
            job_id: jobId,
            upc,
            source_url: sourceUrl,
            domain: null,
            mode,
            model,
            target_id: targetId,
            config: null,
            ai_credentials: null,
            lease_token: leaseToken,
            lease_expires_at: leaseExpiresAt,
            test_mode: false,
            source_plan: null,
          },
        ],
      });
    }

    // 5. Hydrate the response with job-level fields
    const jobConfig = (job.config as Record<string, unknown>) ?? {};
    const aiCredentials = (job as Record<string, unknown>).ai_credentials
      ? ((job as Record<string, unknown>).ai_credentials as Record<string, unknown>)
      : null;
    const testMode = (job as Record<string, unknown>).test_mode === true;

    // Extract per-UPC source plan from job config
    const sourcePlansByUpc = jobConfig.source_plans_by_upc as
      | Record<string, unknown>
      | undefined;
    const sourcePlan = sourcePlansByUpc?.[upc] ?? null;

    // Determine domain from the source plan or the job config
    let domain: string | null = null;
    if (sourcePlan && typeof sourcePlan === "object") {
      const plan = sourcePlan as Record<string, unknown>;
      if (plan.sourcePolicy && typeof plan.sourcePolicy === "object") {
        const policy = plan.sourcePolicy as Record<string, unknown>;
        const allowedDomains = policy.allowedDomains as string[] | undefined;
        if (allowedDomains && allowedDomains.length > 0) {
          domain = allowedDomains[0];
        }
      }
    }

    // 6. Return the runner-expected shape
    // The runner's ClaimedEnrichment dataclass expects these exact keys.
    return NextResponse.json({
      attempts: [
        {
          id: attemptId,
          job_id: jobId,
          upc,
          source_url: sourceUrl,
          domain,
          mode,
          model,
          target_id: targetId,
          config: jobConfig,
          ai_credentials: aiCredentials,
          lease_token: leaseToken,
          lease_expires_at: leaseExpiresAt,
          test_mode: testMode,
          source_plan: sourcePlan,
        },
      ],
    });
  } catch (err) {
    console.error("[Claim Enrichment] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
