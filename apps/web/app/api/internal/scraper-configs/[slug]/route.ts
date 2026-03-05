import { validateRunnerAuth } from '@/lib/scraper-auth';
import { assembleScraperConfigBySlug } from '@/lib/admin/scraper-configs/assemble-config';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const runner = await validateRunnerAuth({
      apiKey: request.headers.get('X-API-Key'),
      authorization: request.headers.get('Authorization'),
    });

    if (!runner) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    // Use the normalized assembly utility
    const config = await assembleScraperConfigBySlug(slug);

    if (!config) {
      return NextResponse.json(
        { error: 'Scraper config not found or has no published version' },
        { status: 404 }
      );
    }

    // Return the assembled config with debug header
    return NextResponse.json(config, {
      headers: {
        'X-Config-Source': 'normalized',
      },
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
