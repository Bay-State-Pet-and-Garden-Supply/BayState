/**
 * Fallback Approval API
 *
 * Lists products awaiting fallback review and provides actions:
 * - approve_fallback:  Approves SERPER/AI extraction for SKUs that failed static quality
 * - mark_results_anyway: Override — mark SKUs as Results despite insufficient quality
 * - return_to_import:   Return SKUs to imported for re-scraping or removal
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
// TODO(Phase 8): remove after migration to enrichment_targets + enrichment_jobs
// import { approveFallbackForSkus } from '@/lib/pipeline/fallback-orchestration';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — List products in needs_fallback_review
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    try {
        const { data: products, error, count } = await supabase
            .from('products_ingestion')
            .select('*', { count: 'exact' })
            .eq('pipeline_status', 'needs_fallback_review')
            .is('exported_at', null)
            .order('updated_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('[Fallback API] Failed to list fallback review products:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Enrich each product with scrape_quality breakdown and static source snippet
        const enriched = (products || []).map((product) => {
            const raw = product as Record<string, unknown>;
            const quality = (raw.scrape_quality as Record<string, unknown>) || {};
            const sources = (raw.sources as Record<string, unknown>) || {};

            // Extract source snippets for review context (key-value pairs, not full payloads)
            const sourceSnippets: Record<string, Record<string, unknown>> = {};
            for (const [sourceKey, sourceVal] of Object.entries(sources)) {
                // Skip non-"_legacy" metadata keys but surface scalar fields for review
                if (typeof sourceVal === 'object' && sourceVal !== null && !Array.isArray(sourceVal)) {
                    const src = sourceVal as Record<string, unknown>;
                    sourceSnippets[sourceKey] = {
                        title: src.title || src.name || null,
                        brand: src.brand || null,
                        url: src.url || src.source_url || null,
                        confidence: src.confidence || null,
                    };
                } else if (typeof sourceVal === 'string' || typeof sourceVal === 'number') {
                    sourceSnippets[sourceKey] = { value: sourceVal };
                }
            }

            return {
                sku: raw.sku,
                input: raw.input || null,
                sources: sourceSnippets,
                cohort_id: raw.cohort_id || null,
                product_line: raw.product_line || null,
                scrape_quality: quality,
                fallback_metadata: raw.fallback_metadata || null,
                error_message: raw.error_message || null,
                updated_at: raw.updated_at,
                created_at: raw.created_at,
            };
        });

        return NextResponse.json({
            products: enriched,
            count: count || 0,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Fallback API] GET error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST — Approve, override, or reject fallback
// ---------------------------------------------------------------------------

interface FallbackRequest {
    action: 'approve_fallback' | 'mark_results_anyway' | 'return_to_import';
    skus: string[];
    approved_by?: string;
    budget_scope?: string;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    let body: FallbackRequest;
    try {
        body = (await request.json()) as FallbackRequest;
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { action, skus, budget_scope } = body;
    const approvedBy = body.approved_by || auth.user.email || auth.user.id || 'admin';

    if (!Array.isArray(skus) || skus.length === 0) {
        return NextResponse.json({ error: 'skus array is required' }, { status: 400 });
    }

    const normalizedSkus = [...new Set(skus.filter((s) => s && typeof s === 'string' && s.trim().length > 0))] as string[];
    if (normalizedSkus.length === 0) {
        return NextResponse.json({ error: 'No valid SKUs provided' }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const nowIso = new Date().toISOString();

    try {
        // Validate that SKUs are in needs_fallback_review (or skip validation for override actions)
        if (action === 'approve_fallback') {
            const { data: currentRows } = await supabase
                .from('products_ingestion')
                .select('sku, pipeline_status')
                .in('sku', normalizedSkus);

            const invalidSkus = (currentRows || [])
                .filter((row) => row.pipeline_status !== 'needs_fallback_review')
                .map((row) => row.sku);

            if (invalidSkus.length > 0) {
                return NextResponse.json({
                    error: `SKUs not in needs_fallback_review status: ${invalidSkus.join(', ')}. Use mark_results_anyway or return_to_import to override.`,
                }, { status: 400 });
            }
        }

        if (action === 'approve_fallback') {
            // Load quality reasons from current scrape_quality for metadata
            const { data: qualityData } = await supabase
                .from('products_ingestion')
                .select('sku, scrape_quality')
                .in('sku', normalizedSkus);

            const qualityReasons: string[] = [];
            const sourceJobIds: string[] = [];
            const qualityVerdictKeys: string[] = [];

            for (const row of (qualityData || [])) {
                const q = row.scrape_quality as Record<string, unknown> | null;
                if (q?.reason) qualityReasons.push(String(q.reason));
                if (q?.matchedSourceKeys) {
                    const keys = q.matchedSourceKeys as string[];
                    qualityVerdictKeys.push(...keys);
                }
            }

            // TODO(Phase 8): replace approveFallbackForSkus with direct enrichment_targets + enrichment_jobs creation
            // const fallbackResult = await approveFallbackForSkus(supabase, normalizedSkus, {
            //     ...
            // });
            //
            // For now just move SKUs to url_review for manual URL assignment:
            const { error: moveError } = await supabase
                .from('products_ingestion')
                .update({ pipeline_status: 'url_review', updated_at: nowIso })
                .in('sku', normalizedSkus);

            if (moveError) {
                return NextResponse.json({ error: moveError.message }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                action,
                approved_sku_count: normalizedSkus.length,
                message: `${normalizedSkus.length} SKU(s) moved to URL Review for manual URL assignment.`,
            });
        }

        if (action === 'mark_results_anyway') {
            // Override: move SKUs to scraped despite quality failure, recording the override
            const { data: currentRows } = await supabase
                .from('products_ingestion')
                .select('sku, fallback_metadata')
                .in('sku', normalizedSkus);

            for (const row of (currentRows || [])) {
                const existing = (row.fallback_metadata as Record<string, unknown>) || {};
                const { error: updateError } = await supabase
                    .from('products_ingestion')
                    .update({
                        pipeline_status: 'scraped',
                        fallback_metadata: {
                            ...existing,
                            override_approved_by: approvedBy,
                            override_approved_at: nowIso,
                            override_reason: 'mark_results_anyway',
                            updated_at: nowIso,
                        },
                        updated_at: nowIso,
                    })
                    .eq('sku', row.sku);

                if (updateError) {
                    console.error(`[Fallback API] Failed to override SKU ${row.sku}:`, updateError);
                }
            }

            return NextResponse.json({
                success: true,
                action,
                updated_sku_count: normalizedSkus.length,
                message: `${normalizedSkus.length} SKU(s) moved to Results (scraped) via admin override.`,
            });
        }

        if (action === 'return_to_import') {
            // Move SKUs back to imported, clearing sources for re-scraping
            const { error: updateError } = await supabase
                .from('products_ingestion')
                .update({
                    pipeline_status: 'imported',
                    updated_at: nowIso,
                })
                .in('sku', normalizedSkus);

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                action,
                updated_sku_count: normalizedSkus.length,
                message: `${normalizedSkus.length} SKU(s) returned to Imported.`,
            });
        }

        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[Fallback API] POST error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
