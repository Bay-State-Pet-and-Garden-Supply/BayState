import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Config rollback via API is no longer supported.
 * Use Git history to rollback changes to YAML files.
 * 
 * @deprecated Use Git for version control and rollback
 */
export async function POST() {
  return NextResponse.json(
    { 
      error: 'Config rollback via API is deprecated. Use Git history to rollback YAML changes.',
      documentation: 'https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/scrapers/configs/README.md'
    },
    { status: 410 } // Gone
  );
}
