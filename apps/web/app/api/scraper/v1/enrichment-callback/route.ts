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
import {
  replaceInlineImageDataUrls,
  buildProductImageStorageFolder,
} from "@/lib/product-image-storage";
import {
  mergeEnrichedSource,
  isTerminalApprovedSourceFailure,
} from "@/lib/enrichment/merge-enriched-source";
import { safeValidateEnrichmentResultV1 } from "@/lib/enrichment/validation";
import { normalizeEnrichmentResultForSources } from "@/lib/enrichment/normalize-result";
import type {
  EnrichmentResultV1,
  RequestedExtractionMode,
} from "@/lib/enrichment/contracts";

function getSupabaseAdmin(): SupabaseClient {
  const url = SUPABASE_URL;
  const key = SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(url, key);
}

const REQUESTED_EXTRACTION_MODES: RequestedExtractionMode[] = [
  "mixed",
  "distributor_only",
  "ai_only",
];
const MAX_ENRICHMENT_ATTEMPTS = 5;

interface AttemptLike {
  retry_count?: number | null;
  attempt_number?: number | null;
}

function isRequestedExtractionMode(value: unknown): value is RequestedExtractionMode {
  return typeof value === "string" && REQUESTED_EXTRACTION_MODES.includes(value as RequestedExtractionMode);
}

function determineRequestedExtractionMode(options: {
  attemptMode?: unknown;
  jobMode?: unknown;
  jobConfig?: Record<string, unknown> | null;
  resultRequestedMode?: unknown;
}): RequestedExtractionMode {
  const candidates = [
    options.attemptMode,
    options.jobMode,
    options.jobConfig?.extraction_mode,
    options.resultRequestedMode,
  ].filter(isRequestedExtractionMode);

  const specificMode = candidates.find((candidate) => candidate !== "mixed");
  if (specificMode) {
    return specificMode;
  }

  return candidates[0] ?? "mixed";
}

function isApprovedSourceResult(result: EnrichmentResultV1): boolean {
  return result.source.url === "approved_source_extraction"
    || typeof result.source.source_slug === "string"
    || Boolean(result.source_results?.length);
}

export function shouldRetryEnrichmentResult(
  result: EnrichmentResultV1,
  attempt: AttemptLike,
  requestedMode: RequestedExtractionMode,
): boolean {
  // Cumulative safety net: never retry more than 5 times total per UPC.
  const attemptNumber = attempt.attempt_number ?? 1;
  if (attemptNumber >= MAX_ENRICHMENT_ATTEMPTS) {
    return false;
  }

  const failureThreshold = 3;
  const retryCount = attempt.retry_count ?? 0;

  if (retryCount >= failureThreshold) {
    return false;
  }

  if (result.status === "success") {
    return false;
  }

  if (result.status === "partial" && result.confidence.overall >= 0.6) {
    return false;
  }

  if (
    isApprovedSourceResult(result)
    && isTerminalApprovedSourceFailure(result.validation?.warnings)
  ) {
    return false;
  }

  // Distributor-only extraction is deterministic: same UPC searched across
  // the same distributor catalogs will always produce the same result.
  if (requestedMode === "distributor_only" && result.status === "failed") {
    return false;
  }

  return true;
}

/**
 * Determines next pipeline status based on enrichment result quality.
 */
