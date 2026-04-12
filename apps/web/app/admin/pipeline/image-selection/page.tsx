import { Suspense } from 'react';
import ImageSelectionPageClient from './ImageSelectionPageClient';

interface PageProps {
    searchParams: Promise<{ sku?: string }>;
}

export const metadata = {
    title: 'Image Selection | Bay State',
};

function LoadingState() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-forest-green/20 border-t-brand-forest-green mx-auto mb-4" />
                <p className="text-muted-foreground">Loading...</p>
            </div>
        </div>
    );
}

function ErrorState() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center max-w-md p-6">
                <div className="bg-red-50 rounded-full h-12 w-12 flex items-center justify-center mx-auto mb-4">
                    <svg
                        className="h-6 w-6 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>
                <h1 className="text-xl font-semibold text-foreground mb-2">
                    SKU Parameter Required
                </h1>
                <p className="text-muted-foreground">
                    Please provide a valid SKU parameter to access the image selection workspace.
                </p>
            </div>
        </div>
    );
}

export default async function ImageSelectionPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const sku = params.sku;

    if (!sku) {
        return <ErrorState />;
    }

    return (
        <Suspense fallback={<LoadingState />}>
            <ImageSelectionPageClient sku={sku} />
        </Suspense>
    );
}
