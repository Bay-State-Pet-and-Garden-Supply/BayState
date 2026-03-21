'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';

interface Brand {
    id: string;
    name: string;
    slug: string;
}

interface ProductPetType {
    pet_type_id: string;
}

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
    product_type?: string | null;
    category_ids?: string[];
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

    const parseImages = (images: unknown): string[] => {
        if (!images) return [];
        let parsed: string[] = [];
        if (Array.isArray(images)) {
            parsed = images;
        } else if (typeof images === 'string') {
            try {
                parsed = JSON.parse(images);
            } catch {
                return [];
            }
        } else {
            return [];
        }

        // Ensure relative paths start with a leading slash
        return parsed.map(img => {
            if (typeof img !== 'string') return '';
            const trimmed = img.trim();
            if (trimmed.startsWith('http') || trimmed.startsWith('/')) {
                return trimmed;
            }
            // If it's a relative path without a leading slash, prepend it
            if (trimmed.length > 0) {
                return `/${trimmed}`;
            }
            return '';
        }).filter(Boolean);
    };

    const isValidImageUrl = (url: string) => {
        return url && (url.startsWith('/') || url.startsWith('http'));
    };

    const images = parseImages(product.images);

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

    if (loading) return null;

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                            <Package className="size-6 text-muted-foreground" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Edit Product</DialogTitle>
                            <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{product.sku}</p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex flex-col gap-6 p-6">
                    {/* Error Banner */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Form Content */}
                    <div className="grid gap-8 md:grid-cols-2">
                        {/* Left Column */}
                        <div className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="name">Product Name *</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter product name"
                                    aria-required="true"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="slug">Slug *</Label>
                                <Input
                                    id="slug"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    placeholder="product-slug"
                                    aria-describedby="slug-help"
                                    aria-required="true"
                                />
                                <p id="slug-help" className="text-xs text-muted-foreground">
                                    URL-friendly version of the name.
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="price">Price ($) *</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    placeholder="0.00"
                                    aria-required="true"
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="brand">Brand</Label>
                                    <Select value={brandId} onValueChange={setBrandId}>
                                        <SelectTrigger id="brand">
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

                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="stockStatus">Stock Status</Label>
                                    <Select value={stockStatus} onValueChange={setStockStatus}>
                                        <SelectTrigger id="stockStatus">
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
                            </div>

                            <div className="flex items-center gap-2 py-1">
                                <Checkbox
                                    id="featured"
                                    checked={isFeatured}
                                    onCheckedChange={(checked) => setIsFeatured(checked === true)}
                                />
                                <Label htmlFor="featured" className="cursor-pointer font-medium">
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
                        <div className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Enter product description…"
                                    rows={10}
                                    className="min-h-[240px] resize-none"
                                />
                            </div>

                            {/* Images Preview - Read Only for now */}
                            {images.length > 0 && (
                                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Images (Read-only)</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {images
                                            .filter(isValidImageUrl)
                                            .slice(0, 4)
                                            .map((img, idx) => (
                                                <div
                                                    key={idx}
                                                    className="size-16 rounded-md border bg-background overflow-hidden relative"
                                                >
                                                    <img
                                                        src={img}
                                                        alt={`Product image ${idx + 1}`}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div>
                                            ))}
                                        {images.length > 4 && (
                                            <div className="flex size-16 items-center justify-center rounded-md border bg-muted text-xs font-medium">
                                                +{images.length - 4}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground italic">Image management coming soon…</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-4 bg-muted/50 p-6">
                    <div className="flex-1 text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span className="flex items-center gap-1">
                            Press <kbd className="rounded bg-muted-foreground/20 px-1 font-sans text-[9px] uppercase">Esc</kbd> to close
                        </span>
                        <span className="text-muted-foreground/30">•</span>
                        <span className="flex items-center gap-1">
                            <kbd className="rounded bg-muted-foreground/20 px-1 font-sans text-[9px] uppercase">Ctrl+S</kbd> to save
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="min-w-[120px]"
                        >
                            {saving ? (
                                <>
                                    <Spinner data-icon="inline-start" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <Save data-icon="inline-start" />
                                    Save Product
                                </>
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
