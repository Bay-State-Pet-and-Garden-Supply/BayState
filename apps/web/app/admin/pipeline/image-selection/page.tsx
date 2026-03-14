import { ImageSelectionTab } from '@/components/admin/pipeline/ImageSelectionTab';

export default function ImageSelectionPage() {
    return (
        <div className="p-8 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Image Selection</h1>
                <p className="text-gray-600">Select and approve images for products before exporting</p>
            </div>
            
            <ImageSelectionTab />
        </div>
    );
}