function determineNextStatus(
  result: EnrichmentResultV1,
  attempt: AttemptLike,
  requestedMode: RequestedExtractionMode,
): { status: string; retry: boolean } {
  if (result.status === "success") {
    return { status: "processed", retry: false };
  }

  if (result.status === "partial" && result.confidence.overall >= 0.6) {
    return { status: "processed", retry: false };
  }

  const retry = shouldRetryEnrichmentResult(result, attempt, requestedMode);
  if (retry) {
    return { status: "extracting", retry: true };
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

    const supabase = getSupabaseAdmin();

    const rawBody = await request.json();
    const attemptId = (rawBody as Record<string, unknown>)._attempt_id as string | undefined;

    const enrichedResult = safeValidateEnrichmentResultV1(rawBody);

    if (!enrichedResult) {
      return NextResponse.json(
        {
          error: "Invalid enrichment result payload",
        },
        { status: 400 },
      );
    }

    let attemptQuery = supabase
      .from("enrichment_attempts")
      .select(`
        id,
        job_id,
        mode,
        attempt_number,
        retry_count,
        enrichment_jobs!inner (
          test_mode,
          mode,
          config
        )
      `)
      .eq("upc", enrichedResult.upc)
      .order("created_at", { ascending: false })
      .limit(1);

    if (attemptId) {
      attemptQuery = supabase
        .from("enrichment_attempts")
        .select(`
          id,
          job_id,
          mode,
          attempt_number,
          retry_count,
          enrichment_jobs!inner (
            test_mode,
            mode,
            config
          )
        `)
        .eq("id", attemptId);
    }

    const { data: attemptData } = await attemptQuery.single();
    if (!attemptData) {
      return NextResponse.json(
        { error: `No enrichment attempt found for UPC ${enrichedResult.upc}` },
        { status: 404 },
      );
    }

    const requestedMode = determineRequestedExtractionMode({
      attemptMode: (attemptData as { mode?: unknown }).mode,
      jobMode: (attemptData as { enrichment_jobs?: { mode?: unknown } }).enrichment_jobs?.mode,
      jobConfig: ((attemptData as { enrichment_jobs?: { config?: unknown } }).enrichment_jobs?.config ?? null) as Record<string, unknown> | null,
      resultRequestedMode: enrichedResult.requested_extraction_mode,
    });

    const normalized = normalizeEnrichmentResultForSources(enrichedResult, {
      requestedExtractionMode: requestedMode,
    });

    const isTestJob = (attemptData as { enrichment_jobs?: { test_mode?: boolean } }).enrichment_jobs?.test_mode === true;
    const nextAttempt = determineNextStatus(enrichedResult, attemptData, requestedMode);

    const resultPayload = {
      ...(rawBody as Record<string, unknown>),
      requested_extraction_mode:
        (rawBody as Record<string, unknown>).requested_extraction_mode ?? requestedMode,
    };

    const { error: attemptUpdateError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: enrichedResult.status,
        result: resultPayload as Record<string, unknown>,
        normalized_source: normalized as unknown as Record<string, unknown>,
        confidence_overall: enrichedResult.confidence.overall,
        field_confidence: enrichedResult.confidence.fields,
        validation: enrichedResult.validation,
        retry_count: (attemptData.retry_count ?? 0) + 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attemptData.id);

    if (attemptUpdateError) {
      console.error("Failed to update enrichment attempt:", attemptUpdateError);
    }

    const nextAttemptNumber = (attemptData.attempt_number ?? 1) + 1;
    const shouldQueueRetry = nextAttempt.retry && nextAttemptNumber <= MAX_ENRICHMENT_ATTEMPTS;
    const nextStatus = shouldQueueRetry
      ? nextAttempt.status
      : nextAttempt.status === "processed"
        ? "processed"
        : "imported";

    if (nextAttempt.retry && !shouldQueueRetry) {
      console.warn(
        `[Enrichment Callback] Retry hard cap reached for UPC ${enrichedResult.upc} ` +
        `(attempt ${attemptData.attempt_number ?? 1}/${MAX_ENRICHMENT_ATTEMPTS}). Finalizing without requeue.`
      );
    }

    if (isTestJob) {
      console.log(`[Enrichment Callback] Test job detected for UPC ${enrichedResult.upc} - skipping products_ingestion update.`);
    } else {
      const { data: product } = await supabase
        .from("products_ingestion")
        .select("sources")
        .eq("upc", enrichedResult.upc)
        .single();

      const currentSources = (product?.sources as Record<string, unknown>) ?? {};
      const mergedEnriched = mergeEnrichedSource(currentSources.enriched, normalized, {
        incomingStatus: enrichedResult.status,
      });
      const updatedSources: Record<string, unknown> = {
        ...currentSources,
        enriched: mergedEnriched as unknown as Record<string, unknown>,
      };

      if (Array.isArray(enrichedResult.source_results)) {
        for (const sourceResult of enrichedResult.source_results) {
          if (sourceResult.sourceSlug && sourceResult.product) {
            updatedSources[sourceResult.sourceSlug] = {
              ...((updatedSources[sourceResult.sourceSlug] as Record<string, unknown>) || {}),
              ...sourceResult.product,
              _scraped_at: enrichedResult.extracted_at,
              _url: sourceResult.evidenceUrl || enrichedResult.source.url,
            };
          }
        }
      }

      const durableSourcesResult = await replaceInlineImageDataUrls(supabase, updatedSources, {
        folderPath: buildProductImageStorageFolder("pipeline-sources", enrichedResult.upc),
        productId: enrichedResult.upc,
        onError: (message, error) => {
          console.warn(`[Enrichment Callback] ${message}`, error);
        },
      });
      const durableSources = durableSourcesResult.value;

      const updatePayload: Record<string, unknown> = {
        sources: durableSources,
        pipeline_status: nextStatus,
        confidence_score: mergedEnriched.confidence_score,
        error_message:
          nextStatus === "imported" && enrichedResult.status === "failed"
            ? enrichedResult.validation?.warnings?.[0] ?? "Enrichment failed"
            : null,
        updated_at: new Date().toISOString(),
      };

      const { error: productUpdateError } = await supabase
        .from("products_ingestion")
        .update(updatePayload)
        .eq("upc", enrichedResult.upc);

      if (productUpdateError) {
        console.error("Failed to update product:", productUpdateError);
        return NextResponse.json(
          { error: productUpdateError.message },
          { status: 500 },
        );
      }
    }

    if (shouldQueueRetry) {
      await supabase.from("enrichment_attempts").insert({
        job_id: attemptData.job_id,
        upc: enrichedResult.upc,
        attempt_number: nextAttemptNumber,
        status: "queued",
        mode: requestedMode,
        model: enrichedResult.model,
        source_url: enrichedResult.source.url,
      });
    }

    const { data: jobAttempts } = await supabase
      .from("enrichment_attempts")
      .select("upc, attempt_number, status")
      .eq("job_id", attemptData.job_id);

    if (jobAttempts) {
      const latestAttemptsByUpc = new Map<string, { attempt_number: number; status: string }>();
      for (const attempt of jobAttempts) {
        const existing = latestAttemptsByUpc.get(attempt.upc);
        if (!existing || attempt.attempt_number > existing.attempt_number) {
          latestAttemptsByUpc.set(attempt.upc, {
            attempt_number: attempt.attempt_number,
            status: attempt.status,
          });
        }
      }

      const latestAttempts = Array.from(latestAttemptsByUpc.values());

      const completed = latestAttempts.filter(
        (attempt) => attempt.status === "success" || attempt.status === "partial" || attempt.status === "failed",
      ).length;
      const failed = latestAttempts.filter(
        (attempt) => attempt.status === "failed",
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
      upc: enrichedResult.upc,
      next_status: nextStatus,
      confidence: enrichedResult.confidence.overall,
      requested_extraction_mode: requestedMode,
    });
  } catch (err) {
    console.error("Error processing enrichment callback:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
