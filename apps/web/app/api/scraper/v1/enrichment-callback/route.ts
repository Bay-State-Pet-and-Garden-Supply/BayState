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
import {
  normalizeSourceResults,
  determineSourceOutcomeStatus,
  buildSourceErrorMessage,
  hasTopLevelProductData,
} from "./source-outcomes";
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

// Legacy retry/status helpers are in the functions below.
// determineSourceOutcomeStatus and buildSourceErrorMessage
// are now imported from ./source-outcomes.

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
  const nameVal = result.product?.core?.name;
  const hasName = typeof nameVal === "string" && nameVal.trim().length > 0;
  const isHighConfidence = result.confidence.overall >= 0.5;

  if (result.status === "success" && hasName && isHighConfidence) {
    return { status: "processed", retry: false };
  }

  if (result.status === "partial" && result.confidence.overall >= 0.6 && hasName) {
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

    const normalized = normalizeEnrichmentResultForSources(enrichedResult as any, {
      requestedExtractionMode: requestedMode,
    });

    const isTestJob = (attemptData as { enrichment_jobs?: { test_mode?: boolean } }).enrichment_jobs?.test_mode === true;

    const resultPayload = {
      ...(rawBody as Record<string, unknown>),
      requested_extraction_mode:
        (rawBody as Record<string, unknown>).requested_extraction_mode ?? requestedMode,
    };

    const dbStatus = enrichedResult.status === "error" ? "failed" : enrichedResult.status;

    const { error: attemptUpdateError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: dbStatus,
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

    // ------------------------------------------------------------------
    // Normalize source outcomes and determine next pipeline status
    // ------------------------------------------------------------------
    const sourceResults = enrichedResult.source_results;
    const hasSourceResults = Array.isArray(sourceResults) && sourceResults.length > 0;

    // Normalize outcomes immediately — handles null outcomes, misclassified no-match
    // messages, and the found-wins policy.
    const normalizedResults = hasSourceResults
      ? normalizeSourceResults(sourceResults!)
      : [];

    const isApprovedSource = isApprovedSourceResult(enrichedResult as any);
    let nextStatus: string;
    let shouldQueueRetry: boolean;
    let nextAttemptNumber = (attemptData.attempt_number ?? 1) + 1;

    if (isApprovedSource) {
      if (hasSourceResults && normalizedResults.length > 0) {
        // Use normalized source outcomes (found-wins policy)
        nextStatus = determineSourceOutcomeStatus(normalizedResults).status;
      } else if (hasTopLevelProductData(enrichedResult as any)) {
        // No per-source results but we have usable product data at the top level
        nextStatus = "processed";
      } else {
        // No data anywhere — genuine failure
        nextStatus = "needs_attention";
      }
      // No auto-requeue for approved source extraction (manual re-extraction only)
      shouldQueueRetry = false;
    } else {
      // Legacy (non-approved-source) extraction uses existing retry logic
      const nextAttempt = determineNextStatus(enrichedResult as any, attemptData, requestedMode);
      shouldQueueRetry = nextAttempt.retry && nextAttemptNumber <= MAX_ENRICHMENT_ATTEMPTS;
      nextStatus = shouldQueueRetry
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
    }

    if (isTestJob) {
      console.log(`[Enrichment Callback] Test job detected for UPC ${enrichedResult.upc} - skipping products_ingestion update.`);
    } else {
      const { data: product } = await supabase
        .from("products_ingestion")
        .select("sources, brand_id")
        .eq("upc", enrichedResult.upc)
        .single();

      // Persist source-level outcomes to enrichment_source_attempts
      if (hasSourceResults) {
        const brandId = (product as { brand_id?: string | null } | null)?.brand_id ?? null;

        // Derive display_name/priority from the job's source plan if available
        const jobConfigData = (attemptData as { enrichment_jobs?: { config?: Record<string, unknown> } })?.enrichment_jobs?.config;
        const sourcePlansByUpc = jobConfigData?.source_plans_by_upc as Record<string, { priority?: Array<{ sourceSlug: string; displayName: string; priority: number }> }> | undefined;
        const sourcePlan = sourcePlansByUpc?.[enrichedResult.upc];
        const planEntryBySlug = new Map<string, { displayName: string; priority: number }>();
        if (sourcePlan?.priority) {
          for (const entry of sourcePlan.priority) {
            planEntryBySlug.set(entry.sourceSlug, {
              displayName: entry.displayName,
              priority: entry.priority,
            });
          }
        }

        // Delete existing source attempts for this job+upc to replace cleanly
        const { error: deleteError } = await supabase
          .from("enrichment_source_attempts")
          .delete()
          .eq("job_id", attemptData.job_id)
          .eq("upc", enrichedResult.upc);

        if (deleteError) {
          console.error("Failed to delete existing source attempts:", deleteError);
        }

        // Build rows from normalized source results
        const sourceAttemptRows = normalizedResults.map((nr) => {
          const planEntry = planEntryBySlug.get(nr.sourceSlug ?? "");
          return {
            job_id: attemptData.job_id,
            attempt_id: attemptData.id,
            upc: enrichedResult.upc,
            brand_id: brandId,
            source_type: nr.sourceType ?? "distributor",
            source_slug: nr.sourceSlug ?? "",
            display_name: planEntry?.displayName ?? nr.sourceSlug ?? nr.sourceType ?? "unknown",
            priority: planEntry?.priority ?? 100,
            outcome: nr.outcome,
            confidence: nr.confidence ?? null,
            matched_fields: nr.matchedFields ?? null,
            evidence_url: nr.evidenceUrl ?? null,
            error_code: nr.errorCode ?? null,
            error_message: nr.errorMessage ?? null,
            raw_result: nr as unknown as Record<string, unknown>,
            attempted_at: nr.attemptedAt ?? new Date().toISOString(),
          };
        });

        const { error: sourceAttemptError } = await supabase
          .from("enrichment_source_attempts")
          .insert(sourceAttemptRows);

        if (sourceAttemptError) {
          console.error("Failed to persist source attempts:", sourceAttemptError);
        }
      }

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
            const existing = (updatedSources[sourceResult.sourceSlug] as Record<string, unknown>) || {};
            const existingMetadata: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(existing)) {
              if (k.startsWith("_")) {
                existingMetadata[k] = v;
              }
            }
            updatedSources[sourceResult.sourceSlug] = {
              ...existingMetadata,
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

      let errorMessage: string | null = null;
      if (nextStatus === "needs_attention") {
        if (hasSourceResults) {
          errorMessage = buildSourceErrorMessage(normalizedResults);
        } else {
          errorMessage = "No source results returned — runner may need update.";
        }
      } else if (nextStatus === "imported" && enrichedResult.status === "failed") {
        errorMessage = enrichedResult.validation?.warnings?.[0] ?? "Enrichment failed";
      }

      const updatePayload: Record<string, unknown> = {
        sources: durableSources,
        pipeline_status: nextStatus,
        confidence_score: mergedEnriched.confidence_score,
        error_message: errorMessage,
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

    if (shouldQueueRetry && !isApprovedSource) {
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
        (attempt) => 
          attempt.status === "success" || 
          attempt.status === "partial" || 
          attempt.status === "failed" ||
          attempt.status === "cancelled" ||
          attempt.status === "error",
      ).length;
      const failed = latestAttempts.filter(
        (attempt) => attempt.status === "failed" || attempt.status === "error",
      ).length;

      const isComplete = completed >= latestAttempts.length;
      const jobStatus = isComplete
        ? (failed === latestAttempts.length && latestAttempts.length > 0)
          ? "failed"
          : failed > 0
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
