import { Metadata } from 'next';
import { UnifiedPipelineClient } from '@/components/admin/pipeline/UnifiedPipelineClient';
import { getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import { isDerivedTab, isPersistedStatus } from '@/lib/pipeline/types';
import type { PipelineProduct, PipelineStage, StatusCount } from '@/lib/pipeline/types';

export const metadata: Metadata = {
    title: 'Pipeline | Admin | Bay State Pet & Garden',
    description: 'Manage product ingestion pipeline - import, scrape, consolidate, and publish products.',
    robots: {
        index: false,
        follow: false,
    },
};

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PipelinePage({ searchParams }: PageProps) {
    const params = await searchParams;
    const rawStageParam = params.stage ?? params.status;
    const stageParam = typeof rawStageParam === 'string'
        ? rawStageParam
        : undefined;

    const initialStage: PipelineStage = stageParam && (isPersistedStatus(stageParam) || isDerivedTab(stageParam))
        ? stageParam
        : 'imported';

    let initialCounts: StatusCount[] = [];
    let initialProducts: PipelineProduct[] = [];
    let initialTotal = 0;

    try {
        const shouldFetchProducts = isPersistedStatus(initialStage);
        
        let counts: StatusCount[] = [];
        let products: PipelineProduct[] = [];
        let totalCount = 0;

        if (shouldFetchProducts) {
            const [pResult, countsResult] = await Promise.all([
                getProductsByStatus(initialStage, { limit: 500 }),
                getStatusCounts(),
            ]);
            products = pResult.products;
            totalCount = pResult.count;
            counts = countsResult;
        } else {
            counts = await getStatusCounts();
        }

        initialCounts = counts;
        initialProducts = products;
        initialTotal = totalCount;
    } catch (error) {
        console.error('Error loading pipeline page:', error);
    }

    return (
        <UnifiedPipelineClient
            initialProducts={initialProducts}
            initialCounts={initialCounts}
            initialTotal={initialTotal}
            initialStage={initialStage}
        />
    );
}
