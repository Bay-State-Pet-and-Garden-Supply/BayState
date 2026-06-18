/**
 * Admin API: Packaging Evidence
 *
 * GET  /api/admin/packaging/:upc   — Get latest extraction + title suggestion for a UPC
 * POST /api/admin/packaging/:upc/rerun — Stale existing extraction, create new queued
 * POST /api/admin/packaging/:upc/apply-suggestion — Apply packaging title to consolidated draft
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface RouteContext {
    params: Promise<{ upc: string }>;
}

/**
 * GET /api/admin/packaging/:upc
 *
 * Returns the latest successful non-stale extraction + latest title suggestion for a UPC.
 * Also includes basic product info (draft title) for comparison.
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { upc } = await context.params;
    const supabase = await createAdminClient();

    // 1. Fetch latest non-stale, successful extraction
    const { data: extraction, error: extractError } = await supabase
        .from('product_packaging_extractions')
        .select('*')
        .eq('upc', upc)
        .eq('status', 'succeeded')
        .eq('is_stale', false)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (extractError) {
        console.error(`[AdminPackaging] Failed to fetch extraction for ${upc}:`, extractError);
        return NextResponse.json({ error: 'Failed to fetch packaging evidence' }, { status: 500 });
    }

    // 2. Fetch latest title suggestion for this extraction (if any)
    let titleSuggestion = null;
    if (extraction) {
        const { data: suggestion } = await supabase
            .from('product_title_suggestions')
            .select('*')
            .eq('packaging_extraction_id', extraction.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (suggestion) {
            titleSuggestion = suggestion;
        }
    }

    // 3. Fetch current product draft title for comparison
    const { data: product } = await supabase
        .from('products_ingestion')
        .select('consolidated, input')
        .eq('upc', upc)
        .maybeSingle();

    const draftTitle = product
        ? ((product.consolidated as Record<string, unknown> | null)?.core as Record<string, unknown> | null)?.name
            ?? (product.consolidated as Record<string, unknown> | null)?.name
            ?? (product.input as Record<string, unknown> | null)?.name
            ?? null
        : null;

    // 4. Check if there are any pending/queued extractions
    const { count: pendingCount } = await supabase
        .from('product_packaging_extractions')
        .select('*', { count: 'exact', head: true })
        .eq('upc', upc)
        .in('status', ['queued', 'claimed', 'running']);

    return NextResponse.json({
        upc,
        extraction: extraction ?? null,
        titleSuggestion,
        draftTitle: typeof draftTitle === 'string' ? draftTitle : null,
        hasPendingExtraction: (pendingCount ?? 0) > 0,
    });
}

/**
 * POST /api/admin/packaging/:upc/rerun
 *
 * Sets the existing latest extraction as stale and creates a new queued extraction
 * with trigger='manual_rerun'. Returns the new extraction ID.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { upc } = await context.params;
    const supabase = await createAdminClient();

    // Parse the action from the request body
    const body = await request.json().catch(() => ({}));
    const action = body.action as string | undefined;

    if (action === 'rerun') {
        // 1. Mark existing non-stale extractions as stale
        await supabase
            .from('product_packaging_extractions')
            .update({ is_stale: true, updated_at: new Date().toISOString() })
            .eq('upc', upc)
            .eq('is_stale', false);

        // 2. Find the best image URLs from the product
        const { data: product } = await supabase
            .from('products_ingestion')
            .select('selected_images, image_candidates, sources')
            .eq('upc', upc)
            .maybeSingle();

        const imageUrls: string[] = [];
        if (product) {
            // selected_images (highest priority)
            const selectedImgs = product.selected_images as unknown[] | null;
            if (Array.isArray(selectedImgs)) {
                for (const item of selectedImgs) {
                    if (imageUrls.length >= 2) break;
                    if (typeof item === 'string' && item.trim()) {
                        imageUrls.push(item.trim());
                    } else if (item && typeof item === 'object' && 'url' in item) {
                        const url = (item as { url: unknown }).url;
                        if (typeof url === 'string' && url.trim()) {
                            imageUrls.push(url.trim());
                        }
                    }
                }
            }

            // image_candidates (fallback)
            if (imageUrls.length < 2) {
                const candidates = product.image_candidates as string[] | null;
                if (Array.isArray(candidates)) {
                    for (const url of candidates) {
                        if (imageUrls.length >= 2) break;
                        if (typeof url === 'string' && url.trim() && !imageUrls.includes(url.trim())) {
                            imageUrls.push(url.trim());
                        }
                    }
                }
            }

            // sources.images (last resort)
            if (imageUrls.length < 2) {
                const sources = product.sources as Record<string, unknown> | null;
                if (sources) {
                    for (const [, sourceData] of Object.entries(sources)) {
                        if (imageUrls.length >= 2) break;
                        if (sourceData && typeof sourceData === 'object') {
                            const src = sourceData as Record<string, unknown>;
                            const images = src.images ?? src.image_urls ?? src.image ?? [];
                            if (Array.isArray(images)) {
                                for (const img of images) {
                                    if (imageUrls.length >= 2) break;
                                    const url = typeof img === 'string' ? img : (img && typeof img === 'object' && 'url' in img) ? (img as { url: unknown }).url : undefined;
                                    if (typeof url === 'string' && url.trim() && !imageUrls.includes(url.trim())) {
                                        imageUrls.push(url.trim());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Create new queued extraction
        const { data: newExtraction, error } = await supabase
            .from('product_packaging_extractions')
            .insert({
                upc,
                status: 'queued',
                trigger: 'manual_rerun',
                is_stale: false,
                attempt_count: 0,
                max_attempts: 2,
                provider: 'local_openai_compatible',
                model: null,
                prompt_version: 'packaging-title-v1',
                schema_version: 'packaging-extraction-v1',
                image_urls: imageUrls,
                image_fingerprints: [],
                image_metadata: [],
                raw_text: null,
                structured_facts: {},
                field_confidence: {},
                overall_confidence: null,
                conflicts: [],
                usage: {},
                debug_metadata: {},
            })
            .select('id')
            .single();

        if (error) {
            console.error(`[AdminPackaging] Failed to create rerun extraction for ${upc}:`, error);
            return NextResponse.json({ error: 'Failed to create extraction job' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            extractionId: newExtraction.id,
            status: 'queued',
            imageUrls,
        });
    }

    if (action === 'apply-suggestion') {
        const suggestionId = body.suggestion_id as string | undefined;
        if (!suggestionId) {
            return NextResponse.json({ error: 'Missing suggestion_id' }, { status: 400 });
        }

        // 1. Load the suggestion — verify it belongs to this UPC
        const { data: suggestion, error: suggestionError } = await supabase
            .from('product_title_suggestions')
            .select('*')
            .eq('id', suggestionId)
            .eq('upc', upc)
            .single();

        if (suggestionError || !suggestion) {
            return NextResponse.json({ error: 'Suggestion not found for this UPC' }, { status: 404 });
        }

        if (!suggestion.title) {
            return NextResponse.json({ error: 'Suggestion has no title' }, { status: 400 });
        }

        if (suggestion.status !== 'created' && suggestion.status !== 'shown') {
            return NextResponse.json(
                { error: `Suggestion is already ${suggestion.status} and cannot be applied` },
                { status: 409 },
            );
        }

        // 2. Load current product
        const { data: product } = await supabase
            .from('products_ingestion')
            .select('consolidated')
            .eq('upc', upc)
            .maybeSingle();

        const existingConsolidated = product?.consolidated
            ? (product.consolidated as Record<string, unknown>)
            : {};

        // 3. Update consolidated.core.name with the suggestion title
        const updatedConsolidated = {
            ...existingConsolidated,
            core: {
                ...((existingConsolidated.core as Record<string, unknown>) ?? {}),
                name: suggestion.title,
            },
        };

        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({
                consolidated: updatedConsolidated,
                updated_at: new Date().toISOString(),
            })
            .eq('upc', upc);

        if (updateError) {
            console.error(`[AdminPackaging] Failed to apply suggestion for ${upc}:`, updateError);
            return NextResponse.json({ error: 'Failed to apply title' }, { status: 500 });
        }

        // 4. Mark suggestion as applied
        await supabase
            .from('product_title_suggestions')
            .update({
                status: 'applied',
                applied_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', suggestionId);

        return NextResponse.json({
            success: true,
            title: suggestion.title,
            message: 'Packaging title applied successfully',
        });
    }

    return NextResponse.json({ error: 'Unknown action. Use "rerun" or "apply-suggestion".' }, { status: 400 });
}
