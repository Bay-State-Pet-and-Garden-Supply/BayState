import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import YAML from 'yaml';

// Validation schema for test request
const testRequestSchema = z.object({
  scraper_slug: z.string().min(1),
  skus: z.array(z.string()).optional(),
  options: z.object({
    timeout: z.number().optional(),
    priority: z.enum(['normal', 'high']).optional(),
  }).optional(),
});

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createSupabaseClient(url, key);
}

const SCRAPER_APP_DIR = path.join(process.cwd(), '..', 'scraper');

type ParsedScraperYaml = {
  test_skus?: unknown;
};

function getTestSkusFromYaml(parsedYaml: ParsedScraperYaml): string[] {
  if (!Array.isArray(parsedYaml.test_skus)) {
    return [];
  }

  return parsedYaml.test_skus.filter((sku): sku is string => typeof sku === 'string' && sku.length > 0);
}

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

    const { data: config, error: configError } = await adminClient
      .from('scraper_configs')
      .select('id, slug, name, file_path')
      .eq('slug', validatedData.scraper_slug)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Config not found' },
        { status: 404 }
      );
    }

    if (!config.file_path) {
      return NextResponse.json(
        { error: 'Scraper config file path is missing' },
        { status: 404 }
      );
    }

    // Get SKUs to test
    let skus: string[] = validatedData.skus || [];
    if (skus.length === 0) {
      const yamlPath = path.join(SCRAPER_APP_DIR, config.file_path);

      let parsedYaml: ParsedScraperYaml;

      try {
        const rawYaml = await readFile(yamlPath, 'utf8');
        const parsed = YAML.parse(rawYaml) as ParsedScraperYaml | null;
        parsedYaml = parsed ?? {};
      } catch (yamlError) {
        const isMissingFile =
          typeof yamlError === 'object' &&
          yamlError !== null &&
          'code' in yamlError &&
          yamlError.code === 'ENOENT';

        return NextResponse.json(
          { error: isMissingFile ? 'Scraper config YAML not found' : 'Failed to read scraper config YAML' },
          { status: isMissingFile ? 404 : 500 }
        );
      }

      skus = getTestSkusFromYaml(parsedYaml);

      if (skus.length === 0) {
        return NextResponse.json(
          { error: 'No SKUs specified and no default test SKUs found in config' },
          { status: 400 }
        );
      }
    }

    // Create a scrape job with test_mode=true — no separate test_run record needed
    const TEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const timeoutAt = new Date(Date.now() + TEST_TIMEOUT_MS).toISOString();

    const { data: job, error: jobError } = await adminClient
      .from('scrape_jobs')
      .insert({
        skus: skus,
        scrapers: [config.slug],
        test_mode: true,
        max_workers: 1,
        status: 'pending',
        timeout_at: timeoutAt,
        test_metadata: {
          file_path: config.file_path,
          triggered_by: user.id,
          test_type: 'studio',
          priority: validatedData.options?.priority || 'normal',
          scraper_slug: config.slug,
          scraper_display_name: config.name || config.slug,
        },
        metadata: {
          file_path: config.file_path,
          scraper_slug: config.slug,
          studio_test: true,
          priority: validatedData.options?.priority || 'normal',
        },
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[Studio Test API] Failed to create scrape job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create test job' },
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
      // Non-fatal: job was created, runner will still pick it up
    }

    console.log(`[Studio Test API] Created test job ${job.id} for config ${config.slug} (${skus.length} SKUs, timeout: ${timeoutAt})`);

    return NextResponse.json({
      test_run_id: job.id,
      job_id: job.id,
      status: 'pending',
      scraper_slug: validatedData.scraper_slug,
      skus_count: skus.length,
      timeout_at: timeoutAt,
      message: 'Test job created. A runner will pick it up and process it.',
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
