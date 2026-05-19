import { Metadata } from 'next';
import { Download } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';
import { getProductsByStage, getStatusCounts, getAvailableSourcesByStage } from '@/lib/pipeline';
import type { PipelineProduct, PipelineStage, StatusCount } from '@/lib/pipeline/types';

export const metadata: Metadata = {
    title: 'Export Products | Bay State',
    description: 'Generate Excel exports of pipeline products',
};

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PipelineExportPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const search = typeof params.search === 'string' ? params.search : undefined;
    const source = typeof params.source === 'string' ? params.source : undefined;
    const product_line = typeof params.product_line === 'string' ? params.product_line : undefined;

    const initialStage: PipelineStage = 'publishing';

    let initialCounts: StatusCount[] = [];
    let initialProducts: PipelineProduct[] = [];
    let initialTotal = 0;
    let initialSources: string[] = [];

    try {
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
        
        initialProducts = pResult.products;
        initialTotal = pResult.count;
        initialCounts = countsResult;
        initialSources = sourcesResult;
    } catch (error) {
        console.error('Error loading export page:', error);
    }

    return (
        <AdminPageShell
            title="Export"
            description="Prepare the publishing-stage products for export and downstream handoff."
            icon={<Download className="h-5 w-5" />}
            eyebrow="Workspace view"
            fullHeight
        >
            <PipelineClient
                initialProducts={initialProducts}
                initialCounts={initialCounts}
                initialTotal={initialTotal}
                initialStage={initialStage}
                initialSources={initialSources}
                hideTabs={false}
            />
        </AdminPageShell>
    );
}
