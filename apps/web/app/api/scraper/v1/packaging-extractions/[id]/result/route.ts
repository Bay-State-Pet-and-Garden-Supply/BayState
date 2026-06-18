/**
 * POST /api/scraper/v1/packaging-extractions/[id]/result
 *
 * Runner callback endpoint for packaging extraction results.
 *
 * The scraper runner posts the VLM/OCR extraction result here after
 * completing a packaging extraction job.
 *
 * Flow:
 * 1. Validate runner auth
 * 2. Load extraction row, verify lease token ownership
 * 3. Validate status transition
 * 4. Store raw text, structured facts, confidence, image metadata
 * 5. Create/update product_title_suggestions if status is succeeded
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import {
  composePackagingTitle,
  type PackagingFacts,
  type FieldConfidence,
  type PackagingContext,
} from '@/lib/packaging/title-composer';
import crypto from 'crypto';

interface ResultBody {
  status: 'succeeded' | 'failed' | 'timed_out' | 'skipped_no_images';
  raw_text?: string;
  structured_facts?: Record<string, unknown>;
  field_confidence?: Record<string, number>;
  overall_confidence?: number;
  image_metadata?: Array<Record<string, unknown>>;
  image_fingerprints?: string[];
  notes?: string[];
  error_message?: string;
  error_code?: string;
  lease_token?: string;
  provider?: string;
  model?: string;
  usage?: Record<string, unknown>;
  debug_metadata?: Record<string, unknown>;
  conflicts?: Array<Record<string, unknown>>;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

type TerminalStatus = 'succeeded' | 'failed' | 'timed_out' | 'skipped_no_images';
const VALID_TERMINAL_STATUSES: TerminalStatus[] = ['succeeded', 'failed', 'timed_out', 'skipped_no_images'];  

export async function POST(request: NextRequest, context: RouteContext) {
  // 1. Validate runner authentication
  const apiKey = request.headers.get('X-API-Key');
  const authorization = request.headers.get('Authorization');

  const runner = await validateRunnerAuth({ apiKey, authorization });
  if (!runner) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  try {
    const { id: extractionId } = await context.params;
    const supabase = await createAdminClient();
    const runnerName = runner.runnerName;
    const now = new Date();
    const nowIso = now.toISOString();

    // 2. Parse and validate request body
    const body: ResultBody = await request.json();

    if (!body.status || !(VALID_TERMINAL_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status '${body.status}'. Must be one of: ${VALID_TERMINAL_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    // 3. Load extraction row
    const { data: extraction, error: loadError } = await supabase
      .from('product_packaging_extractions')
      .select('*')
      .eq('id', extractionId)
      .single();

    if (loadError || !extraction) {
      console.error('[PackagingResult] Extraction not found:', extractionId);
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    // 4. Prevent double-processing
    if (VALID_TERMINAL_STATUSES.includes(extraction.status as TerminalStatus)) {
      console.warn(
        `[PackagingResult] Extraction ${extractionId} already terminal (status=${extraction.status}), skipping`,
      );
      return NextResponse.json({ success: true, status: 'already_completed' });
    }

    // 5. Verify lease ownership
    if (extraction.lease_token) {
      if (!body.lease_token) {
        return NextResponse.json(
          { error: 'Lease token required — extraction was claimed with a lease' },
          { status: 409 },
        );
      }
      if (extraction.lease_token !== body.lease_token) {
        console.warn(
          `[PackagingResult] Lease mismatch for ${extractionId}: got ${body.lease_token}, expected ${extraction.lease_token}`,
        );
        return NextResponse.json(
          { error: 'Lease token mismatch — stale or replayed callback' },
          { status: 409 },
        );
      }
    }

    // 6. Verify runner ownership
    if (extraction.claimed_by && extraction.claimed_by !== runnerName) {
      return NextResponse.json(
        { error: `Extraction claimed by ${extraction.claimed_by}, not ${runnerName}` },
        { status: 409 },
      );
    }

    // 7. Validate structured_facts if status is succeeded
    if (body.status === 'succeeded') {
      if (!body.structured_facts || Object.keys(body.structured_facts).length === 0) {
        return NextResponse.json(
          { error: 'structured_facts is required when status is succeeded' },
          { status: 400 },
        );
      }
      if (typeof body.overall_confidence !== 'number' || body.overall_confidence < 0 || body.overall_confidence > 1) {
        return NextResponse.json(
          { error: 'overall_confidence must be a number between 0 and 1 when status is succeeded' },
          { status: 400 },
        );
      }
    }

    // 8. Build update payload
    const updatePayload: Record<string, unknown> = {
      status: body.status,
      completed_at: nowIso,
      updated_at: nowIso,
    };

    if (body.raw_text !== undefined) updatePayload.raw_text = body.raw_text;
    if (body.structured_facts !== undefined) updatePayload.structured_facts = body.structured_facts;
    if (body.field_confidence !== undefined) updatePayload.field_confidence = body.field_confidence;
    if (body.overall_confidence !== undefined) updatePayload.overall_confidence = body.overall_confidence;
    if (body.image_metadata !== undefined) updatePayload.image_metadata = body.image_metadata;
    if (body.image_fingerprints !== undefined) updatePayload.image_fingerprints = body.image_fingerprints;
    if (body.notes !== undefined) updatePayload.debug_metadata = { ...(extraction.debug_metadata || {}), notes: body.notes };
    if (body.error_message !== undefined) updatePayload.error_message = body.error_message;
    if (body.error_code !== undefined) updatePayload.error_code = body.error_code;
    if (body.provider !== undefined) updatePayload.provider = body.provider;
    if (body.model !== undefined) updatePayload.model = body.model;
    if (body.usage !== undefined) updatePayload.usage = body.usage;
    if (body.conflicts !== undefined) updatePayload.conflicts = body.conflicts;

    // 9. Update the extraction row
    const { error: updateError } = await supabase
      .from('product_packaging_extractions')
      .update(updatePayload)
      .eq('id', extractionId);

    if (updateError) {
      console.error('[PackagingResult] Failed to update extraction:', updateError);
      return NextResponse.json({ error: 'Failed to save extraction result' }, { status: 500 });
    }

    // 10. Determine the effective packaging_title_mode
    let effectiveMode = 'shadow';
    if (body.status === 'succeeded') {
      // Try to get the mode from the associated workflow_run
      if (extraction.workflow_run_id) {
        const { data: workflow } = await supabase
          .from('pipeline_workflow_runs')
          .select('packaging_title_mode')
          .eq('id', extraction.workflow_run_id)
          .maybeSingle();
        if (workflow && workflow.packaging_title_mode) {
          effectiveMode = workflow.packaging_title_mode as string;
        }
      }
      // Fallback: load from settings
      if (effectiveMode === 'shadow') {
        try {
          const { getPackagingTitleMode } = await import('@/lib/packaging-settings');
          effectiveMode = await getPackagingTitleMode().catch(() => 'shadow' as const);
        } catch {
          // keep shadow default
        }
      }
    }

    // 11. Create a product_title_suggestions row if succeeded
    if (body.status === 'succeeded') {
      const titleSuggestionId = crypto.randomUUID();

      // Load product context for deterministic title composition
      let productContext: PackagingContext | undefined;
      try {
        const { data: product } = await supabase
          .from('products_ingestion')
          .select('consolidated, input')
          .eq('upc', extraction.upc)
          .maybeSingle();

        if (product) {
          const consolidated = product.consolidated as Record<string, unknown> | undefined;
          const core = consolidated?.core as Record<string, unknown> | undefined;
          const input = product.input as Record<string, unknown> | undefined;
          productContext = {
            consolidationDraftCore: {
              name: (core?.name as string) || (consolidated?.name as string) || (input?.name as string) || undefined,
              brand_name: (core?.brand_name as string) || undefined,
              weight_lbs: (core?.weight_lbs as number) || undefined,
              canonical_category_breadcrumb: (core?.canonical_category_breadcrumb as string) || undefined,
            },
            consolidationCategory: (core?.canonical_category_breadcrumb as string) || undefined,
          };
        }
      } catch {
        // Non-fatal — composer can still produce a suggestion without context
      }

      // Use deterministic composer to produce a BayState-normalized title
      const facts = (body.structured_facts ?? {}) as PackagingFacts;
      const fieldConf = (body.field_confidence ?? {}) as FieldConfidence;
      const composerResult = composePackagingTitle(facts, fieldConf, productContext);

      const { error: suggestionError } = await supabase
        .from('product_title_suggestions')
        .insert({
          id: titleSuggestionId,
          upc: extraction.upc,
          workflow_run_id: extraction.workflow_run_id,
          packaging_extraction_id: extractionId,
          suggestion_type: 'packaging_vision',
          title: composerResult.title || body.raw_text || '',
          confidence_score: composerResult.overall_confidence,
          field_confidence: composerResult.field_confidence,
          composer_version: 'packaging-title-v1',
          mode: effectiveMode,
          reasons: composerResult.reasons,
          conflicts: composerResult.conflicts,
          status: 'created',
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (suggestionError) {
        console.warn('[PackagingResult] Failed to create title suggestion:', suggestionError.message);
        // Non-fatal — the extraction result was saved
      }
    }

    // 11. Update runner status back to idle for this job
    await supabase
      .from('scraper_runners')
      .update({
        current_job_id: null,
        last_seen_at: nowIso,
      })
      .eq('name', runnerName);

    return NextResponse.json({
      success: true,
      extraction_id: extractionId,
      status: body.status,
      upc: extraction.upc,
    });
  } catch (err) {
    console.error('[PackagingResult] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

