import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const discoveryRequestSchema = z.object({
  skus: z.array(z.string().min(1)).min(1),
  product_name: z.string().optional(),
  brand: z.string().optional(),
  config: z
    .object({
      max_search_results: z.number().min(1).max(10).optional(),
      max_steps: z.number().min(1).max(50).optional(),
      confidence_threshold: z.number().min(0).max(1).optional(),
      llm_provider: z.literal('openai').optional(),
      llm_model: z.string().min(1).optional(),
      llm_base_url: z.string().min(1).optional(),
      prefer_manufacturer: z.boolean().optional(),
      fallback_to_static: z.boolean().optional(),
      max_concurrency: z.number().min(1).max(20).optional(),
    })
    .optional(),
  test_mode: z.boolean().optional(),
  max_workers: z.number().min(1).max(20).optional(),
  max_attempts: z.number().min(1).max(10).optional(),
  chunk_size: z.number().min(1).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = discoveryRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const nowIso = new Date().toISOString();
    const chunkSize = body.chunk_size ?? 50;
    const maxWorkers = body.max_workers ?? 3;
    const maxAttempts = body.max_attempts ?? 3;

    const { data: job, error: jobError } = await supabase
      .from('scrape_jobs')
      .insert({
        skus: body.skus,
        scrapers: ['ai_discovery'],
        test_mode: body.test_mode ?? false,
        max_workers: maxWorkers,
        status: 'pending',
        attempt_count: 0,
        max_attempts: maxAttempts,
        backoff_until: null,
        lease_token: null,
        leased_at: null,
        lease_expires_at: null,
        heartbeat_at: null,
        runner_name: null,
        started_at: null,
        type: 'discovery',
        config: {
          product_name: body.product_name,
          brand: body.brand,
          ...(body.config || {}),
        },
        metadata: {
          source: 'admin_discovery_api',
          created_by: user.id,
          chunk_size: chunkSize,
          max_concurrency: body.config?.max_concurrency ?? maxWorkers,
        },
        updated_at: nowIso,
      })
      .select('id')
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Failed to create discovery job' },
        { status: 500 }
      );
    }

    const chunks: Array<{
      job_id: string;
      chunk_index: number;
      skus: string[];
      scrapers: string[];
      status: string;
      updated_at: string;
    }> = [];

    for (let i = 0; i < body.skus.length; i += chunkSize) {
      chunks.push({
        job_id: job.id,
        chunk_index: chunks.length,
        skus: body.skus.slice(i, i + chunkSize),
        scrapers: ['ai_discovery'],
        status: 'pending',
        updated_at: nowIso,
      });
    }

    const { error: chunkError } = await supabase
      .from('scrape_job_chunks')
      .insert(chunks);

    if (chunkError) {
      return NextResponse.json(
        { error: 'Failed to create discovery job chunks' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        job_id: job.id,
        chunks: chunks.length,
        skus: body.skus.length,
        message: 'Discovery job created and queued',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
