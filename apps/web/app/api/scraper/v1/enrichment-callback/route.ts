/**
 * Enrichment Callback API (v2)
 *
 * Worker endpoint to submit enrichment results.
 * Parses and validates EnrichmentResultV1 payload, normalizes
 * into sources.enriched, and updates product pipeline status.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { validateActiveRunner } from "@/lib/scraper-auth";
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { safeValidateEnrichmentResultV1 } from "@/lib/enrichment/validation";
import { normalizeEnrichmentResultForSources } from "@/lib/enrichment/normalize-result";
import type { EnrichmentResultV1 } from "@/lib/enrichment/contracts";

function getSupabaseAdmin(): SupabaseClient {
  const url = SUPABASE_URL;
  const key = SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(url, key);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Determines next pipeline status based on enrichment result quality.
 */
function determineNextStatus(
  result: EnrichmentResultV1,
  attempt: { retry_count?: number; id?: string }
): { status: string; retry: boolean } {
  const failureThreshold = 3;

  if (result.status === "success") {
    // Success: high-confidence → processed, partial → processed with review
    if (result.confidence.overall >= 0.7) {
      return { status: "processed", retry: false };
    }
    // Low confidence success: still move to processed but could be reviewed
    return { status: "processed", retry: false };
  }

  if (result.status === "partial") {
    // Partial with acceptable confidence → processed
    if (result.confidence.overall >= 0.6) {
      return { status: "processed", retry: false };
    }

    // Low confidence partial -> retry if budget remains
    const retryCount = attempt.retry_count ?? 0;
    if (retryCount < failureThreshold) {
      return { status: "extracting", retry: true };
    }

    return { status: "imported", retry: false };
  }

  if (result.status === "failed") {
    const retryCount = attempt.retry_count ?? 0;
    if (retryCount < failureThreshold) {
      return { status: "extracting", retry: true };
    }
    return { status: "imported", retry: false };
  }

  return { status: "imported", retry: false };
}

