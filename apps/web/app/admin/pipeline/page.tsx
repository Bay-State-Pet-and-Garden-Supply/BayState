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
    // Call library functions directly instead of internal fetch
    try {
        const [counts, { products, count }] = await Promise.all([
            getStatusCounts(),
            getProductsByStatus('imported', { limit: 500 }),
        ]);

        return (
            <PipelineClient
                initialProducts={products}
                initialCounts={counts}
                initialTotal={count}
            />
        );
    } catch (error) {
        console.error('Error loading pipeline page:', error);
        // Return with empty states as fallback
        return (
            <PipelineClient
                initialProducts={[]}
                initialCounts={[]}
                initialTotal={0}
            />
        );
    }
}
