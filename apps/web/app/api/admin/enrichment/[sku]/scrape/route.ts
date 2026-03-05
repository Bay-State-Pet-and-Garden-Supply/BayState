import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/enrichment/[sku]/scrape
 * 
 * Trigger a targeted scrape for specific sources on a single product.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;

  if (!sku) {
    return NextResponse.json({ error: 'SKU is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify user is admin/staff
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { sources } = body;

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json(
        { error: 'sources (array of source IDs) is required' },
        { status: 400 }
      );
    }

    // Resolve scraper display names to slugs if possible
    const { data: configRows } = await supabase
      .from('scraper_configs')
      .select('slug, display_name');

    let resolvedSources = sources;
    if (configRows) {
      const slugMap = new Map<string, string>();
      configRows.forEach(row => {
        slugMap.set(row.slug.toLowerCase(), row.slug);
        if (row.display_name) {
          slugMap.set(row.display_name.toLowerCase(), row.slug);
        }
      });
      resolvedSources = sources.map((s: string) => slugMap.get(s.toLowerCase()) || s);
    }

    // Create a scrape job with the selected scrapers
    if (resolvedSources.length > 0) {
      const { data: job, error: jobError } = await supabase
        .from('scrape_jobs')
        .insert({
          skus: [sku],
          scrapers: resolvedSources,
          test_mode: false,
          max_workers: 1,
          status: 'pending',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (jobError) {
        console.error('[Enrichment API] Failed to create scrape job:', jobError);
        return NextResponse.json({ error: 'Failed to create scrape job' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        jobId: job.id,
        scrapers: sources,
        message: `Scrape job created for ${sources.length} scraper(s)`,
      });
    }

    return NextResponse.json({ success: true, message: 'No sources to refresh' });
  } catch (error) {
    console.error('[Enrichment API] Error triggering scrape:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
