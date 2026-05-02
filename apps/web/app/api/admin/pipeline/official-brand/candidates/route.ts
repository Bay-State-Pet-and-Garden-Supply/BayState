import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { loadOfficialBrandCandidates } from "@/lib/official-brand-review";
import {
  OFFICIAL_BRAND_SELECTION_STATUSES,
  type OfficialBrandSelectionStatus,
} from "@/lib/official-brand-review-types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface UpdateCandidateRequest {
  updates?: Array<{
    sku?: unknown;
    normalized_url?: unknown;
    selection_status?: unknown;
  }>;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isSelectionStatus(value: unknown): value is OfficialBrandSelectionStatus {
  return OFFICIAL_BRAND_SELECTION_STATUSES.includes(
    value as OfficialBrandSelectionStatus,
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const cohortId = toOptionalString(searchParams.get("cohort_id"));
  const rawStatus = toOptionalString(searchParams.get("status"));
  const discoveryJobId = toOptionalString(searchParams.get("discovery_job_id"));

  if (!cohortId) {
    return NextResponse.json({ error: "cohort_id is required" }, { status: 400 });
  }

  if (rawStatus && !isSelectionStatus(rawStatus)) {
    return NextResponse.json(
      { error: "Invalid selection status" },
      { status: 400 },
    );
  }

  const status = rawStatus as OfficialBrandSelectionStatus | null;

  try {
    const supabase = await createClient();
    const response = await loadOfficialBrandCandidates(supabase, {
      cohortId,
      ...(status ? { status } : {}),
      ...(discoveryJobId ? { discoveryJobId } : {}),
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load candidates";
    const status = message === "Cohort not found" ? 404 : 500;
    console.error("[Official Brand Candidates] GET failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  let body: UpdateCandidateRequest;
  try {
    body = (await request.json()) as UpdateCandidateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ error: "updates array is required" }, { status: 400 });
  }

  const updates = body.updates.map((update) => ({
    sku: toOptionalString(update.sku),
    normalizedUrl: toOptionalString(update.normalized_url),
    selectionStatus: update.selection_status,
  }));

  const invalidUpdate = updates.find(
    (update) =>
      !update.sku ||
      !update.normalizedUrl ||
      !isSelectionStatus(update.selectionStatus),
  );

  if (invalidUpdate) {
    return NextResponse.json(
      { error: "Each update requires sku, normalized_url, and a valid selection_status" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const reviewedBy = auth.user.email ?? auth.user.id;
  let updatedCount = 0;

  try {
    for (const update of updates) {
      const sku = update.sku as string;
      const normalizedUrl = update.normalizedUrl as string;
      const selectionStatus = update.selectionStatus as OfficialBrandSelectionStatus;

      if (selectionStatus === "selected") {
        const { error: clearError } = await supabase
          .from("official_brand_url_candidates")
          .update({
            selection_status: "candidate",
            updated_at: nowIso,
          })
          .eq("sku", sku)
          .eq("selection_status", "selected")
          .neq("normalized_url", normalizedUrl);

        if (clearError) {
          throw new Error(clearError.message);
        }
      }

      const { data, error } = await supabase
        .from("official_brand_url_candidates")
        .update({
          selection_status: selectionStatus,
          reviewed_at: nowIso,
          reviewed_by: reviewedBy,
          updated_at: nowIso,
        })
        .eq("sku", sku)
        .eq("normalized_url", normalizedUrl)
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      updatedCount += Array.isArray(data) ? data.length : 0;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update candidates";
    console.error("[Official Brand Candidates] PATCH failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated_count: updatedCount });
}
