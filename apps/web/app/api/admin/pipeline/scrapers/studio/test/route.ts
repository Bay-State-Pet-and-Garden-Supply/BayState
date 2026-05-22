import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import YAML from 'yaml';

// Validation schema for test request
const testRequestSchema = z.object({
  scraper_slug: z.string().min(1),
  upcs: z.array(z.string()).optional(),
  options: z.object({
    timeout: z.number().optional(),
    priority: z.enum(['normal', 'high']).optional(),
  }).optional(),
});

const SCRAPER_APP_DIR = path.join(process.cwd(), '..', 'scraper');

type ParsedScraperYaml = {
  test_upcs?: unknown;
};

function getTestUpcsFromYaml(parsedYaml: ParsedScraperYaml): string[] {
  if (!Array.isArray(parsedYaml.test_upcs)) {
    return [];
  }

  return parsedYaml.test_upcs.filter((upc): upc is string => typeof upc === 'string' && upc.length > 0);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {

    // Parse and validate request body
    const body = await request.json();
    const validatedData = testRequestSchema.parse(body);

    const adminClient = await createAdminClient();

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

    // Get UPCs to test
    let upcs: string[] = validatedData.upcs || [];
    if (upcs.length === 0) {
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

      upcs = getTestUpcsFromYaml(parsedYaml);

      if (upcs.length === 0) {
        return NextResponse.json(
          { error: 'No UPCs specified and no default test UPCs found in config' },
          { status: 400 }
        );
      }
    }

    // Create an enrichment job with test_mode=true
    const TEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const leaseExpiresAt = new Date(Date.now() + TEST_TIMEOUT_MS).toISOString();

    const { data: job, error: jobError } = await adminClient
      .from('enrichment_jobs')
      .insert({
        upcs: upcs,
        test_mode: true,
        total_count: upcs.length,
        status: 'queued',
        test_metadata: {
          file_path: config.file_path,
          triggered_by: auth.user.id,
          test_type: 'studio',
          priority: validatedData.options?.priority || 'normal',
          scraper_slug: config.slug,
          scraper_display_name: config.name || config.slug,
        },
        config: {
          file_path: config.file_path,
          scraper_slug: config.slug,
          studio_test: true,
          priority: validatedData.options?.priority || 'normal',
          // Enrichment runner expects target_url or source_plan. 
          // For Studio test, we might need to provide a way to resolve URLs.
          // For now, we'll assume the runner can handle it or we'll add more context.
        },
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[Studio Test API] Failed to create enrichment job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create test job' },
        { status: 500 }
      );
    }

    // Create attempts for each UPC
    const attempts = upcs.map((upc, index) => ({
      job_id: job.id,
      upc: upc,
      attempt_number: 1,
      status: 'queued',
      mode: 'llm', // Default to LLM for studio tests
    }));

    const { error: attemptError } = await adminClient
      .from('enrichment_attempts')
      .insert(attempts);

    if (attemptError) {
      console.error('[Studio Test API] Failed to create enrichment attempts:', attemptError);
    }

    console.log(`[Studio Test API] Created enrichment test job ${job.id} for config ${config.slug} (${upcs.length} UPCs)`);

    return NextResponse.json({
      test_run_id: job.id,
      job_id: job.id,
      status: 'queued',
      scraper_slug: validatedData.scraper_slug,
      upcs_count: upcs.length,
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
