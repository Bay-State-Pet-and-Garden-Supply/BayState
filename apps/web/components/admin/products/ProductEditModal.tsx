'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Package, AlertCircle, Info, LayoutTemplate, Tag, Settings2, Image as ImageIcon, Box, ListTree, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { PetTypeSelector } from './PetTypeSelector';
import { updateProduct, bulkUpdateProducts } from '@/app/admin/products/actions';
import { cn, formatImageUrl } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface Brand {
    id: string;
    name: string;
    slug: string;
}

interface Category {
    id: string;
    name: string;
    breadcrumb?: string;
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
    products: PublishedProduct[];
    onClose: () => void;
    onSave: () => void;
}

export function ProductEditModal({
    products,
    onClose,
    onSave,
}: ProductEditModalProps) {
    const isBulkEdit = products.length > 1;
    const singleProduct = !isBulkEdit ? products[0] : null;

    const [brands, setBrands] = useState<Brand[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const handleSaveRef = useRef<() => void>(() => undefined);

    // Helpers for bulk state initialization
    const getSharedValue = useCallback(<T extends keyof PublishedProduct>(key: T): PublishedProduct[T] | null => {
        if (products.length === 0) return null;
        const firstVal = products[0][key];
        for (let i = 1; i < products.length; i++) {
            if (JSON.stringify(products[i][key]) !== JSON.stringify(firstVal)) {
                return null;
            }
        }
        return firstVal;
    }, [products]);

    // Unique Fields (Disabled in bulk edit)
    const [name, setName] = useState(singleProduct?.name || '');
    const [slug, setSlug] = useState(singleProduct?.slug || '');
    const [sku, setSku] = useState(singleProduct?.sku || '');
    const [description, setDescription] = useState(singleProduct?.description || '');
    const [longDescription, setLongDescription] = useState(singleProduct?.long_description || '');
    const [price, setPrice] = useState(singleProduct ? String(singleProduct.price) : '');
    const [weight, setWeight] = useState(singleProduct?.weight || '');
    const [gtin, setGtin] = useState(singleProduct?.gtin || '');
    const [quantity, setQuantity] = useState(singleProduct?.quantity !== null && singleProduct?.quantity !== undefined ? String(singleProduct.quantity) : '');
    const [lowStockThreshold, setLowStockThreshold] = useState(singleProduct?.low_stock_threshold !== null && singleProduct?.low_stock_threshold !== undefined ? String(singleProduct.low_stock_threshold) : '');
    const [minQty, setMinQty] = useState(singleProduct ? String(singleProduct.minimum_quantity ?? 0) : '');

    // Classification Fields (Editable in bulk edit)
    const sharedBrand = getSharedValue('brand_id');
    const [brandId, setBrandId] = useState<string>(sharedBrand as string || 'mixed'); // 'mixed' is our sentinel for differing values

    const sharedCategoryIds = getSharedValue('category_ids');
    const [selectedCategories, setSelectedCategories] = useState<string[]>(
        Array.isArray(sharedCategoryIds) ? sharedCategoryIds : []
    );

    const sharedKeywords = getSharedValue('search_keywords');
    const [searchKeywords, setSearchKeywords] = useState(sharedKeywords as string || '');

    const sharedStockStatus = getSharedValue('stock_status');
    const [stockStatus, setStockStatus] = useState((sharedStockStatus as string) || 'mixed');

    const sharedAvailability = getSharedValue('availability');
    const [availability, setAvailability] = useState((sharedAvailability as string) || '');

    const sharedSpecialOrder = getSharedValue('is_special_order');
    const [isSpecialOrder, setIsSpecialOrder] = useState<boolean | 'mixed'>(sharedSpecialOrder !== null ? (sharedSpecialOrder as boolean) : 'mixed');

    const sharedTaxable = getSharedValue('is_taxable');
    const [isTaxable, setIsTaxable] = useState<boolean | 'mixed'>(sharedTaxable !== null ? (sharedTaxable as boolean) : 'mixed');

    const sharedPublishedAt = getSharedValue('published_at');
    const [publishedAt, setPublishedAt] = useState((sharedPublishedAt as string) || '');

    const sharedPages = getSharedValue('product_on_pages');
    const initialPages = Array.isArray(sharedPages) 
        ? sharedPages 
        : typeof sharedPages === 'string' 
            ? sharedPages.split('|').map(p => p.trim()).filter(Boolean)
            : [];
    const [productOnPages, setProductOnPages] = useState<string[]>(initialPages);

    const [selectedPetTypes, setSelectedPetTypes] = useState<ProductPetType[]>([]);
    const [petTypesLoaded, setPetTypesLoaded] = useState(false); // Track if we loaded common pet types

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
        }
        return parsed.map(img => formatImageUrl(img)).filter((img): img is string => Boolean(img));
    };

    const isValidImageUrl = (url: string) => url && (url.startsWith('/') || url.startsWith('http'));
    
    // Only show images for single edit mode
    const images = singleProduct ? parseImages(singleProduct.images) : [];

    useEffect(() => {
        async function fetchData() {
            try {
                const requests = [
                    fetch('/api/admin/brands'),
                    fetch('/api/admin/categories'),
                ];

                // If single product, fetch its specific pet types
                if (!isBulkEdit && singleProduct) {
                    requests.push(fetch(`/api/admin/products/${singleProduct.id}/pet-types`));
                }

                const responses = await Promise.all(requests);
                
                if (responses[0].ok) {
                    const data = await responses[0].json();
                    setBrands(data.brands || []);
                }
                if (responses[1].ok) {
                    const data = await responses[1].json();
                    setCategories(
                        (data.categories || []).map((category: Category) => ({
                            ...category,
                            name: category.breadcrumb || category.name,
                        }))
                    );
                }
                
                if (!isBulkEdit && responses[2] && responses[2].ok) {
                    const data = await responses[2].json();
                    setSelectedPetTypes(data.petTypes || []);
                    setPetTypesLoaded(true);
                } else if (isBulkEdit) {
                    setPetTypesLoaded(true);
                }
            } catch (err) {
                console.error('Failed to load data', err);
                toast.error("Failed to load reference data");
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [isBulkEdit, singleProduct]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSaveRef.current();
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
            
            if (brandId !== 'mixed') {
                formData.append('brand_id', brandId === 'none' ? '' : brandId);
            }
            
            formData.append('category_ids', JSON.stringify(selectedCategories));
            formData.append('product_on_pages', JSON.stringify(productOnPages));
            formData.append('search_keywords', searchKeywords.trim());
            
            if (stockStatus !== 'mixed') formData.append('stock_status', stockStatus);
            if (availability !== 'mixed') formData.append('availability', availability.trim());
            if (isSpecialOrder !== 'mixed') formData.append('is_special_order', String(isSpecialOrder));
            if (isTaxable !== 'mixed') formData.append('is_taxable', String(isTaxable));
            if (publishedAt !== 'mixed') formData.append('published_at', publishedAt);

            // Append unique fields ONLY if single edit
            if (!isBulkEdit && singleProduct) {
                formData.append('name', name.trim());
                formData.append('slug', slug.trim());
                formData.append('sku', sku.trim());
                formData.append('description', description.trim());
                formData.append('long_description', longDescription.trim());
                formData.append('price', price);
                formData.append('weight', weight.trim());
                formData.append('gtin', gtin.trim());
                formData.append('minimum_quantity', minQty);
                if (quantity) formData.append('quantity', quantity);
                if (lowStockThreshold) formData.append('low_stock_threshold', lowStockThreshold);
            }

            if (isBulkEdit) {
                const ids = products.map(p => p.id);
                formData.append('pet_types', JSON.stringify(selectedPetTypes));
                
                const result = await bulkUpdateProducts(ids, formData);
                if (!result.success) throw new Error(result.error || 'Failed to bulk update products');
                toast.success(`Successfully updated ${products.length} products`);
            } else if (singleProduct) {
                const [productResult, petTypesRes] = await Promise.all([
                    updateProduct(singleProduct.id, formData),
                    fetch(`/api/admin/products/${singleProduct.id}/pet-types`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ petTypes: selectedPetTypes }),
                    }),
                ]);

                if (!productResult.success) throw new Error(productResult.error || 'Failed to update product');
                if (!petTypesRes.ok) throw new Error('Failed to update pet types');
                toast.success('Product updated successfully');
            }

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

    handleSaveRef.current = handleSave;

    if (loading) return null;

    const placeholderText = isBulkEdit ? "— Multiple Values —" : "";

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] h-[90vh] overflow-hidden p-0 flex flex-col gap-0 bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
                <DialogHeader className="p-6 border-b shrink-0 bg-muted/20">
                    <div className="flex items-center gap-4">
                        <div className={cn("flex size-12 items-center justify-center rounded-xl shadow-sm", isBulkEdit ? "bg-primary/20 text-primary" : "bg-primary text-primary-foreground")}>
                            {isBulkEdit ? <ListTree className="size-6" /> : <Package className="size-6" />}
                        </div>
                        <div className="flex flex-col gap-1">
                            <DialogTitle className="text-2xl font-bold tracking-tight">
                                {isBulkEdit ? "Editing " + products.length + " Products" : 'Edit Product'}
                            </DialogTitle>
                            <p className="text-sm text-muted-foreground font-medium">
                                {isBulkEdit ? "Bulk updating classification facets." : singleProduct?.sku}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                {error && (
                    <div className="px-6 pt-4 shrink-0">
                        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="size-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    </div>
                )}

                {isBulkEdit && (
                    <div className="px-6 pt-4 shrink-0">
                        <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400">
                            <Info className="size-4 text-blue-600 dark:text-blue-400" />
                            <AlertTitle className="font-semibold">Bulk Edit Mode Active</AlertTitle>
                            <AlertDescription>
                                You are editing <strong>{products.length}</strong> products simultaneously. Unique fields like Name, Price, and Description are disabled to prevent accidental overwriting. Changes to Categories, Brands, and other classification fields will apply to <strong>all selected products</strong>.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                <Tabs defaultValue="general" orientation="vertical" className="flex-1 overflow-hidden w-full">
                    <TabsList className="w-64 border-r shrink-0 flex flex-col h-full justify-start items-stretch bg-muted/10 p-4 gap-1 rounded-none">
                        <TabsTrigger value="general" className="justify-start gap-3 py-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg text-muted-foreground transition-all">
                            <LayoutTemplate className="size-4" />
                            General
                        </TabsTrigger>
                        <TabsTrigger value="inventory" className="justify-start gap-3 py-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg text-muted-foreground transition-all">
                            <Box className="size-4" />
                            Inventory & Pricing
                        </TabsTrigger>
                        <TabsTrigger value="taxonomy" className="justify-start gap-3 py-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg text-muted-foreground transition-all">
                            <Tag className="size-4" />
                            Taxonomy
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="justify-start gap-3 py-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg text-muted-foreground transition-all">
                            <Settings2 className="size-4" />
                            Settings
                        </TabsTrigger>
                        {!isBulkEdit && (
                            <TabsTrigger value="media" className="justify-start gap-3 py-2.5 px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg text-muted-foreground transition-all">
                                <ImageIcon className="size-4" />
                                Media
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <ScrollArea className="flex-1 min-w-0 bg-muted/5">
                        <div className="p-8 max-w-4xl mx-auto">
                            <TabsContent value="general" className="mt-0 outline-none flex flex-col gap-8 animate-in fade-in duration-300">
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                                    <Card className="border-border/50 shadow-sm">
                                        <CardContent className="p-6 grid gap-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="flex flex-col gap-2.5">
                                                    <Label htmlFor="name" className="text-foreground/80">Product Name <span className="text-destructive">*</span></Label>
                                                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "Enter product name"} className={cn(isBulkEdit && "opacity-50")} />
                                                </div>
                                                <div className="flex flex-col gap-2.5">
                                                    <Label htmlFor="slug" className="text-foreground/80">Storefront Slug <span className="text-destructive">*</span></Label>
                                                    <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "product-url-slug"} className={cn(isBulkEdit && "opacity-50")} />
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="description" className="text-foreground/80">Short Description</Label>
                                                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "Brief summary"} rows={3} className={cn("resize-none", isBulkEdit && "opacity-50")} />
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="longDescription" className="text-foreground/80">Long Description</Label>
                                                <Textarea id="longDescription" value={longDescription} onChange={(e) => setLongDescription(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "Detailed features and information"} rows={6} className={cn(isBulkEdit && "opacity-50")} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>

                            <TabsContent value="inventory" className="mt-0 outline-none flex flex-col gap-8 animate-in fade-in duration-300">
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Pricing & Stock</h3>
                                    <Card className="border-border/50 shadow-sm">
                                        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="price" className="text-foreground/80">Price ($) <span className="text-destructive">*</span></Label>
                                                <Input id="price" type={isBulkEdit ? "text" : "number"} step="0.01" min="0" value={isBulkEdit ? "" : price} onChange={(e) => setPrice(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "0.00"} className={cn("font-mono", isBulkEdit && "opacity-50")} />
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="sku" className="text-foreground/80">SKU</Label>
                                                <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "Stock Keeping Unit"} className={cn("font-mono", isBulkEdit && "opacity-50")} />
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="quantity" className="text-foreground/80">Quantity (Stock)</Label>
                                                <Input id="quantity" type={isBulkEdit ? "text" : "number"} min="0" value={isBulkEdit ? "" : quantity} onChange={(e) => setQuantity(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "e.g. 50"} className={cn(isBulkEdit && "opacity-50")} />
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="stockStatus" className="text-foreground/80">Stock Status</Label>
                                                <Select value={stockStatus} onValueChange={setStockStatus}>
                                                    <SelectTrigger id="stockStatus">
                                                        <SelectValue placeholder="Status" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {isBulkEdit && <SelectItem value="mixed" className="text-muted-foreground italic">Mixed Values (Leave Unchanged)</SelectItem>}
                                                        <SelectItem value="in_stock">In Stock</SelectItem>
                                                        <SelectItem value="low_stock">Low Stock</SelectItem>
                                                        <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                                        <SelectItem value="pre_order">Pre-order</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="lowStockThreshold" className="text-foreground/80">Low Stock Threshold</Label>
                                                <Input id="lowStockThreshold" type={isBulkEdit ? "text" : "number"} min="0" value={isBulkEdit ? "" : lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "e.g. 5"} className={cn(isBulkEdit && "opacity-50")} />
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="minQty" className="text-foreground/80">Minimum Order Qty</Label>
                                                <Input id="minQty" type={isBulkEdit ? "text" : "number"} min="0" value={isBulkEdit ? "" : minQty} onChange={(e) => setMinQty(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "0"} className={cn(isBulkEdit && "opacity-50")} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                                
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Shipping Identifiers</h3>
                                    <Card className="border-border/50 shadow-sm">
                                        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="weight" className="text-foreground/80">Weight (lb)</Label>
                                                <Input id="weight" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "e.g. 30"} className={cn(isBulkEdit && "opacity-50")} />
                                            </div>
                                            <div className="flex flex-col gap-2.5">
                                                <Label htmlFor="gtin" className="text-foreground/80">GTIN / UPC</Label>
                                                <Input id="gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} disabled={isBulkEdit} placeholder={placeholderText || "Barcode"} className={cn("font-mono", isBulkEdit && "opacity-50")} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>

                            <TabsContent value="taxonomy" className="mt-0 outline-none flex flex-col gap-8 animate-in fade-in duration-300">
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Classification</h3>
                                    <Card className="border-border/50 shadow-sm">
                                        <CardContent className="p-6 grid gap-8">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="flex flex-col gap-2.5">
                                                    <Label htmlFor="brand" className="text-foreground/80">Brand</Label>
                                                    <Select value={brandId} onValueChange={setBrandId}>
                                                        <SelectTrigger id="brand" className={cn(brandId === 'mixed' && "text-muted-foreground italic")}>
                                                            <SelectValue placeholder="Select a brand" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {isBulkEdit && <SelectItem value="mixed" className="italic">Mixed Values (Leave Unchanged)</SelectItem>}
                                                            <SelectItem value="none">No brand</SelectItem>
                                                            {brands.map((brand) => (
                                                                <SelectItem key={brand.id} value={brand.id}>
                                                                    {brand.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex flex-col gap-2.5">
                                                    <Label htmlFor="category" className="text-foreground/80">Categories</Label>
                                                    <SearchableMultiSelect
                                                        options={categories}
                                                        selected={selectedCategories}
                                                        onChange={setSelectedCategories}
                                                        placeholder={isBulkEdit && selectedCategories.length === 0 ? "Mixed Values (Select to overwrite)" : "Select categories..."}
                                                        searchPlaceholder="Search categories..."
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="flex flex-col gap-2.5">
                                                    <Label className="text-sm font-medium text-foreground/80">Assign to Pages (ShopSite)</Label>
                                                    <SearchableMultiSelect
                                                        options={shopsitePageOptions}
                                                        selected={productOnPages}
                                                        onChange={setProductOnPages}
                                                        placeholder={isBulkEdit && !sharedPages ? "Mixed Values (Select to overwrite)" : "Select ShopSite pages..."}
                                                        searchPlaceholder="Search pages..."
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2.5">
                                                    <Label htmlFor="keywords" className="text-foreground/80">Search Keywords</Label>
                                                    <Input id="keywords" value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)} placeholder="comma-separated terms" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                                
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Pet Matching</h3>
                                    <Card className="border-border/50 shadow-sm overflow-hidden">
                                        <div className="p-6 bg-muted/10 border-b">
                                            {isBulkEdit && !petTypesLoaded ? (
                                                <p className="text-sm text-muted-foreground italic">Pet types will remain unchanged unless you modify them.</p>
                                            ) : null}
                                            <PetTypeSelector selectedPetTypes={selectedPetTypes} onChange={setSelectedPetTypes} />
                                        </div>
                                    </Card>
                                </div>
                            </TabsContent>

                            <TabsContent value="settings" className="mt-0 outline-none flex flex-col gap-8 animate-in fade-in duration-300">
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Storefront Behavior</h3>
                                    <Card className="border-border/50 shadow-sm">
                                        <CardContent className="p-6 grid gap-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="flex flex-col gap-4 p-5 rounded-xl border border-border/50 bg-muted/20">
                                                    <div className="flex items-center gap-3">
                                                        <Checkbox 
                                                            id="specialOrder" 
                                                            checked={isSpecialOrder === 'mixed' ? false : isSpecialOrder} 
                                                            className={cn(isSpecialOrder === 'mixed' && "opacity-50")}
                                                            onCheckedChange={(checked) => setIsSpecialOrder(checked === true)} 
                                                        />
                                                        <Label htmlFor="specialOrder" className="cursor-pointer font-medium leading-none">
                                                            Special Order Item
                                                            {isSpecialOrder === 'mixed' && <span className="ml-2 text-xs font-normal text-muted-foreground">(Mixed values - click to set for all)</span>}
                                                        </Label>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Checkbox 
                                                            id="taxable" 
                                                            checked={isTaxable === 'mixed' ? false : isTaxable} 
                                                            className={cn(isTaxable === 'mixed' && "opacity-50")}
                                                            onCheckedChange={(checked) => setIsTaxable(checked === true)} 
                                                        />
                                                        <Label htmlFor="taxable" className="cursor-pointer font-medium leading-none">
                                                            Taxable Item
                                                            {isTaxable === 'mixed' && <span className="ml-2 text-xs font-normal text-muted-foreground">(Mixed values - click to set for all)</span>}
                                                        </Label>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col gap-4">
                                                    <div className="flex flex-col gap-2.5">
                                                        <Label htmlFor="availability" className="text-foreground/80">Availability Text</Label>
                                                        <Input id="availability" value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder={isBulkEdit && sharedAvailability === null ? "Mixed Values (Leave Unchanged)" : "e.g. Usually ships in 2-3 days"} />
                                                    </div>
                                                    <div className="flex flex-col gap-2.5">
                                                        <Label htmlFor="publishedAt" className="flex items-center gap-2 text-foreground/80">
                                                            Published At <CalendarIcon className="size-3.5 text-muted-foreground" />
                                                        </Label>
                                                        <Input 
                                                            id="publishedAt" 
                                                            type="datetime-local" 
                                                            value={publishedAt ? new Date(publishedAt).toISOString().slice(0, 16) : ''} 
                                                            onChange={(e) => setPublishedAt(e.target.value ? new Date(e.target.value).toISOString() : '')} 
                                                        />
                                                        {isBulkEdit && sharedPublishedAt === null && <p className="text-xs text-muted-foreground italic">Mixed dates. Pick one to overwrite all.</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>

                            {!isBulkEdit && (
                                <TabsContent value="media" className="mt-0 outline-none flex flex-col gap-8 animate-in fade-in duration-300">
                                    <div>
                                        <h3 className="text-lg font-semibold mb-4">Images</h3>
                                        <Card className="border-border/50 shadow-sm">
                                            <CardContent className="p-6">
                                                {images.length > 0 ? (
                                                    <div className="flex flex-col gap-6">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-medium text-foreground/80">Current Gallery</span>
                                                            <span className="text-xs font-semibold tracking-wide text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">{images.length} item{images.length > 1 && 's'}</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                            {images.filter(isValidImageUrl).map((img, idx) => (
                                                                <div key={img} className="aspect-square rounded-xl border border-border/50 bg-muted/20 overflow-hidden relative group">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={img} alt={"Product image " + (idx + 1)} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <Alert className="bg-muted/30 border-border/50">
                                                            <Info className="size-4" />
                                                            <AlertDescription className="text-muted-foreground">
                                                                Image management is handled via the scraper or external systems. These previews are read-only.
                                                            </AlertDescription>
                                                        </Alert>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border/50 rounded-xl bg-muted/10">
                                                        <div className="flex size-16 items-center justify-center rounded-full bg-muted/50 mb-4">
                                                            <ImageIcon className="size-8 text-muted-foreground/50" />
                                                        </div>
                                                        <p className="text-base font-semibold text-foreground">No images available</p>
                                                        <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">Images are synced from upstream providers and cannot be uploaded directly here.</p>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>
                            )}
                        </div>
                    </ScrollArea>
                </Tabs>

                <DialogFooter className="shrink-0 flex-col sm:flex-row items-center justify-between gap-4 bg-muted/10 p-6 border-t backdrop-blur-md">
                    <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground/70">
                        <kbd className="px-2 py-1 bg-muted rounded border shadow-sm text-muted-foreground">ESC</kbd> <span>Close</span>
                        <span className="mx-2 opacity-30">•</span>
                        <kbd className="px-2 py-1 bg-muted rounded border shadow-sm text-muted-foreground">⌘ S</kbd> <span>Save</span>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">Cancel</Button>
                        <Button onClick={handleSave} disabled={saving} className="min-w-[140px] flex-1 sm:flex-none shadow-md">
                            {saving ? (
                                <>
                                    <Spinner className="mr-2 size-4" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 size-4" />
                                    {isBulkEdit ? "Update " + products.length + " Products" : 'Save Changes'}
                                </>
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
