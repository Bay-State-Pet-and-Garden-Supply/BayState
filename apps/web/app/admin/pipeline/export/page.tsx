import { getStatusCounts } from '@/lib/pipeline';
import { ExportTab } from '@/components/admin/pipeline/ExportTab';

export default async function ExportPage() {
    const counts = await getStatusCounts();
    
    // Convert counts array to record map
    const productCounts = counts.reduce((acc, { status, count }) => {
        acc[status] = count;
        return acc;
    }, {} as Record<string, number>);
    
    // For now, setting needs-images to 0 unless we fetch it
    productCounts['needs-images'] = 0;

    return (
        <div className="p-8 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Export Data</h1>
                <p className="text-gray-600">Export products from the pipeline</p>
            </div>
            
            <ExportTab productCounts={productCounts} />
        </div>
    );
}
