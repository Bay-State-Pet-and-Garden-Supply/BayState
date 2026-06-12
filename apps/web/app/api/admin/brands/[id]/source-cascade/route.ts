/**
 * Source Cascade API for a single brand.
 *
 * GET  — Return the brand's current cascade entries + cascade metadata
 * PUT  — Accept reordered/toggled entries and persist them
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import {
  upsertBrandCascade,
  isCascadeConfigured,
  getCascadeReadiness,
} from "@/lib/approved-sources/source-cascade";

// =============================================================================
// GET
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createAdminClient();

  // Fetch brand cascade metadata
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, source_cascade_configured_at, source_cascade_configured_by")
    .eq("id", id)
    .single();

  if (brandError || !brand) {
    return NextResponse.json(
      { error: "Brand not found" },
      { status: 404 },
    );
  }

  // Fetch all distributor sources for this brand (including disabled ones)
  const { data: sources, error: sourcesError } = await supabase
    .from("brand_sources")
    .select(
      "id, source_slug, display_name, domains, requires_auth, crawl4ai_adapter_slug, search_mode, priority, enabled",
    )
    .eq("brand_id", id)
    .eq("source_type", "distributor")
    .order("priority", { ascending: true, nullsFirst: false });

  if (sourcesError) {
    return NextResponse.json(
      { error: sourcesError.message },
      { status: 500 },
    );
  }

  // Use isCascadeConfigured (timestamp + at least one enabled distributor)
  const configured = await isCascadeConfigured(supabase, id);

  return NextResponse.json({
    configured,
    configuredAt: brand.source_cascade_configured_at,
    configuredBy: brand.source_cascade_configured_by,
    entries: (sources ?? []).map((s: Record<string, unknown>) => ({
      sourceSlug: s.source_slug,
      displayName: s.display_name,
      domains: s.domains,
      requiresAuth: s.requires_auth,
      adapterSlug: s.crawl4ai_adapter_slug,
      searchMode: s.search_mode,
      priority: s.priority,
      enabled: s.enabled,
      id: s.id,
    })),
  });
}

// =============================================================================
// PUT
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  // Validate the request body
  let body: { entries?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.entries)) {
    return NextResponse.json(
      { error: "entries array is required" },
      { status: 400 },
    );
  }

  // Validate each entry
  const entries: { sourceSlug: string; enabled: boolean; priority: number }[] =
    [];
  for (let i = 0; i < body.entries.length; i++) {
    const e = body.entries[i];
    if (typeof e.sourceSlug !== "string" || e.sourceSlug.length === 0) {
      return NextResponse.json(
        { error: `entries[${i}].sourceSlug is required` },
        { status: 400 },
      );
    }
    if (typeof e.enabled !== "boolean") {
      return NextResponse.json(
        { error: `entries[${i}].enabled must be a boolean` },
        { status: 400 },
      );
    }
    if (typeof e.priority !== "number" || !Number.isInteger(e.priority)) {
      return NextResponse.json(
        { error: `entries[${i}].priority must be an integer` },
        { status: 400 },
      );
    }
    entries.push({
      sourceSlug: e.sourceSlug,
      enabled: e.enabled,
      priority: e.priority,
    });
  }

  const supabase = await createAdminClient();

  // Persist via the source-cascade helper
  await upsertBrandCascade(supabase, id, entries, auth.user.id);

  // Reload the saved state and return it
  const { data: brand } = await supabase
    .from("brands")
    .select("source_cascade_configured_at, source_cascade_configured_by")
    .eq("id", id)
    .single();

  const { data: sources } = await supabase
    .from("brand_sources")
    .select(
      "id, source_slug, display_name, domains, requires_auth, crawl4ai_adapter_slug, search_mode, priority, enabled",
    )
    .eq("brand_id", id)
    .eq("source_type", "distributor")
    .order("priority", { ascending: true });

  const configured = await isCascadeConfigured(supabase, id);

  return NextResponse.json({
    configured,
    configuredAt: brand?.source_cascade_configured_at ?? null,
    configuredBy: brand?.source_cascade_configured_by ?? null,
    entries: (sources ?? []).map((s: Record<string, unknown>) => ({
      sourceSlug: s.source_slug,
      displayName: s.display_name,
      domains: s.domains,
      requiresAuth: s.requires_auth,
      adapterSlug: s.crawl4ai_adapter_slug,
      searchMode: s.search_mode,
      priority: s.priority,
      enabled: s.enabled,
      id: s.id,
    })),
  });
}
