import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Scraper config management via API is no longer supported.
 * Configs are now managed as YAML files in the repository.
 * 
 * @deprecated Use YAML file-based configuration instead
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(
    { 
      error: 'Scraper config API is deprecated. Use /api/internal/scraper-configs/{slug}',
      id: id
    },
    { status: 410 } // Gone
  );
}

/**
 * DEPRECATED: Config updates via API are no longer supported.
 * Modify YAML files directly and commit to Git.
 * 
 * @deprecated Use YAML file-based configuration instead
 */
export async function PUT() {
  return NextResponse.json(
    { 
      error: 'Scraper config updates via API are deprecated. Modify YAML files directly.',
      documentation: 'https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/scrapers/configs/README.md'
    },
    { status: 410 } // Gone
  );
}

/**
 * DEPRECATED: Config deletion via API is no longer supported.
 * Remove YAML files directly and commit to Git.
 * 
 * @deprecated Use YAML file-based configuration instead
 */
export async function DELETE() {
  return NextResponse.json(
    { 
      error: 'Scraper config deletion via API is deprecated. Remove YAML files directly.',
      documentation: 'https://github.com/Bay-State-Pet-and-Garden-Supply/BayState/blob/master/apps/scraper/scrapers/configs/README.md'
    },
    { status: 410 } // Gone
  );
}
