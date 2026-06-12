import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/enrichment/[upc]/scrape
 *
 * Removed: Targeted per-product scraper runs are obsolete.
 * Re-extraction goes through the enrichment jobs API with retryMode.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  const { upc } = await params;

  return NextResponse.json(
    {
      error: 'Per-product scrape is no longer available. Re-extraction uses the enrichment jobs API with retryMode="failed_or_untried".',
      upc,
    },
    { status: 410 }
  );
}
