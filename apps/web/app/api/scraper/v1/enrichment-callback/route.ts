/**
 * POST /api/scraper/v1/enrichment-callback
 *
 * Runner callback endpoint for Source Cascade extraction results.
 *
 * The scraper runner (apps/scraper/core/api_client.py submit_enrichment_result())
 * POSTs the full EnrichmentResultV1 JSON here after completing a UPC extraction.
 *
 * Flow:
 * 1. Validate runner auth
 * 2. Parse EnrichmentResultV1 payload (with transport fields _attempt_id, _lease_token)
 * 3. Verify attempt ownership and lease validity (return 409 on mismatch)
 * 4. Build per-sourceSlug canonical payloads for products_ingestion.sources
 * 5. Persist source data through products-ingestion helpers
 * 6. Determine final status using ADR 0002 found-wins rules
 * 7. Write per-source outcomes to enrichment_source_attempts (delete-then-insert for idempotency)
 * 8. Update enrichment_attempts status/result/completed fields
 * 9. Update enrichment_jobs counters
 *
 * ADR 0002 Status Rules:
 *   - Any source found  → processed
 *   - No found + any source_error → needs_attention
 *   - All clean not_stocked/empty → processed
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateRunnerAuth } from "@/lib/scraper-auth";
import {
  EnrichmentResultV1Schema,
  buildSourcePayloadsByUpc,
  buildSourceAttemptRows,
  determineStatusFromSourceResults,
  normalizeSourceOutcome,
  type SourceResultInfo,
} from "@/lib/scraper-callback/enrichment-result";
import { persistProductsIngestionSourcesPartial } from "@/lib/scraper-callback/products-ingestion";

async function triggerPostScrapeOcr(supabase: any, upc: string) {
  try {
    const { data: product } = await supabase
      .from('products_ingestion')
      .select('sources, image_candidates, selected_images')
      .eq('upc', upc)
      .single();

    if (!product) return;

    // Collect image URLs from selected_images, image_candidates, or sources
    const imageUrls: string[] = [];
    const selectedImgs = product.selected_images as unknown[] | null;
    if (Array.isArray(selectedImgs)) {
      for (const item of selectedImgs) {
        if (imageUrls.length >= 2) break;
        if (typeof item === 'string' && item.trim()) {
          imageUrls.push(item.trim());
        } else if (item && typeof item === 'object' && 'url' in item) {
          const url = (item as { url: unknown }).url;
          if (typeof url === 'string' && url.trim()) imageUrls.push(url.trim());
        }
      }
    }
    if (imageUrls.length < 2) {
      const candidates = product.image_candidates as string[] | null;
      if (Array.isArray(candidates)) {
        for (const url of candidates) {
          if (imageUrls.length >= 2) break;
          if (typeof url === 'string' && url.trim() && !imageUrls.includes(url.trim())) {
            imageUrls.push(url.trim());
          }
        }
      }
    }
    if (imageUrls.length < 2 && product.sources && typeof product.sources === 'object') {
      const { extractImageCandidatesFromSources } = await import('@/lib/product-sources');
      const candidateUrls = extractImageCandidatesFromSources(product.sources, 2);
      for (const url of candidateUrls) {
        if (imageUrls.length >= 2) break;
        if (!imageUrls.includes(url)) imageUrls.push(url);
      }
    }

    if (imageUrls.length > 0) {
      const { createPackagingExtractionJobs } = await import('@/lib/packaging/workflow');
      const { getPackagingTitleMode } = await import('@/lib/packaging-settings');
      const mode = await getPackagingTitleMode().catch(() => 'disabled');
      if (mode !== 'disabled') {
        await createPackagingExtractionJobs([upc], { [upc]: imageUrls }, { trigger: 'consolidation' });
        console.log(`[Enrichment Callback] Triggered post-scrape OCR for UPC: ${upc} with ${imageUrls.length} images`);
      }
    }
  } catch (err) {
    console.error(`[Enrichment Callback] Failed to trigger post-scrape OCR for ${upc}:`, err);
  }
}

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
    // 2. Parse and validate the enrichment result payload
    const rawBody = await request.json();
    const parseResult = EnrichmentResultV1Schema.safeParse(rawBody);

    if (!parseResult.success) {
      console.error(
        "[Enrichment Callback] Invalid payload:",
        parseResult.error.format(),
      );
      return NextResponse.json(
        {
          error: "Invalid enrichment result payload",
          details: parseResult.error.issues.slice(0, 5).map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const payload = parseResult.data;
    const attemptId = payload._attempt_id;
    const leaseToken = payload._lease_token;
    // Use payload.upc for response messages only — always trust the attempt's UPC
    // for product-level operations. The runner's exception path sends upc: "unknown".
    const payloadUpc = payload.upc;

    if (!attemptId) {
      return NextResponse.json(
        { error: "_attempt_id is required" },
        { status: 400 },
      );
    }

    const supabase = await createAdminClient();
    const nowIso = new Date().toISOString();

    // 3. Verify attempt exists and lease is valid
    const { data: attempt, error: attemptError } = await supabase
      .from("enrichment_attempts")
      .select("id, status, lease_token, job_id, upc")
      .eq("id", attemptId)
      .single();

    if (attemptError || !attempt) {
      console.error(
        `[Enrichment Callback] Attempt ${attemptId} not found:`,
        attemptError?.message ?? "not found",
      );
      return NextResponse.json(
        { error: "Enrichment attempt not found" },
        { status: 404 },
      );
    }

    // Check lease — reject if lease doesn't match (replay or stale callback)
    // Required: if the attempt was claimed with a lease, the callback must present it.
    // Also reject if lease is present but expired (checked via lease_expires_at).
    // NOTE: This check MUST come after the terminal-status guard above so that
    // already-completed attempts don't reject on lease for idempotent replays.
    if (attempt.status !== "success" && attempt.status !== "partial" && attempt.status !== "failed") {
      if (attempt.lease_token) {
        if (!leaseToken) {
          console.warn(
            `[Enrichment Callback] Missing lease token for attempt ${attemptId} ` +
              `(expected ${attempt.lease_token})`,
          );
          return NextResponse.json(
            { error: "Lease token required — attempt was claimed with a lease" },
            { status: 409 },
          );
        }
        if (attempt.lease_token !== leaseToken) {
          console.warn(
            `[Enrichment Callback] Lease mismatch for attempt ${attemptId}: ` +
              `got ${leaseToken}, expected ${attempt.lease_token}`,
          );
          return NextResponse.json(
            { error: "Lease token mismatch — stale or replayed callback" },
            { status: 409 },
          );
        }
      }
    }

    // Prevent double-processing
    if (attempt.status === "success" || attempt.status === "partial" || attempt.status === "failed") {
      console.warn(
        `[Enrichment Callback] Attempt ${attemptId} already completed (status=${attempt.status}), skipping`,
      );
      return NextResponse.json({
        success: true,
        status: "already_completed",
        upc: payloadUpc,
      });
    }

    // Always use the attempt's UPC for product-level operations — the runner's
    // exception callback path sends upc: "unknown" in the payload.
    const upc = String(attempt.upc);

    // Guard: if payload.upc differs from attempt.upc, log a warning but proceed
    // with the correct UPC (attempt.upc is authoritative).
    if (payloadUpc && payloadUpc !== upc) {
      console.warn(
        `[Enrichment Callback] UPC mismatch for attempt ${attemptId}: ` +
          `payload says "${payloadUpc}", attempt says "${upc}"`,
      );
    }

    const jobId = String(attempt.job_id);

    // 4. Build per-sourceSlug payloads from source_results
    const sourceResults = (payload.source_results ?? []) as SourceResultInfo[];

    // Each source result's product provides per-source data.
    // buildSourcePayloadsByUpc maps sourceSlug → canonical source payload.
    const sourcePayloads = buildSourcePayloadsByUpc(sourceResults);

    // 5. Determine final product status using ADR 0002 found-wins rules
    const outcomes = sourceResults.map((sr) => normalizeSourceOutcome(sr.outcome));

    // If there are no source_results, use the top-level status/confidence
    // to determine if anything was found
    let finalStatus: string;
    if (outcomes.length > 0) {
      finalStatus = determineStatusFromSourceResults(sourceResults);
    } else if (payload.status === "success" || payload.status === "partial") {
      finalStatus = "processed";
    } else {
      // Failed with no source_results — route to needs_attention
      finalStatus = "needs_attention";
    }

    // 6. Persist source data to products_ingestion.sources per sourceSlug
    // Use the statusByUpc parameter so the cascade found-wins decision takes
    // precedence over the automatic hasMeaningfulData → processed rule.
    if (Object.keys(sourcePayloads).length > 0) {
      const upcData: Record<string, Record<string, unknown>> = {
        [upc]: sourcePayloads,
      };

      try {
        await persistProductsIngestionSourcesPartial(
          supabase,
          upcData,
          false, // isTestJob
          nowIso,
          undefined, // provenance
          { [upc]: finalStatus as any }, // statusByUpc — explicit cascade status
        );
      } catch (persistErr) {
        console.error(
          `[Enrichment Callback] Failed to persist source data for ${upc}:`,
          persistErr,
        );
        return NextResponse.json(
          { error: "Failed to persist source data" },
          { status: 500 },
        );
      }
    } else {
      // No source payloads (e.g. all sources errored or none returned data).
      // Still need to transition the product status.
      const { error: statusError } = await supabase
        .from("products_ingestion")
        .update({
          pipeline_status: finalStatus,
          updated_at: nowIso,
          ...(finalStatus === "needs_attention"
            ? { error_message: "All cascade sources failed or errored" }
            : {}),
        })
        .eq("upc", upc);

      if (statusError) {
        console.error(
          `[Enrichment Callback] Failed to update status for ${upc}:`,
          statusError,
        );
        return NextResponse.json(
          { error: "Failed to update product status" },
          { status: 500 },
        );
      }
    }

    // 7. Write per-source outcomes to enrichment_source_attempts
    // Idempotency: delete existing rows for this attempt_id before inserting
    if (sourceResults.length > 0) {
      // Delete any existing source attempt rows for this attempt (idempotent replay safety)
      await supabase
        .from("enrichment_source_attempts")
        .delete()
        .eq("attempt_id", attemptId);

      // Load brand_id from the product for the denormalized FK
      const { data: product } = await supabase
        .from("products_ingestion")
        .select("brand_id")
        .eq("upc", upc)
        .single();

      const brandId = product?.brand_id ?? null;

      const sourceRows = buildSourceAttemptRows(
        attemptId,
        jobId,
        upc,
        brandId,
        sourceResults,
      );

      if (sourceRows.length > 0) {
        const { error: insertSourceError } = await supabase
          .from("enrichment_source_attempts")
          .insert(sourceRows);

        if (insertSourceError) {
          console.error(
            `[Enrichment Callback] Failed to insert source attempts:`,
            insertSourceError,
          );
          // Non-fatal — source data is already persisted in products_ingestion
        }
      }
    }

    // 8. Update enrichment_attempts status
    const attemptStatus =
      payload.status === "success"
        ? "success"
        : payload.status === "partial"
          ? "partial"
          : "failed";

    const { error: updateAttemptError } = await supabase
      .from("enrichment_attempts")
      .update({
        status: attemptStatus,
        result: payload.product as Record<string, unknown>,
        confidence_overall: payload.confidence.overall,
        error_message: payload._error_message ?? null,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", attemptId);

    if (updateAttemptError) {
      console.error(
        `[Enrichment Callback] Failed to update attempt ${attemptId}:`,
        updateAttemptError,
      );
    }

    // 9. Update enrichment_jobs counters via the existing RPC
    try {
      await supabase.rpc("update_enrichment_job_counters", {
        p_job_id: jobId,
      });
    } catch (counterErr) {
      console.error(
        `[Enrichment Callback] Failed to update job counters for ${jobId}:`,
        counterErr,
      );
      // Non-fatal — the counter will update on the next callback call
    }

    // 10. Update enrichment_jobs current_upc tracking
    await supabase
      .from("enrichment_jobs")
      .update({
        current_upc: null, // Clear current UPC — this attempt is done
        last_event_at: nowIso,
        last_log_at: nowIso,
        last_log_level: attemptStatus === "failed" ? "error" : "info",
        last_log_message:
          attemptStatus === "success"
            ? `Enrichment completed for ${upc}`
            : `${payload.status.charAt(0).toUpperCase() + payload.status.slice(1)} enrichment for ${upc}`,
      })
      .eq("id", jobId);

    if (finalStatus === "processed") {
      await triggerPostScrapeOcr(supabase, upc);
    }

    return NextResponse.json({
      success: true,
      upc,
      pipeline_status: finalStatus,
      source_count: sourceResults.length,
    });
  } catch (err) {
    console.error("[Enrichment Callback] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
