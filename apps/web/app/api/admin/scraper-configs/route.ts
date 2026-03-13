import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Scraper config creation via API is no longer supported.
 * Configs are now managed as YAML files in the repository.
 * 
 * To create a new scraper config:
 * 1. Create a YAML file in apps/scraper/scrapers/configs/
 * 2. Follow the schema defined in ScraperYamlConfig
 * 3. Commit and push to Git
 * 
 * @deprecated Use YAML file-based configuration instead
 */
export async function POST() {
  return NextResponse.json(
    { 
      error: 'Scraper config creation via API is deprecated. Use YAML file-based configuration.',
      documentation: 'https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/scrapers/configs/README.md'
    },
    { status: 410 } // Gone
  );
}

/**
 * GET /api/admin/scraper-configs
 * List all scraper configs - redirects to internal endpoint
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Use /api/internal/scraper-configs instead' },
    { status: 307, headers: { Location: '/api/internal/scraper-configs' } }
  );
}
