'use client';

import { useRouter } from 'next/navigation';
import { ImageSelectionWorkspace } from '@/components/admin/pipeline/ImageSelectionWorkspace';

interface ImageSelectionPageClientProps {
    sku: string;
}

function ImageSelectionPageClient({ sku }: ImageSelectionPageClientProps) {
    const router = useRouter();

    const handleClose = () => {
        router.back();
    };

    return (
        <ImageSelectionWorkspace
            sku={sku}
            onClose={handleClose}
        />
    );
}

export default ImageSelectionPageClient;
