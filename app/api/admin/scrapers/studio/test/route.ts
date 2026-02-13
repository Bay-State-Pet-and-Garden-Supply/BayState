import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for test request
const testRequestSchema = z.object({
  config_id: z.string().uuid(),
  version_id: z.string().uuid().optional(),
  skus: z.array(z.string()).optional(),
  options: z.object({
    timeout: z.number().optional(),
    priority: z.enum(['normal', 'high']).optional(),
  }).optional(),
});

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createSupabaseClient(url, key);
}

/**
 * POST /api/admin/scrapers/studio/test
 * 
 * Creates a test run for a scraper configuration.
 * Integrates with the existing runner API (scraper-network/test).
 * 
 * Request Body:
 * {
 *   config_id: string;       // Required: UUID of scraper config
 *   version_id?: string;     // Optional: specific version (defaults to current)
 *   skus?: string[];         // Optional: override SKUs to test
 *   options?: {
 *     timeout?: number;      // Optional: timeout in seconds
 *     priority?: 'normal' | 'high';  // Optional: priority level
 *   }
 * }
 * 
 * Response:
 * {
 *   test_run_id: string;
 *   status: 'pending';
 *   job_id: string;
 *   message: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = testRequestSchema.parse(body);

    const adminClient = getSupabaseAdmin();

    // Fetch the config to get the slug for the runner API
    const { data: config, error: configError } = await adminClient
      .from('scraper_configs')
      .select('*, scraper_config_versions!fk_config_id(*)')
      .eq('id', validatedData.config_id)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Config not found' },
        { status: 404 }
      );
    }

    // Determine which version to use
    const versionId = validatedData.version_id || config.current_version_id;
    const version = config.scraper_config_versions?.find(
      (v: { id: string }) => v.id === versionId
    );

    if (!version) {
      return NextResponse.json(
        { error: 'Configuration version not found' },
        { status: 404 }
      );
    }

    // Get SKUs to test
    let skus: string[] = validatedData.skus || [];
    if (skus.length === 0) {
      // Extract from config YAML (test_skus stored in scraper_config_versions.config)
      const configData = version.config;
      if (configData?.test_skus && Array.isArray(configData.test_skus)) {
        skus = configData.test_skus;
      } else {
        return NextResponse.json(
          { error: 'No SKUs specified and no default test SKUs found in config' },
          { status: 400 }
        );
      }
    }

    // Create test run record for tracking
    const testRunData = {
      scraper_id: config.id, // Note: This references scraper_configs.id via mapping
      test_type: 'studio' as const,
      skus_tested: skus,
      results: [],
      status: 'pending' as const,
      started_at: new Date().toISOString(),
      metadata: {
        config_id: validatedData.config_id,
        version_id: versionId,
        triggered_by: user.id,
        priority: validatedData.options?.priority || 'normal',
      },
    };

    const { data: testRun, error: testRunError } = await adminClient
      .from('scraper_test_runs')
      .insert(testRunData)
      .select()
      .single();

    if (testRunError) {
      console.error('[Studio Test API] Failed to create test run:', testRunError);
      return NextResponse.json(
        { error: 'Failed to create test run' },
        { status: 500 }
      );
    }

    // Create a scrape job using the existing runner infrastructure
    // We call the scraper-network/test endpoint internally
    const { data: job, error: jobError } = await adminClient
      .from('scrape_jobs')
      .insert({
        skus: skus,
        scrapers: [config.slug],
        test_mode: true,
        max_workers: 1,
        status: 'pending',
        metadata: {
          test_run_id: testRun.id,
          config_id: validatedData.config_id,
          version_id: versionId,
          studio_test: true,
          priority: validatedData.options?.priority || 'normal',
        },
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[Studio Test API] Failed to create scrape job:', jobError);
      // Update test run to failed status
      await adminClient
        .from('scraper_test_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', testRun.id);

      return NextResponse.json(
        { error: 'Failed to create scrape job' },
        { status: 500 }
      );
    }

    // Create chunks for the job
    const chunks = [{
      job_id: job.id,
      chunk_index: 0,
      skus: skus,
      scrapers: [config.slug],
      status: 'pending',
    }];

    const { error: chunkError } = await adminClient
      .from('scrape_job_chunks')
      .insert(chunks);

    if (chunkError) {
      console.error('[Studio Test API] Failed to create chunks:', chunkError);
      // Non-fatal: job was created, chunks can be created separately
    }

    // Update test run with job reference
    await adminClient
      .from('scraper_test_runs')
      .update({
        metadata: {
          ...testRunData.metadata,
          job_id: job.id,
        },
      })
      .eq('id', testRun.id);

    console.log(`[Studio Test API] Created test run ${testRun.id} with job ${job.id} for config ${config.slug}`);

    return NextResponse.json({
      test_run_id: testRun.id,
      status: 'pending',
      job_id: job.id,
      config_id: validatedData.config_id,
      version_id: versionId,
      skus_count: skus.length,
      message: 'Test run created. A runner will pick it up and process it.',
    }, { status: 201 });

  } catch (error) {
    console.error('[Studio Test API] Error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