// =============================================================================
// POST - Receive Enrichment Result
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const activeRunner = await validateActiveRunner(request);

    if (!activeRunner.isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!activeRunner.isEnabled) {
      if (activeRunner.mismatchResponse) {
        return activeRunner.mismatchResponse;
      }
      return NextResponse.json({ error: "Forbidden: Runner is disabled" }, { status: 403 });
    }

    const runner = activeRunner.runner!;

    const supabase = getSupabaseAdmin();

    // Parse body — extract transport fields (_attempt_id, _lease_token etc.)
    const rawBody = await request.json();
    const attemptId = (rawBody as Record<string, unknown>)._attempt_id as
      | string
      | undefined;

    // Validate the core EnrichmentResultV1 payload (transport fields stripped by Zod)
    const enrichedResult = safeValidateEnrichmentResultV1(rawBody);

    if (!enrichedResult) {
      return NextResponse.json(
        {
          error: "Invalid enrichment result payload",
        },
        { status: 400 }
      );
    }

    // Normalize for persistence
    const normalized = normalizeEnrichmentResultForSources(enrichedResult);

    // Find the enrichment attempt by attempt_id from transport, or fall back to SKU lookup
    let attemptQuery = supabase
      .from("enrichment_attempts")
      .select(`
        id, 
        job_id, 
        retry_count,
        enrichment_jobs!inner (
          test_mode
        )
      `)
      .eq("sku", enrichedResult.sku)
      .order("created_at", { ascending: false })
      .limit(1);

    if (attemptId) {
      attemptQuery = supabase
        .from("enrichment_attempts")
        .select(`
          id, 
          job_id, 
          retry_count,
          enrichment_jobs!inner (
            test_mode
          )
        `)
        .eq("id", attemptId);
    }

    const { data: attemptData } = await attemptQuery.single();
    if (!attemptData) {
      return NextResponse.json(
        { error: `No enrichment attempt found for SKU ${enrichedResult.sku}` },
        { status: 404 }
      );
    }

    const isTestJob = (attemptData as Record<string, { test_mode?: boolean }>).enrichment_jobs?.test_mode === true;

    // Update the enrichment attempt
    const nextAttempt = determineNextStatus(enrichedResult, attemptData);

    const { error: attemptUpdateError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: enrichedResult.status,
        result: rawBody as Record<string, unknown>,
        normalized_source: normalized as unknown as Record<string, unknown>,
        confidence_overall: enrichedResult.confidence.overall,
        field_confidence: enrichedResult.confidence.fields,
        validation: enrichedResult.validation,
        retry_count: attemptData.retry_count + 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attemptData.id);

    if (attemptUpdateError) {
      console.error("Failed to update enrichment attempt:", attemptUpdateError);
    }

    const nextStatus = nextAttempt.status;

    if (isTestJob) {
      console.log(`[Enrichment Callback] Test job detected for SKU ${enrichedResult.sku} - skipping products_ingestion update.`);
    } else {
      // Merge normalized source into product's sources.enriched
      const { data: product } = await supabase
        .from("products_ingestion")
        .select("sources")
        .eq("sku", enrichedResult.sku)
        .single();

      const currentSources = (product?.sources as Record<string, unknown>) ?? {};
      const updatedSources: Record<string, unknown> = {
        ...currentSources,
        enriched: normalized as unknown as Record<string, unknown>,
      };

      // Merge per-source results into products_ingestion.sources
      if (enrichedResult.source_results && Array.isArray(enrichedResult.source_results)) {
        for (const sr of enrichedResult.source_results) {
          if (sr.sourceSlug && sr.product) {
            updatedSources[sr.sourceSlug] = {
              ...((updatedSources[sr.sourceSlug] as Record<string, unknown>) || {}),
              ...sr.product,
              _scraped_at: enrichedResult.extracted_at,
              _url: sr.evidenceUrl || enrichedResult.source.url,
            };
          }
        }
      }

      // Update product
      const updatePayload: Record<string, unknown> = {
        sources: updatedSources,
        pipeline_status: nextStatus,
        confidence_score: enrichedResult.confidence.overall,
        updated_at: new Date().toISOString(),
      };

      if (nextStatus === "failed") {
        updatePayload.error_message =
          (enrichedResult.validation?.warnings ?? []).join("; ") ||
          "Enrichment failed after retries";
      }

      const { error: productUpdateError } = await supabase
        .from("products_ingestion")
        .update(updatePayload)
        .eq("sku", enrichedResult.sku);

      if (productUpdateError) {
        console.error("Failed to update product:", productUpdateError);
        return NextResponse.json(
          { error: productUpdateError.message },
          { status: 500 }
        );
      }
    }

    // If result indicates retry, create next attempt
    if (nextAttempt.retry) {
      await supabase.from("enrichment_attempts").insert({
        job_id: attemptData.job_id,
        sku: enrichedResult.sku,
        attempt_number: attemptData.retry_count + 2,
        status: "queued",
        mode: enrichedResult.mode,
        model: enrichedResult.model,
        source_url: enrichedResult.source.url,
      });
    }

    // Update enrichment_jobs counters based on the latest attempt per SKU
    const { data: jobAttempts } = await supabase
      .from("enrichment_attempts")
      .select("sku, attempt_number, status")
      .eq("job_id", attemptData.job_id);

    if (jobAttempts) {
      const latestAttemptsBySku = new Map<string, { attempt_number: number; status: string }>();
      for (const attempt of jobAttempts) {
        const existing = latestAttemptsBySku.get(attempt.sku);
        if (!existing || attempt.attempt_number > existing.attempt_number) {
          latestAttemptsBySku.set(attempt.sku, {
            attempt_number: attempt.attempt_number,
            status: attempt.status,
          });
        }
      }

      const latestAttempts = Array.from(latestAttemptsBySku.values());

      const completed = latestAttempts.filter(
        (a) => a.status === "success" || a.status === "partial" || a.status === "failed"
      ).length;
      const failed = latestAttempts.filter(
        (a) => a.status === "failed"
      ).length;

      const isComplete = completed >= latestAttempts.length;
      const jobStatus = isComplete
        ? failed > 0
          ? "completed_with_errors"
          : "completed"
        : "running";

      await supabase
        .from("enrichment_jobs")
        .update({
          completed_count: completed,
          failed_count: failed,
          status: jobStatus,
          completed_at: isComplete ? new Date().toISOString() : null,
        })
        .eq("id", attemptData.job_id);
    }

    return NextResponse.json({
      success: true,
      sku: enrichedResult.sku,
      next_status: nextStatus,
      confidence: enrichedResult.confidence.overall,
    });
  } catch (err) {
    console.error("Error processing enrichment callback:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
