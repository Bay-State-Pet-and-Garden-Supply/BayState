import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(url, key);
}

export const dynamic = 'force-dynamic';

interface TestRequest {
  scraper_id: string;
  skus: string[];
  test_mode?: boolean;
}

/**
 * POST /api/admin/scraper-network/test
 * 
 * Creates a test scrape job in the database. Daemon runners will
 * poll for pending jobs and process them automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body: TestRequest = await request.json();

    const { scraper_id, skus, test_mode = true } = body;

    if (!scraper_id || !skus || skus.length === 0) {
      return NextResponse.json(
        { error: 'scraper_id and skus array are required' },
        { status: 400 }
      );
    }

    // Get scraper config to find the scraper name
    const { data: scraperConfig, error: configError } = await supabase
      .from('scraper_configs')
      .select('slug')
      .eq('id', scraper_id)
      .single();

    if (configError || !scraperConfig) {
      return NextResponse.json(
        { error: 'Scraper config not found' },
        { status: 404 }
      );
    }

    // Get scraper details using the slug
    const { data: scraper, error: scraperError } = await supabase
      .from('scrapers')
      .select('*')
      .eq('name', scraperConfig.slug)
      .single();

    if (scraperError || !scraper) {
      return NextResponse.json(
        { error: 'Scraper not found' },
        { status: 404 }
      );
    }

    // Create a scrape job - daemon runners will pick it up
    const { data: job, error: jobError } = await supabase
      .from('scrape_jobs')
      .insert({
        skus: skus,
        scrapers: [scraper.name],
        test_mode: test_mode,
        max_workers: 1,
        status: 'pending',
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[Test API] Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create test job' },
        { status: 500 }
      );
    }

    // Create test run record for tracking
    const testRun = {
      scraper_id,
      test_type: 'manual' as const,
      skus_tested: skus,
      results: [],
      status: 'pending' as const,
      started_at: new Date().toISOString(),
    };

    const { data: insertedRun, error: insertError } = await supabase
      .from('scraper_test_runs')
      .insert(testRun)
      .select()
      .single();

    if (insertError) {
      console.error('[Test API] Failed to create test run:', insertError);
      // Job was created, so continue even if test run tracking fails
    }

    console.log(`[Test API] Created test job ${job.id} for scraper ${scraper.name} with ${skus.length} SKUs`);

    return NextResponse.json({
      status: 'pending',
      message: 'Test job created. A daemon runner will pick it up and process it.',
      job_id: job.id,
      test_run_id: insertedRun?.id,
      scraper_name: scraper.name,
      skus_count: skus.length,
    });

  } catch (error) {
    console.error('[Test API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/scraper-network/test?id=xxx
 * 
 * Gets the status of a test run.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const testRunId = searchParams.get('id');
    const jobId = searchParams.get('job_id');

    // Support both test_run_id and job_id lookups
    if (jobId) {
      const { data: job, error } = await supabase
        .from('scrape_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !job) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        job_id: job.id,
        status: job.status,
        skus: job.skus,
        scrapers: job.scrapers,
        test_mode: job.test_mode,
        created_at: job.created_at,
        completed_at: job.completed_at,
        error_message: job.error_message,
      });
    }

    if (!testRunId) {
      return NextResponse.json(
        { error: 'Test run ID or job ID is required' },
        { status: 400 }
      );
    }

    const { data: testRun, error } = await supabase
      .from('scraper_test_runs')
      .select('*')
      .eq('id', testRunId)
      .single();

    if (error || !testRun) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(testRun);

  } catch (error) {
    console.error('[Test API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
