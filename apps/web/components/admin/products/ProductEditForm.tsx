'use client';

import { useState, useEffect } from 'react';
import { Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PetTypeSelector } from './PetTypeSelector';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { updateProduct } from '@/app/admin/products/actions';
import { cn } from '@/lib/utils';

export interface PublishedProduct {
    id: string;
    sku: string;
    name: string;
    slug: string;
    description: string | null;
    long_description?: string | null;
    price: number;
    weight?: string | null;
    brand_id: string | null;
    category_ids?: string[];
    search_keywords?: string | null;
    gtin?: string | null;
    availability?: string | null;
    minimum_quantity?: number | null;
    is_special_order?: boolean;
    is_taxable?: boolean;
    product_on_pages?: string[] | string | null;
    stock_status: string;
    quantity?: number | null;
    low_stock_threshold?: number | null;
    published_at?: string | null;
    images: string[] | null;
}

interface Brand {
    id: string;
    name: string;
    slug: string;
}

interface Category {
    id: string;
    name: string;
}

interface ProductPetType {
    pet_type_id: string;
}

export function ProductEditForm({ product }: { product: PublishedProduct }) {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form state
    const [name, setName] = useState(product.name);
    const [slug, setSlug] = useState(product.slug);
    const [sku, setSku] = useState(product.sku || '');
    const [description, setDescription] = useState(product.description || '');
    const [longDescription, setLongDescription] = useState(product.long_description || '');
    const [price, setPrice] = useState(String(product.price));
    const [weight, setWeight] = useState(product.weight || '');
    const [brandId, setBrandId] = useState(product.brand_id || 'none');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState(product.category_ids || []);
    const [searchKeywords, setSearchKeywords] = useState(product.search_keywords || '');
    const [gtin, setGtin] = useState(product.gtin || '');
    const [availability, setAvailability] = useState(product.availability || 'in stock');
    const [minQty, setMinQty] = useState(String(product.minimum_quantity || '0'));
    const [isSpecialOrder, setIsSpecialOrder] = useState(product.is_special_order || false);
    const [isTaxable, setIsTaxable] = useState(product.is_taxable ?? true);
    
    // Inventory
    const [stockStatus, setStockStatus] = useState(product.stock_status || 'in_stock');
    const [quantity, setQuantity] = useState(product.quantity !== undefined && product.quantity !== null ? String(product.quantity) : '');
    const [lowStockThreshold, setLowStockThreshold] = useState(product.low_stock_threshold !== undefined && product.low_stock_threshold !== null ? String(product.low_stock_threshold) : '');
    
    // Publishing
    const [publishedAt, setPublishedAt] = useState(product.published_at ? new Date(product.published_at).toISOString().slice(0, 16) : '');
    
    const initialPages = Array.isArray(product.product_on_pages) 
        ? product.product_on_pages 
        : typeof product.product_on_pages === 'string' 
            ? product.product_on_pages.split('|').map(p => p.trim()).filter(Boolean)
            : [];
    const [productOnPages, setProductOnPages] = useState<string[]>(initialPages);
    const [selectedPetTypes, setSelectedPetTypes] = useState<ProductPetType[]>([]);

    const parseImages = (images: unknown): string[] => {
        if (!images) return [];
        let parsed: string[] = [];
        if (Array.isArray(images)) parsed = images;
        else if (typeof images === 'string') {
            try { parsed = JSON.parse(images); } catch { return []; }
        } else return [];
        return parsed.map(img => {
            if (typeof img !== 'string') return '';
            const trimmed = img.trim();
            if (trimmed.startsWith('http') || trimmed.startsWith('/')) return trimmed;
            if (trimmed.length > 0) return `/${trimmed}`;
            return '';
        }).filter(Boolean);
    };

    const isValidImageUrl = (url: string) => url && (url.startsWith('/') || url.startsWith('http'));
    const images = parseImages(product.images);
    const categoryOptions = categories.map((category) => ({ id: category.id, name: category.name }));

    useEffect(() => {
        async function fetchData() {
            try {
                const [brandsRes, categoriesRes, petTypesRes] = await Promise.all([
                    fetch('/api/admin/brands'),
                    fetch('/api/admin/categories'),
                    fetch(`/api/admin/products/${product.id}/pet-types`),
                ]);
                if (brandsRes.ok) {
                    const data = await brandsRes.json();
                    setBrands(data.brands || []);
                }
                if (categoriesRes.ok) {
                    const data = await categoriesRes.json();
                    setCategories(data.categories || []);
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

    const togglePage = (page: string) => {
        setProductOnPages(prev => prev.includes(page) ? prev.filter(p => p !== page) : [...prev, page]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('slug', slug.trim());
            if (sku) formData.append('sku', sku.trim());
            formData.append('description', description.trim());
            formData.append('long_description', longDescription.trim());
            formData.append('price', price);
            if (weight) formData.append('weight', weight.trim());
            formData.append('category_ids', JSON.stringify(selectedCategoryIds));
            if (searchKeywords) formData.append('search_keywords', searchKeywords.trim());
            if (gtin) formData.append('gtin', gtin.trim());
            if (availability) formData.append('availability', availability.trim());
            if (minQty) formData.append('minimum_quantity', minQty);
            formData.append('is_special_order', String(isSpecialOrder));
            formData.append('is_taxable', String(isTaxable));
            formData.append('product_on_pages', JSON.stringify(productOnPages));
            formData.append('stock_status', stockStatus);
            if (quantity) formData.append('quantity', quantity);
            if (lowStockThreshold) formData.append('low_stock_threshold', lowStockThreshold);
            if (publishedAt) formData.append('published_at', new Date(publishedAt).toISOString());

            if (brandId !== 'none') {
                formData.append('brand_id', brandId);
            } else {
                formData.append('brand_id', '');
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
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold tracking-tight">Edit Product Data</h2>
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <><Spinner className="mr-2" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                </Button>
            </div>

            <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-7 mb-4">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                    <TabsTrigger value="inventory">Inventory</TabsTrigger>
                    <TabsTrigger value="shipping">Shipping</TabsTrigger>
                    <TabsTrigger value="seo">SEO</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                    <TabsTrigger value="publishing">Publishing</TabsTrigger>
                </TabsList>
                
                {/* Basic Info Tab */}
                <TabsContent value="basic" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Product Name *</Label>
                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="slug">Slug *</Label>
                                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sku">SKU</Label>
                            <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Short Description</Label>
                            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="longDescription">Long Description</Label>
                            <Textarea id="longDescription" value={longDescription} onChange={(e) => setLongDescription(e.target.value)} rows={8} />
                        </div>
                    </div>
                </TabsContent>

                {/* Pricing Tab */}
                <TabsContent value="pricing" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="space-y-2">
                            <Label htmlFor="price">Price ($) *</Label>
                            <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="minQty">Minimum Quantity</Label>
                            <Input id="minQty" type="number" min="0" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <Checkbox id="taxable" checked={isTaxable} onCheckedChange={(c) => setIsTaxable(c === true)} />
                            <Label htmlFor="taxable" className="cursor-pointer">Taxable Product</Label>
                        </div>
                    </div>
                </TabsContent>

                {/* Inventory Tab */}
                <TabsContent value="inventory" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="space-y-2">
                            <Label htmlFor="stockStatus">Stock Status</Label>
                            <Select value={stockStatus} onValueChange={setStockStatus}>
                                <SelectTrigger id="stockStatus">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="in_stock">In Stock</SelectItem>
                                    <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                    <SelectItem value="pre_order">Pre-Order</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="quantity">Quantity on Hand</Label>
                                <Input id="quantity" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                                <Input id="lowStockThreshold" type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Shipping Tab */}
                <TabsContent value="shipping" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="space-y-2">
                            <Label htmlFor="weight">Weight (lbs)</Label>
                            <Input id="weight" value={weight} onChange={(e) => setWeight(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <Checkbox id="specialOrder" checked={isSpecialOrder} onCheckedChange={(c) => setIsSpecialOrder(c === true)} />
                            <Label htmlFor="specialOrder" className="cursor-pointer">Special Order Item</Label>
                        </div>
                    </div>
                </TabsContent>

                {/* SEO Tab */}
                <TabsContent value="seo" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="space-y-2">
                            <Label htmlFor="gtin">GTIN / UPC</Label>
                            <Input id="gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="keywords">Search Keywords</Label>
                            <Input id="keywords" value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)} placeholder="comma-separated terms" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="availability">Availability Text</Label>
                            <Input id="availability" value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. usually ships in 24 hours" />
                        </div>
                    </div>
                </TabsContent>

                {/* Categories Tab */}
                <TabsContent value="categories" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="space-y-2">
                            <Label htmlFor="brand">Brand</Label>
                            <Select value={brandId} onValueChange={setBrandId}>
                                <SelectTrigger id="brand">
                                    <SelectValue placeholder="Select a brand" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No brand</SelectItem>
                                    {brands.map((brand) => (
                                        <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="categories">Categories</Label>
                            <SearchableMultiSelect
                                options={categoryOptions}
                                selected={selectedCategoryIds}
                                onChange={setSelectedCategoryIds}
                                placeholder="Select categories..."
                                searchPlaceholder="Search categories..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Assign to ShopSite Pages</Label>
                            <div className="flex flex-wrap gap-2 p-3 rounded-md border bg-muted/30 min-h-[80px]">
                                {SHOPSITE_PAGES.map(page => (
                                    <Badge
                                        key={page}
                                        variant={productOnPages.includes(page) ? "default" : "outline"}
                                        className="cursor-pointer select-none transition-colors"
                                        onClick={() => togglePage(page)}
                                    >
                                        {page}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        <div className="pt-4 border-t">
                            <PetTypeSelector selectedPetTypes={selectedPetTypes} onChange={setSelectedPetTypes} />
                        </div>
                    </div>
                </TabsContent>

                {/* Publishing Tab */}
                <TabsContent value="publishing" className="space-y-4">
                    <div className="grid gap-4 bg-card border rounded-lg p-6">
                        <div className="space-y-2">
                            <Label htmlFor="publishedAt">Published At</Label>
                            <Input id="publishedAt" type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
                        </div>
                        {/* Note: images read-only view */}
                        {images.length > 0 && (
                            <div className="space-y-4 pt-4 border-t">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Product Images</h3>
                                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{images.length} total</span>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {images.filter(isValidImageUrl).map((img, idx) => (
                                        <div key={img} className="size-16 rounded-md border bg-background overflow-hidden relative">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={img} alt={`Product view ${idx + 1}`} className="h-full w-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

            </Tabs>
        </div>
    );
}
