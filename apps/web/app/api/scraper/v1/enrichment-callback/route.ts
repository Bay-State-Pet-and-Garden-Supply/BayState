/**
 * Enrichment Callback API (v2)
 *
 * Worker endpoint to submit enrichment results.
 * Parses and validates EnrichmentResultV1 payload, normalizes
 * into sources.enriched, and updates product pipeline status.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { validateRunnerAuth } from "@/lib/scraper-auth";
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

    // Low confidence partial → retry if budget remains
    const retryCount = attempt.retry_count ?? 0;
    if (retryCount < failureThreshold) {
      return { status: "extracting", retry: true };
    }

    return { status: "failed", retry: false };
  }

  if (result.status === "failed") {
    const retryCount = attempt.retry_count ?? 0;
    if (retryCount < failureThreshold) {
      return { status: "extracting", retry: true };
    }
    return { status: "failed", retry: false };
  }

  return { status: "failed", retry: false };
}

// =============================================================================
// POST - Receive Enrichment Result
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

    // Parse body — extract transport fields (_attempt_id, _lease_token etc.)
    const rawBody = await request.json();
    const attemptId = (rawBody as Record<string, unknown>)._attempt_id as
      | string
      | undefined;
    const leaseToken = (rawBody as Record<string, unknown>)._lease_token as
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
      .select("id, job_id, retry_count")
      .eq("sku", enrichedResult.sku)
      .order("created_at", { ascending: false })
      .limit(1);

    if (attemptId) {
      attemptQuery = supabase
        .from("enrichment_attempts")
        .select("id, job_id, retry_count")
        .eq("id", attemptId);
    }

    const { data: attemptData } = await attemptQuery.single();
    if (!attemptData) {
      return NextResponse.json(
        { error: `No enrichment attempt found for SKU ${enrichedResult.sku}` },
        { status: 404 }
      );
    }

    // Update the enrichment attempt
    const nextAttempt = determineNextStatus(enrichedResult, attemptData);

    const { error: attemptUpdateError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: enrichedResult.status,
        result: rawBody as any,
        normalized_source: normalized as any,
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

    // Merge normalized source into product's sources.enriched
    const { data: product } = await supabase
      .from("products_ingestion")
      .select("sources")
      .eq("sku", enrichedResult.sku)
      .single();

    const currentSources = (product?.sources as Record<string, unknown>) ?? {};
    const updatedSources = {
      ...currentSources,
      enriched: normalized as any,
    };

    // Determine next status and update product
    const nextStatus = nextAttempt.status;
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

    // Update enrichment_jobs counters
    const { data: jobCounts } = await supabase
      .from("enrichment_attempts")
      .select("status")
      .eq("job_id", attemptData.job_id);

    if (jobCounts) {
      const completed = jobCounts.filter(
        (a: { status: string }) =>
          a.status === "success" || a.status === "partial" || a.status === "failed"
      ).length;
      const failed = jobCounts.filter(
        (a: { status: string }) => a.status === "failed"
      ).length;

      const isComplete = completed >= jobCounts.length;
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
