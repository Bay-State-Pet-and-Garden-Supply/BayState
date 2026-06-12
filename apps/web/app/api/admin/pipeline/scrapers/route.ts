import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/pipeline/scrapers
 *
 * Removed: Scraper list for the deprecated ScraperSelectDialog is obsolete.
 * The automated Source Cascade handles source selection without user input.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Scraper listing for manual selection is no longer available. Sources are managed through per-brand Source Cascades.',
    },
    { status: 410 }
  );
}
