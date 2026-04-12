import { NextRequest, NextResponse } from 'next/server';
import {
    bulkUpdateStatus,
    getProductsByStatus,
    getProductsByStage,
    getSkusByStatus,
    getSkusByStage,
    getAvailableSources,
    getAvailableSourcesByStage,
} from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
    PERSISTED_PIPELINE_STATUSES,
    isPersistedStatus,
    normalizePipelineStage,
    type PersistedPipelineStatus,
    type PipelineStage,
} from '@/lib/pipeline/types';

const CANONICAL_PERSISTED_STATUS_LIST = PERSISTED_PIPELINE_STATUSES.map(
    status => `'${status}'`
).join(', ');

type StageWithProducts = PipelineStage;

function isStageWithProducts(stage: PipelineStage): stage is StageWithProducts {
    return Boolean(stage);
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const rawStage = searchParams.get('stage');
    const rawStatus = searchParams.get('status') || 'imported';
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '200', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const selectAll = searchParams.get('selectAll') === 'true';
    
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const source = searchParams.get('source') || undefined;
    const product_line = searchParams.get('product_line') || undefined;
    const cohort_id = searchParams.get('cohort_id') || undefined;
    const minConfidence = searchParams.get('minConfidence') ? parseFloat(searchParams.get('minConfidence')!) : undefined;
    const maxConfidence = searchParams.get('maxConfidence') ? parseFloat(searchParams.get('maxConfidence')!) : undefined;

    if (rawStage) {
        const stage = normalizePipelineStage(rawStage);

        if (!stage) {
            return NextResponse.json(
                { error: `Invalid stage '${rawStage}'.` },
                { status: 400 }
            );
        }

        if (!isStageWithProducts(stage)) {
            return NextResponse.json({
                products: [],
                count: 0,
                availableSources: [],
                skus: [],
            });
        }

        try {
            if (selectAll) {
                const { skus, count } = await getSkusByStage(stage, {
                    search: search || undefined,
                    startDate,
                    endDate,
                    source,
                    product_line,
                    cohort_id,
                    minConfidence,
                    maxConfidence,
                });

                return NextResponse.json({
                    skus,
                    count,
                });
            }

            const [{ products, count }, availableSources] = await Promise.all([
                getProductsByStage(stage, {
                    limit,
                    offset,
                    search: search || undefined,
                    startDate,
                    endDate,
                    source,
                    product_line,
                    cohort_id,
                    minConfidence,
                    maxConfidence,
                }),
                getAvailableSourcesByStage(stage),
            ]);

            return NextResponse.json({ products, count, availableSources });
        } catch (error) {
            console.error('Pipeline GET error:', error);
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Unknown error during pipeline fetch' },
                { status: 500 }
            );
        }
    }

    if (!isPersistedStatus(rawStatus)) {
        return NextResponse.json(
            { error: `Invalid status '${rawStatus}'. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}` },
            { status: 400 }
        );
    }

    const status: PersistedPipelineStatus = rawStatus;

    try {
        if (selectAll) {
            const { skus, count } = await getSkusByStatus(status, {
                search: search || undefined,
                startDate,
                endDate,
                source,
                product_line,
                cohort_id,
                minConfidence,
                maxConfidence,
            });

            return NextResponse.json({
                skus,
                count,
            });
        }

        const [{ products, count }, availableSources] = await Promise.all([
            getProductsByStatus(status, {
                limit,
                offset,
                search: search || undefined,
                startDate,
                endDate,
                source,
                product_line,
                cohort_id,
                minConfidence,
                maxConfidence,
            }),
            getAvailableSources(status),
        ]);

        return NextResponse.json({ products, count, availableSources });
    } catch (error) {
        console.error('Pipeline GET error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error during pipeline fetch' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, newStatus } = body as { skus: string[]; newStatus: string };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        if (!newStatus) {
            return NextResponse.json({ error: 'New status is required' }, { status: 400 });
        }

        if (newStatus === 'published') {
            return NextResponse.json(
                {
                    error: 'Published is no longer a workflow state. Use finalizing/exporting instead.',
                },
                { status: 400 }
            );
        }

        if (!isPersistedStatus(newStatus)) {
            return NextResponse.json(
                { error: `Invalid status '${newStatus}'. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}` },
                { status: 400 }
            );
        }

        const result = await bulkUpdateStatus(skus, newStatus);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, updatedCount: result.updatedCount, batchId: crypto.randomUUID() });
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
