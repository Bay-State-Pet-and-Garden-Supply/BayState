import { Metadata } from 'next';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import { getProductsByStage, getStatusCounts, getAvailableSourcesByStage } from '@/lib/pipeline';
import { normalizePipelineStage } from '@/lib/pipeline/types';
import type { PipelineProduct, PipelineStage, StatusCount } from '@/lib/pipeline/types';

export const metadata: Metadata = {
    title: 'Pipeline | Admin | Bay State Pet & Garden',
    description: 'Manage product ingestion workflow from import through exporting.',
    robots: {
        index: false,
        follow: false,
    },
};

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

type StageWithProducts = PipelineStage;

function isStageWithProducts(stage: PipelineStage): stage is StageWithProducts {
    return Boolean(stage);
}

export default async function PipelinePage({ searchParams }: PageProps) {
    const params = await searchParams;
    const rawStageParam = params.stage ?? params.status;
    const stageParam = typeof rawStageParam === 'string'
        ? rawStageParam
        : undefined;

    const search = typeof params.search === 'string' ? params.search : undefined;
    const source = typeof params.source === 'string' ? params.source : undefined;
    const product_line = typeof params.product_line === 'string' ? params.product_line : undefined;

    const initialStage: PipelineStage =
        normalizePipelineStage(stageParam) ?? 'imported';

    let initialCounts: StatusCount[] = [];
    let initialProducts: PipelineProduct[] = [];
    let initialTotal = 0;
    let initialSources: string[] = [];

    try {
        let counts: StatusCount[] = [];
        let products: PipelineProduct[] = [];
        let totalCount = 0;
        let sources: string[] = [];

        if (isStageWithProducts(initialStage)) {
            const [pResult, countsResult, sourcesResult] = await Promise.all([
                getProductsByStage(initialStage, {
                    limit: 500,
                    search,
                    source,
                    product_line
                }),
                getStatusCounts(),
                getAvailableSourcesByStage(initialStage),
            ]);
            products = pResult.products;
            totalCount = pResult.count;
            counts = countsResult;
            sources = sourcesResult;
        } else {
            counts = await getStatusCounts();
        }

        initialCounts = counts;
        initialProducts = products;
        initialTotal = totalCount;
        initialSources = sources;
    } catch (error) {
        console.error('Error loading pipeline page:', error);
    }

    return (
        <PipelineClient
            initialProducts={initialProducts}
            initialCounts={initialCounts}
            initialTotal={initialTotal}
            initialStage={initialStage}
            initialSources={initialSources}
        />
    );
}
