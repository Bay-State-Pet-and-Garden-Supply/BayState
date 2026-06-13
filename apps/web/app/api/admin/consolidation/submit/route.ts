import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { getBatchStatus, processBatchQueue, submitBatch, submitGroupConsolidationBatch } from '@/lib/consolidation/batch-service';
import { isOpenAIConfigured } from '@/lib/consolidation/openai-client';
import { applyResults } from '@/lib/consolidation/apply-service';
import type { ProductSource } from '@/lib/consolidation';
import { buildConsolidationSourcesPayload } from '@/lib/product-sources';

/**
 * POST /api/admin/consolidation/submit
 *
 * Two submission modes:
 *   1. Group-based (new): `{ groups: [{ product_line_id, upcs }] }`
 *      One LLM call per Product Group, all UPCs in a group consolidated together.
 *   2. Per-UPC fallback (legacy): `{ upcs: [...] }`
 *      Individual consolidation for singletons or ungrouped products.
 *
 * Provider behavior:
 * - DeepSeek: Creates batch and immediately processes items (direct chat)
 * - Gemini: Creates batch job only; returns immediately with queued/preparing status.
 *   Image prep and provider submission happen asynchronously via /sync.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json(
            { error: 'No configured LLM batch provider is available for consolidation.' },
            { status: 503 }
        );
    }

    try {
        const body = await request.json();
        const { upcs, groups, description, auto_apply } = body;

        // =========================================================================
        // NEW: Group-based consolidation path
        // =========================================================================
        if (groups && Array.isArray(groups) && groups.length > 0) {
            const validatedGroups = groups.filter(
                (g: any) => g.product_line_id && g.upcs && Array.isArray(g.upcs) && g.upcs.length > 0
            );

            if (validatedGroups.length === 0) {
                return NextResponse.json({ error: 'No valid groups provided. Each group must have product_line_id and upcs[]' }, { status: 400 });
            }

            const supabase = await createAdminClient();

            // Fetch product_line names for display
            const lineIds = validatedGroups.map((g: any) => g.product_line_id);
            const { data: productLines } = await supabase
                .from('product_lines')
                .select('id, canonical_name')
                .in('id', lineIds);

            const lineNameMap = new Map<string, string>();
            for (const pl of (productLines || [])) {
                lineNameMap.set(pl.id, pl.canonical_name);
            }

            const groupsWithNames = validatedGroups.map((g: any) => ({
                product_line_id: g.product_line_id,
                product_line_name: lineNameMap.get(g.product_line_id) || 'Unknown Product Line',
                upcs: g.upcs,
            }));

            const result = await submitGroupConsolidationBatch(groupsWithNames, {
                description: description || `Group consolidation for ${validatedGroups.length} groups`,
                auto_apply: auto_apply || false,
            });

            if (!result.success) {
                return NextResponse.json({ error: result.error }, { status: 500 });
            }

            // Process group items (one per group)
            let processedItemCount = 0;
            const chunkSize = 3;
            const maxIterations = Math.ceil(validatedGroups.length / chunkSize) + 2;

            for (let iteration = 0; iteration < maxIterations; iteration += 1) {
                const processResult = await processBatchQueue(result.batch_id, { limit: chunkSize });
                if ('success' in processResult && !processResult.success) {
                    return NextResponse.json({ error: processResult.error }, { status: 500 });
                }
                if ('processed' in processResult) {
                    processedItemCount += processResult.processed;
                    if (processResult.processed === 0 || processResult.status.is_complete || processResult.status.is_failed) {
                        break;
                    }
                }
            }

            const totalProducts = validatedGroups.reduce((sum: number, g: any) => sum + g.upcs.length, 0);
            const status = await getBatchStatus(result.batch_id);

            return NextResponse.json({
                success: true,
                batch_id: result.batch_id,
                provider: result.provider,
                provider_batch_id: result.provider_batch_id,
                group_count: validatedGroups.length,
                product_count: totalProducts,
                processed_item_count: processedItemCount,
                status: 'success' in status ? null : status,
            });
        }

        // =========================================================================
        // LEGACY: Per-UPC (singleton fallback) path — kept for backward compatibility
        // =========================================================================
        if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
            return NextResponse.json(
                { error: 'Provide upcs[] for individual consolidation or groups[] for group-based consolidation' },
                { status: 400 }
            );
        }

        const supabase = await createAdminClient();
        const { data: products, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('upc, input, sources, selected_images, image_candidates')
            .in('upc', upcs);

        if (fetchError) {
            console.error('[Consolidation API] Failed to fetch products:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        if (!products || products.length === 0) {
            return NextResponse.json({ error: 'No products found for provided UPCs' }, { status: 404 });
        }

        // Derive image URLs with priority: selected_images -> image_candidates -> sources
        function deriveImageUrls(p: { selected_images?: unknown; image_candidates?: unknown; sources: unknown; upc: string }): string[] {
            const urls: string[] = [];
            const maxImages = 2;

            // 1. selected_images (highest priority — user-curated / processed images)
            const selectedImgs = p.selected_images;
            if (Array.isArray(selectedImgs)) {
                for (const item of selectedImgs) {
                    if (urls.length >= maxImages) break;
                    if (typeof item === 'string' && item.trim()) {
                        urls.push(item.trim());
                    } else if (item && typeof item === 'object' && 'url' in item && typeof (item as {url: unknown}).url === 'string') {
                        urls.push((item as {url: string}).url.trim());
                    }
                }
            }

            // 2. image_candidates (fallback)
            if (urls.length < maxImages) {
                const candidates = p.image_candidates;
                if (Array.isArray(candidates)) {
                    for (const item of candidates) {
                        if (urls.length >= maxImages) break;
                        if (typeof item === 'string' && item.trim() && !urls.includes(item.trim())) {
                            urls.push(item.trim());
                        }
                    }
                }
            }

            // 3. Source images (last resort)
            if (urls.length < maxImages) {
                const sources = p.sources;
                if (sources && typeof sources === 'object') {
                    const seen = new Set(urls);
                    for (const [, srcData] of Object.entries(sources as Record<string, unknown>)) {
                        if (urls.length >= maxImages) break;
                        if (srcData && typeof srcData === 'object') {
                            const src = srcData as Record<string, unknown>;
                            const images = (src.images ?? src.image_urls ?? src.image_url ?? src.image) as unknown[] | undefined;
                            if (Array.isArray(images)) {
                                for (const img of images) {
                                    if (urls.length >= maxImages) break;
                                    const url = typeof img === 'string' ? img : (img && typeof img === 'object' && 'url' in img) ? (img as {url: unknown}).url as string : undefined;
                                    if (typeof url === 'string' && url.trim() && !seen.has(url.trim())) {
                                        seen.add(url.trim());
                                        urls.push(url.trim());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return urls.slice(0, maxImages);
        }

        const productsWithSources: ProductSource[] = products
            .filter((p) => p.sources && Object.keys(p.sources).length > 0)
            .map((p) => ({
                upc: p.upc,
                sources: buildConsolidationSourcesPayload(p.sources, p.input),
                imageUrls: deriveImageUrls(p as { selected_images?: unknown; image_candidates?: unknown; sources: unknown; upc: string }),
            }));

        if (productsWithSources.length === 0) {
            return NextResponse.json(
                {
                    error: 'None of the selected products have source data. Run enrichment first.',
                },
                { status: 400 }
            );
        }

        const result = await submitBatch(productsWithSources, {
            description: description || `Consolidation job for ${productsWithSources.length} products`,
            auto_apply: auto_apply || false,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // For Gemini batch, return immediately without processing items.
        if (result.execution_mode === 'gemini_batch') {
            return NextResponse.json({
                success: true,
                batch_id: result.batch_id,
                provider: 'gemini',
                execution_mode: 'gemini_batch',
                product_count: result.product_count,
                skipped_count: upcs.length - productsWithSources.length,
                message: `Queued ${result.product_count} products for Gemini consolidation. Image prep and batch processing may take up to 24 hours.`,
                status: {
                    id: result.batch_id,
                    status: 'pending',
                    is_complete: false,
                    is_failed: false,
                    is_processing: true,
                    total_requests: result.product_count,
                    completed_requests: 0,
                    failed_requests: 0,
                    progress_percent: 0,
                    metadata: { gemini_stage: 'preparing' },
                },
            });
        }

        // DeepSeek direct-chat: process items immediately
        let processedItemCount = 0;
        let completedItemCount = 0;
        let failedItemCount = 0;
        const chunkSize = 5;
        const maxIterations = Math.ceil(productsWithSources.length / chunkSize) + 2;

        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
            const processResult = await processBatchQueue(result.batch_id, { limit: chunkSize });
            if ('success' in processResult && !processResult.success) {
                return NextResponse.json({ error: processResult.error }, { status: 500 });
            }

            if ('processed' in processResult) {
                processedItemCount += processResult.processed;
                completedItemCount += processResult.completed;
                failedItemCount += processResult.failed;

                if (processResult.processed === 0 || processResult.status.is_complete || processResult.status.is_failed) {
                    break;
                }
            }
        }

        const status = await getBatchStatus(result.batch_id);

        // Auto-apply results for direct_chat_chunks
        let appliedCount: number | undefined;
        try {
            const applyResult = await applyResults(result.batch_id);
            if (applyResult && typeof applyResult === 'object' && 'success_count' in applyResult) {
                appliedCount = applyResult.success_count as number;
            }
            if ('success' in applyResult && !applyResult.success) {
                console.warn('[Consolidation API] Auto-apply warning:', applyResult.error);
            }
        } catch (applyError) {
            console.warn('[Consolidation API] Auto-apply failed (non-fatal):', applyError);
        }

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            provider: result.provider,
            provider_batch_id: result.provider_batch_id,
            product_count: result.product_count,
            skipped_count: upcs.length - productsWithSources.length,
            processed_item_count: processedItemCount,
            completed_item_count: completedItemCount,
            failed_item_count: failedItemCount,
            applied_count: appliedCount ?? completedItemCount,
            auto_applied: true,
            status: 'success' in status ? null : status,
        });
    } catch (error) {
        console.error('[Consolidation API] Submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit batch' },
            { status: 500 }
        );
    }
}
