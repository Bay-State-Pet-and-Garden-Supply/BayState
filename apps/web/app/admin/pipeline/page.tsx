import { Metadata } from 'next';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import { getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import type { PipelineProduct, StatusCount } from '@/lib/pipeline/types';

export const metadata: Metadata = {
    title: 'Pipeline | Admin | Bay State Pet & Garden',
    description: 'Manage product ingestion pipeline - import, scrape, consolidate, and publish products.',
    robots: {
        index: false,
        follow: false,
    },
};

export default async function PipelinePage() {
    let initialCounts: StatusCount[] = [];
    let initialProducts: PipelineProduct[] = [];
    let initialTotal = 0;

    try {
        const [counts, { products, count }] = await Promise.all([
            getStatusCounts(),
            getProductsByStatus('imported', { limit: 500 }),
        ]);

        initialCounts = counts;
        initialProducts = products;
        initialTotal = count;
    } catch (error) {
        console.error('Error loading pipeline page:', error);
    }

    return (
        <PipelineClient
            initialProducts={initialProducts}
            initialCounts={initialCounts}
            initialTotal={initialTotal}
        />
    );
}
