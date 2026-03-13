import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Config publishing via API is no longer supported.
 * YAML configs are automatically "published" when committed to Git.
 * 
 * @deprecated Use YAML file-based configuration instead
 */
export async function POST() {
  return NextResponse.json(
    { 
      error: 'Config publishing via API is deprecated. YAML configs are automatically published via Git.',
      documentation: 'https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/scrapers/configs/README.md'
    },
    { status: 410 } // Gone
  );
}
