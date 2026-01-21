'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { PetTypeSelector } from './PetTypeSelector';
import { updateProduct } from '@/app/admin/products/actions';

interface Brand {
    id: string;
    name: string;
    slug: string;
}

interface ProductPetType {
    pet_type_id: string;
    confidence: 'inferred' | 'manual' | 'verified';
}

// Define specific type based on queries used in AdminProductsClient
export interface PublishedProduct {
    id: string;
    sku: string;
    name: string;
    slug: string;
    description: string | null;
    price: number;
    stock_status: string;
    is_featured: boolean;
    images: string[] | null;
    brand_id: string | null;
    brand_name: string | null;
    brand_slug: string | null;
    created_at: string;
}

interface ProductEditModalProps {
    product: PublishedProduct;
    onClose: () => void;
    onSave: () => void;
}

const stockStatusOptions = [
    { value: 'in_stock', label: 'In Stock' },
    { value: 'low_stock', label: 'Low Stock' },
    { value: 'out_of_stock', label: 'Out of Stock' },
    { value: 'pre_order', label: 'Pre-Order' },
];

export function ProductEditModal({
    product,
    onClose,
    onSave,
}: ProductEditModalProps) {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState(product.name);
    const [slug, setSlug] = useState(product.slug);
    const [description, setDescription] = useState(product.description || '');
    const [price, setPrice] = useState(String(product.price));
    const [brandId, setBrandId] = useState(product.brand_id || 'none');
    const [stockStatus, setStockStatus] = useState(product.stock_status);
    const [isFeatured, setIsFeatured] = useState(product.is_featured);
    const [selectedPetTypes, setSelectedPetTypes] = useState<ProductPetType[]>([]);

    // Parse images helper
    const parseImages = (images: unknown): string[] => {
        if (!images) return [];
        if (Array.isArray(images)) return images;
        if (typeof images === 'string') {
            try {
                return JSON.parse(images);
            } catch {
                return [];
            }
        }
        return [];
    };

    const images = parseImages(product.images);

    // Fetch brands and product pet types
    useEffect(() => {
        async function fetchData() {
            try {
                const [brandsRes, petTypesRes] = await Promise.all([
                    fetch('/api/admin/brands'),
                    fetch(`/api/admin/products/${product.id}/pet-types`),
                ]);
                
                if (brandsRes.ok) {
                    const data = await brandsRes.json();
                    setBrands(data.brands || []);
                }
                
                if (petTypesRes.ok) {
                    const data = await petTypesRes.json();
                    setSelectedPetTypes(data.petTypes || []);
                }
            } catch (err) {
                console.error('Failed to load data', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [product.id]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        },
        [onClose]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('slug', slug.trim());
            formData.append('description', description.trim());
            formData.append('price', price);
            formData.append('stock_status', stockStatus);
            formData.append('is_featured', String(isFeatured));

            if (brandId !== 'none') {
                formData.append('brand_id', brandId);
            }

            const [productResult, petTypesRes] = await Promise.all([
                updateProduct(product.id, formData),
                fetch(`/api/admin/products/${product.id}/pet-types`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ petTypes: selectedPetTypes }),
                }),
            ]);

            if (!productResult.success) {
                throw new Error(productResult.error || 'Failed to update product');
            }

            if (!petTypesRes.ok) {
                throw new Error('Failed to update pet types');
            }

            toast.success('Product updated successfully');
            onSave();
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="rounded-lg bg-white p-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Package className="h-6 w-6 text-gray-600" />
                        <div>
                            <h2 className="text-lg font-semibold">Edit Product</h2>
                            <p className="text-sm text-gray-600 font-mono">{product.sku}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 hover:bg-gray-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Form Content */}
                <div className="p-6 space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* Left Column */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Product Name *</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter product name"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="slug">Slug *</Label>
                                <Input
                                    id="slug"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    placeholder="product-slug"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="price">Price ($) *</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="brand">Brand</Label>
                                <Select value={brandId} onValueChange={setBrandId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a brand" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No brand</SelectItem>
                                        {brands.map((brand) => (
                                            <SelectItem key={brand.id} value={brand.id}>
                                                {brand.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="stockStatus">Stock Status</Label>
                                <Select value={stockStatus} onValueChange={setStockStatus}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stockStatusOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <Checkbox
                                    id="featured"
                                    checked={isFeatured}
                                    onCheckedChange={(checked) => setIsFeatured(checked === true)}
                                />
                                <Label htmlFor="featured" className="cursor-pointer">
                                    Featured Product
                                </Label>
                            </div>

                            <PetTypeSelector
                                productId={product.id}
                                selectedPetTypes={selectedPetTypes}
                                onChange={setSelectedPetTypes}
                            />
                        </div>

                        {/* Right Column - Description */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Enter product description"
                                    rows={8}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                />
                            </div>

                            {/* Images Preview - Read Only for now */}
                            {images.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Images (Read-only)</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {images
                                            .map((img) => img.trim())
                                            .filter((img) => img.startsWith('/') || img.startsWith('http'))
                                            .slice(0, 4)
                                            .map((img, idx) => (
                                                <div
                                                    key={idx}
                                                    className="h-16 w-16 rounded border bg-gray-100 overflow-hidden"
                                                >
                                                    <img
                                                        src={img}
                                                        alt={`Product image ${idx + 1}`}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div>
                                            ))}
                                        {images.length > 4 && (
                                            <div className="flex h-16 w-16 items-center justify-center rounded border bg-gray-50 text-sm text-gray-600">
                                                +{images.length - 4}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">Image management coming soon</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 flex items-center justify-between border-t bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-600">
                        Press <kbd className="rounded bg-gray-200 px-1">Esc</kbd> to close,{' '}
                        <kbd className="rounded bg-gray-200 px-1">Ctrl+S</kbd> to save
                    </p>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                        >
                            <Save className="mr-2 h-4 w-4" />
                            {saving ? 'Saving...' : 'Save Product'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
