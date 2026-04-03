import { Metadata } from 'next';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import { getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import { getStageDataStatus, isPipelineStage } from '@/lib/pipeline/types';
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

    const initialStage: PipelineStage = stageParam && isPipelineStage(stageParam)
        ? stageParam
        : 'imported';

    let initialCounts: StatusCount[] = [];
    let initialProducts: PipelineProduct[] = [];
    let initialTotal = 0;

    try {
        let counts: StatusCount[] = [];
        let products: PipelineProduct[] = [];
        let totalCount = 0;

        const initialDataStatus = getStageDataStatus(initialStage);

        if (initialDataStatus) {
            const [pResult, countsResult] = await Promise.all([
                getProductsByStatus(initialDataStatus, { limit: 500 }),
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
        <PipelineClient
            initialProducts={initialProducts}
            initialCounts={initialCounts}
            initialTotal={initialTotal}
            initialStage={initialStage}
        />
    );
}
