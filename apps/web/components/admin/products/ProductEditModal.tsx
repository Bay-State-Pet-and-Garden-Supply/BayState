'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Package, AlertCircle, Info, Search, Plus, Check, X, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
import { Badge } from '@/components/ui/badge';
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { PetTypeSelector } from './PetTypeSelector';
import { updateProduct } from '@/app/admin/products/actions';
import { cn, formatImageUrl } from '@/lib/utils';

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
    brand_name: string | null;
    brand_slug: string | null;
    category?: string | null;
    product_type?: string | null;
    search_keywords?: string | null;
    gtin?: string | null;
    availability?: string | null;
    minimum_quantity?: number | null;
    quantity?: number | null;
    low_stock_threshold?: number | null;
    published_at?: string | null;
    is_special_order?: boolean;
    is_taxable?: boolean;
    product_on_pages?: string[] | string | null;
    stock_status: string;
    is_featured: boolean;
    images: string[] | null;
    category_ids?: string[];
    created_at: string;
}

interface ProductEditModalProps {
    product: PublishedProduct;
    onClose: () => void;
    onSave: () => void;
}

export function ProductEditModal({
    product,
    onClose,
    onSave,
}: ProductEditModalProps) {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState(product.name);
    const [slug, setSlug] = useState(product.slug);
    const [description, setDescription] = useState(product.description || '');
    const [longDescription, setLongDescription] = useState(product.long_description || '');
    const [price, setPrice] = useState(String(product.price));
    const [weight, setWeight] = useState(product.weight || '');
    const [brandId, setBrandId] = useState(product.brand_id || 'none');
    
    const [selectedCategories, setSelectedCategories] = useState<string[]>(
        product.category
            ? product.category.split('|').map((c) => c.trim()).filter(Boolean)
            : []
    );
    
    const [productType, setProductType] = useState<string[]>(
        product.product_type
            ? product.product_type.split('|').map((t) => t.trim()).filter(Boolean)
            : []
    );

    // Taxonomy reference data state
    const [productTypes, setProductTypes] = useState<{ id: string; name: string }[]>([]);
    const [creatingProductType, setCreatingProductType] = useState(false);
    const [searchKeywords, setSearchKeywords] = useState(product.search_keywords || '');
    const [gtin, setGtin] = useState(product.gtin || '');
    const [sku, setSku] = useState(product.sku || '');
    
    // Inventory & Settings state
    const [availability, setAvailability] = useState(product.availability || 'in stock');
    const [stockStatus, setStockStatus] = useState(product.stock_status || 'in_stock');
    const [minQty, setMinQty] = useState(String(product.minimum_quantity ?? 0));
    const [quantity, setQuantity] = useState(product.quantity !== null && product.quantity !== undefined ? String(product.quantity) : '');
    const [lowStockThreshold, setLowStockThreshold] = useState(product.low_stock_threshold !== null && product.low_stock_threshold !== undefined ? String(product.low_stock_threshold) : '');
    const [isSpecialOrder, setIsSpecialOrder] = useState(product.is_special_order || false);
    const [isTaxable, setIsTaxable] = useState(product.is_taxable ?? true);
    const [publishedAt, setPublishedAt] = useState(product.published_at || '');
    
    const initialPages = Array.isArray(product.product_on_pages) 
        ? product.product_on_pages 
        : typeof product.product_on_pages === 'string' 
            ? product.product_on_pages.split('|').map(p => p.trim()).filter(Boolean)
            : [];
    const [productOnPages, setProductOnPages] = useState<string[]>(initialPages);
    const [selectedPetTypes, setSelectedPetTypes] = useState<ProductPetType[]>([]);

    const shopsitePageOptions = SHOPSITE_PAGES.map(page => ({ id: page, name: page }));

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
        return parsed.map(img => formatImageUrl(img)).filter((img): img is string => Boolean(img));
    };

    const isValidImageUrl = (url: string) => url && (url.startsWith('/') || url.startsWith('http'));
    const images = parseImages(product.images);

    useEffect(() => {
        async function fetchData() {
            try {
                const [brandsRes, petTypesRes, productTypesRes, categoriesRes] = await Promise.all([
                    fetch('/api/admin/brands'),
                    fetch(`/api/admin/products/${product.id}/pet-types`),
                    fetch('/api/admin/product-types'),
                    fetch('/api/admin/categories'),
                ]);
                
                if (brandsRes.ok) {
                    const data = await brandsRes.json();
                    setBrands(data.brands || []);
                }
                if (petTypesRes.ok) {
                    const data = await petTypesRes.json();
                    setSelectedPetTypes(data.petTypes || []);
                }
                if (productTypesRes.ok) {
                    const data = await productTypesRes.json();
                    setProductTypes(data.productTypes || []);
                }
                if (categoriesRes.ok) {
                    const data = await categoriesRes.json();
                    setCategories(data.categories || []);
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

    const handleCreateProductType = async (name: string) => {
        setCreatingProductType(true);
        try {
            const res = await fetch("/api/admin/product-types", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const { productType: newPT } = await res.json();
                setProductTypes((prev) =>
                    [...prev, newPT].sort((a, b) => a.name.localeCompare(b.name)),
                );
                setProductType((prev) => [...prev, newPT.name]);
                toast.success(`Product type "${newPT.name}" created`);
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to create product type");
            }
        } catch {
            toast.error("An error occurred while creating product type");
        } finally {
            setCreatingProductType(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('slug', slug.trim());
            formData.append('sku', sku.trim());
            formData.append('description', description.trim());
            formData.append('long_description', longDescription.trim());
            formData.append('price', price);
            formData.append('weight', weight.trim());
            formData.append('category', selectedCategories.join('|'));
            formData.append('product_type', productType.join('|'));
            formData.append('search_keywords', searchKeywords.trim());
            formData.append('gtin', gtin.trim());
            formData.append('availability', availability.trim());
            formData.append('stock_status', stockStatus);
            formData.append('minimum_quantity', minQty);
            if (quantity) formData.append('quantity', quantity);
            if (lowStockThreshold) formData.append('low_stock_threshold', lowStockThreshold);
            formData.append('is_special_order', String(isSpecialOrder));
            formData.append('is_taxable', String(isTaxable));
            if (publishedAt) formData.append('published_at', publishedAt);
            formData.append('product_on_pages', JSON.stringify(productOnPages));

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
            <DialogContent className="max-w-6xl w-[95vw] h-[90vh] overflow-hidden p-0 flex flex-col">
                <DialogHeader className="p-6 pb-2 shrink-0">
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

                <div className="flex-1 overflow-hidden flex flex-col">
                    {error && (
                        <div className="px-6 pb-2">
                            <Alert variant="destructive">
                                <AlertCircle className="size-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        </div>
                    )}

                    <Tabs defaultValue="general" className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="px-6 border-b shrink-0">
                            <TabsList className="w-full justify-start h-auto bg-transparent p-0 gap-4 overflow-x-auto rounded-none">
                                <TabsTrigger value="general" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-2 py-3 bg-transparent">General</TabsTrigger>
                                <TabsTrigger value="inventory" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-2 py-3 bg-transparent">Inventory & Pricing</TabsTrigger>
                                <TabsTrigger value="taxonomy" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-2 py-3 bg-transparent">Taxonomy</TabsTrigger>
                                <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-2 py-3 bg-transparent">Settings</TabsTrigger>
                                <TabsTrigger value="media" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-2 py-3 bg-transparent">Media</TabsTrigger>
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-6">
                                <TabsContent value="general" className="mt-0 outline-none flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="name">Product Name *</Label>
                                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter product name" />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="slug">Storefront Slug *</Label>
                                            <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="product-url-slug" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="description">Short Description</Label>
                                        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief summary" rows={3} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="longDescription">Long Description</Label>
                                        <Textarea id="longDescription" value={longDescription} onChange={(e) => setLongDescription(e.target.value)} placeholder="Detailed features and information" rows={10} />
                                    </div>
                                </TabsContent>

                                <TabsContent value="inventory" className="mt-0 outline-none grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="price">Price ($) *</Label>
                                        <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="sku">SKU</Label>
                                        <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Stock Keeping Unit" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="quantity">Quantity (Stock)</Label>
                                        <Input id="quantity" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                                        <Input id="lowStockThreshold" type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} placeholder="e.g. 5" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="minQty">Minimum Order Qty</Label>
                                        <Input id="minQty" type="number" min="0" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="0" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="weight">Weight (lb)</Label>
                                        <Input id="weight" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 30" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="gtin">GTIN / UPC</Label>
                                        <Input id="gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="Barcode" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="stockStatus">Stock Status</Label>
                                        <Select value={stockStatus} onValueChange={setStockStatus}>
                                            <SelectTrigger id="stockStatus">
                                                <SelectValue placeholder="Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="in_stock">In Stock</SelectItem>
                                                <SelectItem value="low_stock">Low Stock</SelectItem>
                                                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                                <SelectItem value="pre_order">Pre-order</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </TabsContent>

                                <TabsContent value="taxonomy" className="mt-0 outline-none flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                            <Label htmlFor="category">Category</Label>
                                            <SearchableMultiSelect
                                                options={categories}
                                                selected={selectedCategories}
                                                onChange={setSelectedCategories}
                                                placeholder="Select categories..."
                                                searchPlaceholder="Search categories..."
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="productType">Product Type</Label>
                                            <SearchableMultiSelect
                                                options={productTypes}
                                                selected={productType}
                                                onChange={setProductType}
                                                placeholder="Select product types..."
                                                searchPlaceholder="Search product types..."
                                                onCreate={handleCreateProductType}
                                                creating={creatingProductType}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Label className="text-sm font-medium">Assign to Pages (ShopSite)</Label>
                                            <SearchableMultiSelect
                                                options={shopsitePageOptions}
                                                selected={productOnPages}
                                                onChange={setProductOnPages}
                                                placeholder="Select ShopSite pages..."
                                                searchPlaceholder="Search pages..."
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="keywords">Search Keywords</Label>
                                        <Input id="keywords" value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)} placeholder="comma-separated terms" />
                                    </div>
                                    <div className="pt-2 border-t">
                                        <PetTypeSelector selectedPetTypes={selectedPetTypes} onChange={setSelectedPetTypes} />
                                    </div>
                                </TabsContent>

                                <TabsContent value="settings" className="mt-0 outline-none flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-4 p-4 rounded-lg border bg-muted/30">
                                            <div className="flex items-center gap-3">
                                                <Checkbox id="specialOrder" checked={isSpecialOrder} onCheckedChange={(checked) => setIsSpecialOrder(checked === true)} />
                                                <Label htmlFor="specialOrder" className="cursor-pointer font-medium leading-none">Special Order</Label>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Checkbox id="taxable" checked={isTaxable} onCheckedChange={(checked) => setIsTaxable(checked === true)} />
                                                <Label htmlFor="taxable" className="cursor-pointer font-medium leading-none">Taxable Item</Label>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="availability">Availability Text</Label>
                                            <Input id="availability" value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. Usually ships in 2-3 days" />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <Label htmlFor="publishedAt" className="flex items-center gap-2">
                                            Published At <CalendarIcon className="size-3 text-muted-foreground" />
                                        </Label>
                                        <Input id="publishedAt" type="datetime-local" value={publishedAt ? new Date(publishedAt).toISOString().slice(0, 16) : ''} onChange={(e) => setPublishedAt(e.target.value ? new Date(e.target.value).toISOString() : '')} />
                                    </div>
                                </TabsContent>

                                <TabsContent value="media" className="mt-0 outline-none flex flex-col gap-6">
                                    {images.length > 0 ? (
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-foreground">Current Images</span>
                                                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{images.length} total</span>
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                {images.filter(isValidImageUrl).map((img, idx) => (
                                                    <div key={idx} className="size-20 rounded-md border bg-background overflow-hidden relative">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={img} alt={`Product image ${idx + 1}`} className="h-full w-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 p-3 bg-muted/50 rounded-md border">
                                                <Info className="size-4 shrink-0" />
                                                Image management handles uploads separately. These are display-only previews.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-muted/30">
                                            <Package className="size-8 text-muted-foreground mb-3" />
                                            <p className="text-sm font-medium text-foreground">No images available</p>
                                            <p className="text-xs text-muted-foreground mt-1">Images can be added via the scraper or external system.</p>
                                        </div>
                                    )}
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </Tabs>
                </div>

                <DialogFooter className="shrink-0 flex-col sm:flex-row gap-4 bg-muted/50 p-6 border-t">
                    <div className="flex-1 text-[10px] text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                        <span>Esc to close</span>
                        <span className="text-muted-foreground/30">•</span>
                        <span>Ctrl+S to save</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
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
