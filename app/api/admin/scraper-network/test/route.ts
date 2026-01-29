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
  scraper_id?: string;
  slug?: string;
  skus: string[];
  test_mode?: boolean;
}

/**
 * POST /api/admin/scraper-network/test
 * 
 * Creates a test scrape job in the database. Daemon runners will
 * poll for pending jobs and process them automatically.
 * 
 * Accepts either scraper_id (UUID) or slug (e.g., "amazon")
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body: TestRequest = await request.json();

    const { scraper_id, slug, skus, test_mode = true } = body;

    if (!skus || skus.length === 0) {
      return NextResponse.json(
        { error: 'skus array is required' },
        { status: 400 }
      );
    }

    let scraperConfig;
    
    // Try to find scraper config by ID or slug
    if (scraper_id) {
      const { data, error } = await supabase
        .from('scraper_configs')
        .select('slug')
        .eq('id', scraper_id)
        .single();
      
      if (!error && data) {
        scraperConfig = data;
      }
    } else if (slug) {
      const { data, error } = await supabase
        .from('scraper_configs')
        .select('slug')
        .eq('slug', slug)
        .single();
      
      if (!error && data) {
        scraperConfig = data;
      }
    }

    if (!scraperConfig) {
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

    // Create test run record for tracking (get ID first)
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
      // Continue even if test run tracking fails
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
        metadata: {
          test_run_id: insertedRun?.id || null,
          scraper_id: scraper_id,
        },
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

/**
 * GET /api/admin/scraper-network/test/:id/selectors
 *
 * Gets selector validation results for a test run.
 */
export async function GETSelectors(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const testRunId = params.id;

    const { data, error } = await supabase
      .from('scraper_selector_results')
      .select('*')
      .eq('test_run_id', testRunId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Selectors API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch selector results' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      test_run_id: testRunId,
      count: data?.length || 0,
      results: data || [],
    });
  } catch (error) {
    console.error('[Selectors API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/scraper-network/test/:id/login
 *
 * Gets login status results for a test run.
 */
export async function GETLogin(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const testRunId = params.id;

    const { data, error } = await supabase
      .from('scraper_login_results')
      .select('*')
      .eq('test_run_id', testRunId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Login API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch login results' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      test_run_id: testRunId,
      count: data?.length || 0,
      results: data || [],
    });
  } catch (error) {
    console.error('[Login API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/scraper-network/test/:id/extraction
 *
 * Gets extraction field results for a test run.
 */
export async function GETExtraction(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin();
    const testRunId = params.id;

    const { data, error } = await supabase
      .from('scraper_extraction_results')
      .select('*')
      .eq('test_run_id', testRunId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Extraction API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch extraction results' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      test_run_id: testRunId,
      count: data?.length || 0,
      results: data || [],
    });
  } catch (error) {
    console.error('[Extraction API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
