import { getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import { PipelineClient } from '@/components/admin/pipeline/PipelineClient';

export default async function PipelinePage() {
    // Fetch initial data server-side
    const [{ products }, counts] = await Promise.all([
        getProductsByStatus('staging', { limit: 200 }),
        getStatusCounts(),
    ]);

    return (
        <div className="p-8">
            <PipelineClient
                initialProducts={products}
                initialCounts={counts}
                initialStatus="staging"
            />
        </div>
    );
}
