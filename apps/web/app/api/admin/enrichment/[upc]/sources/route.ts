import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/enrichment/[upc]/sources
 *
 * Removed: Manual per-product source toggling is obsolete.
 * Source selection is now handled by the per-brand Source Cascade.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  const { upc } = await params;

  return NextResponse.json(
    {
      error: 'Manual source selection is no longer available. Use per-brand Source Cascade in Brand Settings to configure sources.',
      upc,
    },
    { status: 410 }
  );
}
