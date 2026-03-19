import { Metadata } from 'next';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import type { PipelineProduct, StatusCount } from '@/lib/pipeline/types';

export const metadata: Metadata = {
    title: 'Pipeline | Admin | Bay State Pet & Garden',
    description: 'Manage product ingestion pipeline - import, scrape, consolidate, and publish products.',
    robots: {
        index: false,
        follow: false,
    },
};

/**
 * Fetches stage counts from the API.
 */
async function fetchCounts(): Promise<StatusCount[]> {
    try {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/admin/pipeline/counts`,
            {
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!res.ok) {
            console.error('Failed to fetch counts:', res.status, res.statusText);
            return getDefaultCounts();
        }

        const data = await res.json();
        return data.counts || getDefaultCounts();
    } catch (error) {
        console.error('Error fetching counts:', error);
        return getDefaultCounts();
    }
}

/**
 * Fetches initial products for the imported stage.
 */
async function fetchProducts(): Promise<{ products: PipelineProduct[]; count: number }> {
    try {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/admin/pipeline?status=imported&limit=50`,
            {
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!res.ok) {
            console.error('Failed to fetch products:', res.status, res.statusText);
            return { products: [], count: 0 };
        }

        const data = await res.json();
        return {
            products: data.products || [],
            count: data.count || 0,
        };
    } catch (error) {
        console.error('Error fetching products:', error);
        return { products: [], count: 0 };
    }
}

/**
 * Returns default counts for all pipeline stages.
 */
function getDefaultCounts(): StatusCount[] {
    return [
        { status: 'imported', count: 0 },
        { status: 'scraped', count: 0 },
        { status: 'consolidated', count: 0 },
        { status: 'finalized', count: 0 },
        { status: 'published', count: 0 },
    ];
}

export default async function PipelinePage() {
    // Fetch counts first (lightweight), then products for default view
    const [counts, { products, count }] = await Promise.all([
        fetchCounts(),
        fetchProducts(),
    ]);

    return (
        <PipelineClient
            initialProducts={products}
            initialCounts={counts}
        />
    );
}
