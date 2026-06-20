import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { submitBatch, processBatchQueue, getBatchStatus } from '@/lib/consolidation/batch-service';
import { applyResults } from '@/lib/consolidation/apply-service';
import type { ProductSource } from '@/lib/consolidation/types';

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { product_line_ids, singleton_upcs } = body;

        const supabase = await createAdminClient();
        const allUpcs: string[] = [];
        const warnings: string[] = [];

        // Collect UPCs from approved Product Groups
        if (product_line_ids && Array.isArray(product_line_ids)) {
            for (const lineId of product_line_ids) {
                const { data: products } = await supabase
                    .from('products_ingestion')
                    .select('upc, product_line_review_required, product_line_assignment_source, product_line_id')
                    .eq('product_line_id', lineId)
                    .eq('pipeline_status', 'grouping');

                for (const p of (products || [])) {
                    if (p.product_line_review_required || !p.product_line_assignment_source) {
                        warnings.push(`Product ${p.upc} in group ${lineId} still needs review — skipped`);
                    } else {
                        allUpcs.push(p.upc);
                    }
                }
            }
        }

        // Collect accepted Singletons
        if (singleton_upcs && Array.isArray(singleton_upcs)) {
            const { data: singletons } = await supabase
                .from('products_ingestion')
                .select('upc, product_line_review_required, product_line_assignment_source')
                .in('upc', singleton_upcs)
                .eq('pipeline_status', 'grouping')
                .is('product_line_id', null);

            for (const s of (singletons || [])) {
                if (s.product_line_review_required || s.product_line_assignment_source !== 'manual') {
                    warnings.push(`Singleton ${s.upc} not yet accepted — skipped`);
                } else {
                    allUpcs.push(s.upc);
                }
            }
        }

        if (allUpcs.length === 0) {
            return NextResponse.json({ 
                error: 'No approved products to consolidate', 
                warnings 
            }, { status: 400 });
        }

        // Move approved products to merging
        await supabase
            .from('products_ingestion')
            .update({ pipeline_status: 'merging', updated_at: new Date().toISOString() })
            .in('upc', allUpcs);

        // Fetch product data for consolidation
        const { data: products } = await supabase
            .from('products_ingestion')
            .select('upc, sources, input, product_line_id')
            .in('upc', allUpcs);

        if (!products || products.length === 0) {
            return NextResponse.json({ error: 'No products found' }, { status: 404 });
        }

        // Build ProductSource array with group context
        const productSources: ProductSource[] = products.map(p => ({
            upc: p.upc,
            sources: (p.sources || {}) as Record<string, unknown>,
        }));

        // Submit consolidation batch
        const batchMetadata: Record<string, string | number | boolean | undefined> = {
            description: `Group consolidation: ${allUpcs.length} products`,
            auto_apply: true,
            is_group_consolidation: true,
            group_label: product_line_ids?.length === 1
                ? (await supabase.from('product_lines').select('canonical_name').eq('id', product_line_ids[0]).single()).data?.canonical_name as string | undefined
                : undefined,
        };

        const result = await submitBatch(productSources, batchMetadata);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Process items immediately (direct-chat mode)
        let processedCount = 0;
        const chunkSize = 5;
        const maxIterations = Math.ceil(allUpcs.length / chunkSize) + 3;

        for (let i = 0; i < maxIterations; i++) {
            const pr = await processBatchQueue(result.batch_id, { limit: chunkSize });
            if ('success' in pr && !pr.success) break;
            if ('processed' in pr) {
                processedCount += pr.processed;
                if (pr.processed === 0 || pr.status.is_complete || pr.status.is_failed) break;
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
                console.warn('[Grouping Consolidate] Auto-apply warning:', applyResult.error);
            }
        } catch (applyError) {
            console.warn('[Grouping Consolidate] Auto-apply failed (non-fatal):', applyError);
        }

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            product_count: allUpcs.length,
            warnings: warnings.length > 0 ? warnings : undefined,
            completed_requests: 'completed_requests' in status ? status.completed_requests : 0,
            failed_requests: 'failed_requests' in status ? status.failed_requests : 0,
            applied_count: appliedCount ?? 0,
            auto_applied: true,
        });
    } catch (error) {
        console.error('[Grouping Consolidate] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit consolidation' },
            { status: 500 }
        );
    }
}
