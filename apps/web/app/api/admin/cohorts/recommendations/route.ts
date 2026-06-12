import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/cohorts/recommendations
 *
 * Removed: Scraper recommendations for the deprecated ScraperSelectDialog are obsolete.
 * The automated Source Cascade handles source selection without user input.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Scraper recommendations are no longer available. Source selection is automated via per-brand Source Cascades.',
    },
    { status: 410 }
  );
}
