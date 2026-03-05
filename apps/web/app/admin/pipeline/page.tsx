import { getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import { UnifiedPipelineClient } from '@/components/admin/pipeline/UnifiedPipelineClient';

export default async function PipelinePage() {
    // Fetch initial data server-side
    const [{ products }, counts] = await Promise.all([
        getProductsByStatus('staging', { limit: 200 }),
        getStatusCounts(),
    ]);

    return (
        <div className="p-8">
            <UnifiedPipelineClient
                initialProducts={products}
                initialCounts={counts}
            />
        </div>
    );
}
