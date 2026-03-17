'use client';

import { useEffect, useState } from 'react';
import { ImageIcon, Check, Loader2 } from 'lucide-react';

interface ProductNeedingImages {
    sku: string;
    image_candidates: string[];
    consolidated: Record<string, unknown> | null;
    pipeline_status: string;
}

interface ImageSelectionTabProps {
    className?: string;
}

export function ImageSelectionTab({ className }: ImageSelectionTabProps) {
    const [products, setProducts] = useState<ProductNeedingImages[]>([]);
    const [selectedImages, setSelectedImages] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchProducts = async () => {
        try {
            const response = await fetch('/api/admin/pipeline/images?status=needs-images');
            if (!response.ok) throw new Error('Failed to fetch products');
            const data = await response.json();
            setProducts(data.products || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const toggleImage = (sku: string, imageUrl: string) => {
        setSelectedImages((prev) => {
            const current = prev[sku] || [];
            const updated = current.includes(imageUrl)
                ? current.filter((img) => img !== imageUrl)
                : [...current, imageUrl];
            return { ...prev, [sku]: updated };
        });
    };

    const saveImages = async (sku: string) => {
        const images = selectedImages[sku] || [];
        if (images.length === 0) return;

        setSaving(sku);
        try {
            const response = await fetch('/api/admin/pipeline/images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, selectedImages: images }),
            });

            if (!response.ok) throw new Error('Failed to save images');

            setProducts((prev) => prev.filter((p) => p.sku !== sku));
            setSelectedImages((prev) => {
                const updated = { ...prev };
                delete updated[sku];
                return updated;
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return (
            <div className={`flex items-center justify-center py-12 ${className}`}>
                <Loader2 className="h-8 w-8 animate-spin text-[#008850]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
                <p className="text-sm text-red-600">Error: {error}</p>
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
                <ImageIcon className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">All products have images</h3>
                <p className="text-sm text-gray-500 mt-1">No products need image selection</p>
            </div>
        );
    }

    return (
        <div className={`space-y-6 ${className}`}>
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                    {products.length} product{products.length !== 1 ? 's' : ''} need{products.length === 1 ? 's' : ''} images
                </h3>
            </div>

            {products.map((product) => (
                <div
                    key={product.sku}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h4 className="font-medium text-gray-900">{product.sku}</h4>
                            <p className="text-sm text-gray-500">
                                {typeof product.consolidated?.name === 'string' ? product.consolidated.name : 'Unnamed Product'}
                            </p>
                        </div>
                        <button
                            onClick={() => saveImages(product.sku)}
                            disabled={saving === product.sku || !(selectedImages[product.sku]?.length > 0)}
                            className="inline-flex items-center gap-1 rounded-md bg-[#008850] px-4 py-2 text-sm font-medium text-white hover:bg-[#007a48] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving === product.sku ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4" />
                                    Save Selected
                                </>
                            )}
                        </button>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {product.image_candidates.map((url, idx) => (
                            <button
                                key={idx}
                                onClick={() => toggleImage(product.sku, url)}
                                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                    selectedImages[product.sku]?.includes(url)
                                        ? 'border-[#008850] ring-2 ring-[#008850]/20'
                                        : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <img
                                    src={url}
                                    alt={`Candidate ${idx + 1}`}
                                    className="h-full w-full object-cover"
                                />
                                {selectedImages[product.sku]?.includes(url) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[#008850]/20">
                                        <div className="rounded-full bg-[#008850] p-1">
                                            <Check className="h-4 w-4 text-white" />
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
