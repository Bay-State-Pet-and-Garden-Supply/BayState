/**
 * Extraction Progress API
 *
 * Returns per-UPC progress from enrichment_attempts and
 * enrichment_source_attempts. Used by the Extracting tab to
 * show product-level cascade progress when no enrichment jobs
 * exist (source cascade mode).
 *
 * POST { upcs: string[] } → { progress: Record<string, UpcExtractionProgress> }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

export interface SourceOutcomeRow {
  source_slug: string;
  outcome: string;
  attempted_at: string | null;
  error_message: string | null;
}

export interface UpcExtractionProgress {
  /** Overall status from enrichment_attempts (queued/running/success/partial/failed/cancelled) or null if no attempts */
  attemptStatus: string | null;
  /** Whether a runner has claimed this UPC */
  claimed: boolean;
  /** Runner name if claimed */
  runnerName: string | null;
  /** Count per source outcome */
  sourceCounts: {
    found: number;
    not_stocked: number;
    source_error: number;
    skipped: number;
  };
  /** Total sources expected from most recent cascade */
  totalSources: number;
  /** Per-source detail rows */
  sourceOutcomes: SourceOutcomeRow[];
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { upcs } = body as { upcs?: string[] };

    if (!Array.isArray(upcs) || upcs.length === 0) {
      return NextResponse.json(
        { error: "upcs array is required" },
        { status: 400 },
      );
    }

    if (upcs.length > 500) {
      return NextResponse.json(
        { error: "Cannot query more than 500 UPCs at once" },
        { status: 400 },
      );
    }

    const supabase = await createAdminClient();

    // 1. Fetch latest enrichment_attempt per UPC (for overall status)
    const { data: attempts, error: attemptsError } = await supabase
      .from("enrichment_attempts")
      .select("upc, status, claimed_by, lease_token, attempt_number")
      .in("upc", upcs)
      .order("created_at", { ascending: false });

    if (attemptsError) {
      return NextResponse.json(
        { error: `Failed to query enrichment_attempts: ${attemptsError.message}` },
        { status: 500 },
      );
    }

    // Deduplicate to latest attempt per UPC
    const latestAttemptMap = new Map<
      string,
      { status: string; claimed_by: string | null; lease_token: string | null; attempt_number: number }
    >();
    for (const a of attempts ?? []) {
      if (!latestAttemptMap.has(a.upc)) {
        latestAttemptMap.set(a.upc, {
          status: a.status,
          claimed_by: a.claimed_by,
          lease_token: a.lease_token,
          attempt_number: a.attempt_number,
        });
      }
    }

    // 2. Fetch enrichment_source_attempts for per-source outcomes
    const { data: sourceAttempts, error: sourceError } = await supabase
      .from("enrichment_source_attempts")
      .select("upc, source_slug, outcome, attempted_at, error_message")
      .in("upc", upcs)
      .order("attempted_at", { ascending: false });

    if (sourceError) {
      return NextResponse.json(
        { error: `Failed to query enrichment_source_attempts: ${sourceError.message}` },
        { status: 500 },
      );
    }

    // Group source attempts by UPC (dedup to latest per source_slug)
    const sourceByUpc = new Map<string, Map<string, SourceOutcomeRow>>();
    for (const sa of sourceAttempts ?? []) {
      let sourceMap = sourceByUpc.get(sa.upc);
      if (!sourceMap) {
        sourceMap = new Map();
        sourceByUpc.set(sa.upc, sourceMap);
      }
      if (!sourceMap.has(sa.source_slug)) {
        sourceMap.set(sa.source_slug, {
          source_slug: sa.source_slug,
          outcome: sa.outcome,
          attempted_at: sa.attempted_at,
          error_message: sa.error_message,
        });
      }
    }

    // 3. Build per-UPC progress
    const progress: Record<string, UpcExtractionProgress> = {};

    for (const upc of upcs) {
      const attempt = latestAttemptMap.get(upc);
      const sourceMap = sourceByUpc.get(upc) ?? new Map();
      const sourceOutcomes = Array.from(sourceMap.values());

      const sourceCounts = { found: 0, not_stocked: 0, source_error: 0, skipped: 0 };
      for (const so of sourceOutcomes) {
        if (so.outcome === "found") sourceCounts.found++;
        else if (so.outcome === "not_stocked") sourceCounts.not_stocked++;
        else if (so.outcome === "source_error") sourceCounts.source_error++;
        else if (so.outcome === "skipped") sourceCounts.skipped++;
      }

      progress[upc] = {
        attemptStatus: attempt?.status ?? null,
        claimed: Boolean(attempt?.claimed_by),
        runnerName: attempt?.claimed_by ?? null,
        sourceCounts,
        totalSources: sourceOutcomes.length,
        sourceOutcomes,
      };
    }

    return NextResponse.json({ progress });
  } catch (err) {
    console.error("Error fetching extraction progress:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
