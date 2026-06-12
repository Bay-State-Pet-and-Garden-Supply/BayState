import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/enrichment/defaults
 * POST /api/admin/enrichment/defaults
 *
 * Removed: Enrichment defaults for manual source selection are obsolete.
 * Source selection is now handled by the per-brand Source Cascade.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Enrichment defaults are no longer available. Configure per-brand Source Cascades in Brand Settings.',
    },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Enrichment defaults are no longer available. Configure per-brand Source Cascades in Brand Settings.',
    },
    { status: 410 }
  );
}
