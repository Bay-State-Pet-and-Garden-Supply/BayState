/**
 * Claim Enrichment API
 *
 * Worker endpoint to atomically claim queued enrichment attempts.
 * Authenticated via validateRunnerAuth (X-API-Key).
 * Uses service-role admin Supabase client per existing scraper route patterns.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getAIScrapingRuntimeCredentialsForConfig } from "@/lib/ai-scraping/credentials";
import { validateRunnerAuth } from "@/lib/scraper-auth";
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "@/lib/supabase/config";

function getSupabaseAdmin(): SupabaseClient {
  const url = SUPABASE_URL;
  const key = SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(url, key);
}

// =============================================================================
// POST - Claim Enrichment Attempts
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Validate runner auth per existing scraper pattern
    const runner = await validateRunnerAuth({
      apiKey: request.headers.get("X-API-Key"),
      authorization: request.headers.get("Authorization"),
    });

    if (!runner) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Read max_attempts from body (default 10)
    const body = await request.json().catch(() => ({}));
    const maxAttempts = Math.min(Math.max(body.max_attempts ?? 10, 1), 50);

    const leaseTTLMinutes = 15;
    const leaseToken = crypto.randomUUID();

    // Atomic claim: find queued attempts and claim them
    const { data: unclaimedAttempts, error: fetchError } = await supabase
      .from("enrichment_attempts")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(maxAttempts);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!unclaimedAttempts || unclaimedAttempts.length === 0) {
      return NextResponse.json({ attempts: [] });
    }

    const attemptIds = unclaimedAttempts.map((a: { id: string }) => a.id);

    // Claim them: update status and set run metadata
    const { data: claimed, error: claimError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .in("id", attemptIds)
      .eq("status", "queued")
      .select();

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ attempts: [] });
    }

    // Group by job ID
    const jobIds = [
      ...new Set(claimed.map((a: { job_id: string }) => a.job_id)),
    ];

    // Get job configs
    const { data: jobs, error: jobsError } = await supabase
      .from("enrichment_jobs")
      .select("*")
      .in("id", jobIds);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const jobsById = new Map((jobs ?? []).map((j) => [j.id, j]));

    const aiCredentialsByJobId = new Map<string, unknown>();
    await Promise.all(
      jobIds.map(async (jobId) => {
        const job = jobsById.get(jobId);
        const configId = typeof job?.config_id === "string" ? job.config_id : null;
        try {
          aiCredentialsByJobId.set(
            jobId,
            await getAIScrapingRuntimeCredentialsForConfig(configId),
          );
        } catch (error) {
          console.error(
            `[Claim Enrichment] Failed to resolve AI credentials for job ${jobId}:`,
            error,
          );
          aiCredentialsByJobId.set(jobId, null);
        }
      }),
    );

    // Map job ID to the lease info we should use for it
    const jobLeases = new Map<string, { token: string; expiresAt: string }>();

    const leaseExpiresAt = new Date(
      Date.now() + leaseTTLMinutes * 60 * 1000
    ).toISOString();

    for (const jobId of jobIds) {
      const job = jobsById.get(jobId);
      if (!job) continue;

      const isAlreadyClaimedByUs =
        job.status === "running" &&
        job.claimed_by === runner.runnerName &&
        job.lease_token;

      if (isAlreadyClaimedByUs) {
        // Reuse existing lease, but extend it
        const extendedExpiresAt = new Date(
          Date.now() + leaseTTLMinutes * 60 * 1000
        ).toISOString();

        await supabase
          .from("enrichment_jobs")
          .update({
            lease_expires_at: extendedExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        jobLeases.set(jobId, {
          token: job.lease_token,
          expiresAt: extendedExpiresAt,
        });
      } else {
        // Claim the job (or overwrite lease if it was someone else's/expired)
        const updateData: Record<string, any> = {
          status: "running",
          claimed_by: runner.runnerName,
          lease_token: leaseToken,
          lease_expires_at: leaseExpiresAt,
          updated_at: new Date().toISOString(),
        };

        // Only set started_at if not already set
        if (!job.started_at) {
          updateData.started_at = new Date().toISOString();
        }

        await supabase
          .from("enrichment_jobs")
          .update(updateData)
          .eq("id", jobId);

        jobLeases.set(jobId, {
          token: leaseToken,
          expiresAt: leaseExpiresAt,
        });
      }
    }

    // Build response payload with fields matching Python ClaimedEnrichment
    const attempts = claimed.map((attempt: Record<string, unknown>) => {
      const jobId = attempt.job_id as string;
      const job = jobsById.get(jobId);
      const lease = jobLeases.get(jobId) || {
        token: leaseToken,
        expiresAt: leaseExpiresAt,
      };

      const sourceUrl = (attempt.source_url as string) || "";
      const jobConfig = (job?.config ?? {}) as Record<string, unknown>;
      const sourcePlansBySku = jobConfig.source_plans_by_sku as
        | Record<string, unknown>
        | undefined;
      const perSkuSourcePlan = sourcePlansBySku?.[attempt.sku as string] ?? null;

      // For approved-source extraction, use a sentinel URL so the runner
      // knows this is a source-plan job, not a URL extraction job.
      const effectiveSourceUrl = perSkuSourcePlan
        ? "approved_source_extraction"
        : sourceUrl;

      return {
        id: attempt.id,
        job_id: attempt.job_id,
        sku: attempt.sku,
        source_url: effectiveSourceUrl,
        domain:
          extractDomain(sourceUrl) ||
          (perSkuSourcePlan ? "approved_source_extraction" : null),
        mode: attempt.mode ?? job?.mode ?? "mixed",
        model: attempt.model ?? job?.model ?? null,
        target_id: attempt.target_id ?? null,
        config: jobConfig,
        source_plan: perSkuSourcePlan,
        ai_credentials: aiCredentialsByJobId.get(jobId) ?? null,
        lease_token: lease.token,
        lease_expires_at: lease.expiresAt,
        test_mode: job?.test_mode ?? false,
      };
    });

    return NextResponse.json({ attempts });
  } catch (err) {
    console.error("Error claiming enrichment attempts:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Extract domain from a URL string.
 */
function extractDomain(url: string): string | null {
  if (!url) return null;
  // Sentinel value for approved-source extraction
  if (url === "approved_source_extraction") return "approved_source_extraction";
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}
