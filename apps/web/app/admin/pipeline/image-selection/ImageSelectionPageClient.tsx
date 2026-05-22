'use client';

import { useRouter } from 'next/navigation';
import { ImageSelectionWorkspace } from '@/components/admin/pipeline/ImageSelectionWorkspace';

interface ImageSelectionPageClientProps {
    upc: string;
}

function ImageSelectionPageClient({ upc }: ImageSelectionPageClientProps) {
    const router = useRouter();

    const handleClose = () => {
        router.back();
    };

    return (
        <ImageSelectionWorkspace
            upc={upc}
            onClose={handleClose}
        />
    );
}

export default ImageSelectionPageClient;
