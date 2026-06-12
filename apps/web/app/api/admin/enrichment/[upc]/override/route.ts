import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/enrichment/[upc]/override
 *
 * Removed: Field-level source overrides are obsolete.
 * Consolidation now handles conflict resolution automatically.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  const { upc } = await params;

  return NextResponse.json(
    {
      error: 'Field-level source overrides are no longer available. Consolidation handles conflict resolution automatically.',
      upc,
    },
    { status: 410 }
  );
}
