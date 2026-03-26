'use client';

import { Save, Package, AlertCircle, Info } from 'lucide-react';
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
    const [category, setCategory] = useState(product.category || '');
    const [productType, setProductType] = useState(product.product_type || '');
    const [searchKeywords, setSearchKeywords] = useState(product.search_keywords || '');
    const [gtin, setGtin] = useState(product.gtin || '');
    const [availability, setAvailability] = useState(product.availability || 'in stock');
    const [minQty, setMinQty] = useState(String(product.minimum_quantity || '0'));
    const [isSpecialOrder, setIsSpecialOrder] = useState(product.is_special_order || false);
    const [isTaxable, setIsTaxable] = useState(product.is_taxable ?? true);
    
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

    const togglePage = (page: string) => {
        setProductOnPages(prev => 
            prev.includes(page) 
                ? prev.filter(p => p !== page) 
                : [...prev, page]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('slug', slug.trim());
            formData.append('description', description.trim());
            formData.append('long_description', longDescription.trim());
            formData.append('price', price);
            formData.append('weight', weight.trim());
            formData.append('category', category.trim());
            formData.append('product_type', productType.trim());
            formData.append('search_keywords', searchKeywords.trim());
            formData.append('gtin', gtin.trim());
            formData.append('availability', availability.trim());
            formData.append('minimum_quantity', minQty);
            formData.append('is_special_order', String(isSpecialOrder));
            formData.append('is_taxable', String(isTaxable));
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
            <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                            <Package className="size-6 text-muted-foreground" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Edit Published Product</DialogTitle>
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
                    <div className="grid gap-8 lg:grid-cols-2">
                        {/* Left Column: Core Fields */}
                        <div className="space-y-6">
                            <div className="space-y-4 rounded-xl border bg-card p-5">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Core Information</h3>
                                
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
                                    <Label htmlFor="slug">Storefront Slug *</Label>
                                    <Input
                                        id="slug"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder="product-url-slug"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
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
                                        <Label htmlFor="weight">Weight (lb)</Label>
                                        <Input
                                            id="weight"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                            placeholder="e.g. 30"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
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

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="gtin">GTIN / UPC</Label>
                                        <Input
                                            id="gtin"
                                            value={gtin}
                                            onChange={(e) => setGtin(e.target.value)}
                                            placeholder="Barcode"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="minQty">Min. Quantity</Label>
                                        <Input
                                            id="minQty"
                                            type="number"
                                            min="0"
                                            value={minQty}
                                            onChange={(e) => setMinQty(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 rounded-xl border bg-card p-5">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Taxonomy & Meta</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="category">Category</Label>
                                        <Input
                                            id="category"
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            placeholder="e.g. Dog Food"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="productType">Product Type</Label>
                                        <Input
                                            id="productType"
                                            value={productType}
                                            onChange={(e) => setProductType(e.target.value)}
                                            placeholder="e.g. Kibble"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="keywords">Search Keywords</Label>
                                    <Input
                                        id="keywords"
                                        value={searchKeywords}
                                        onChange={(e) => setSearchKeywords(e.target.value)}
                                        placeholder="comma-separated terms"
                                    />
                                </div>
                                
                                <div className="flex gap-6 pt-2">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="specialOrder"
                                            checked={isSpecialOrder}
                                            onCheckedChange={(checked) => setIsSpecialOrder(checked === true)}
                                        />
                                        <Label htmlFor="specialOrder" className="cursor-pointer text-sm">
                                            Special Order
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="taxable"
                                            checked={isTaxable}
                                            onCheckedChange={(checked) => setIsTaxable(checked === true)}
                                        />
                                        <Label htmlFor="taxable" className="cursor-pointer text-sm">
                                            Taxable
                                        </Label>
                                    </div>
                                </div>

                                <div className="pt-4 border-t">
                                    <PetTypeSelector
                                        selectedPetTypes={selectedPetTypes}
                                        onChange={setSelectedPetTypes}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Descriptions & Images */}
                        <div className="space-y-6">
                            <div className="space-y-4 rounded-xl border bg-card p-5">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">ShopSite Display</h3>
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Assign to Pages</Label>
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
                                
                                <div className="space-y-2">
                                    <Label htmlFor="description">Short Description</Label>
                                    <Textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Brief summary"
                                        rows={3}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="longDescription">Long Description</Label>
                                    <Textarea
                                        id="longDescription"
                                        value={longDescription}
                                        onChange={(e) => setLongDescription(e.target.value)}
                                        placeholder="Detailed features and information"
                                        rows={8}
                                    />
                                </div>
                            </div>

                            {/* Images Preview - Read Only for now */}
                            {images.length > 0 && (
                                <div className="space-y-4 rounded-xl border bg-card p-5">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Product Images</h3>
                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                            {images.length} total
                                        </span>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        {images
                                            .filter(isValidImageUrl)
                                            .slice(0, 8)
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
                                        {images.length > 8 && (
                                            <div className="flex size-16 items-center justify-center rounded-md border bg-muted text-xs font-medium">
                                                +{images.length - 8}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                                        <Info className="h-3 w-3" />
                                        Image management coming soon
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-4 bg-muted/50 p-6">
                    <div className="flex-1 text-[10px] text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                        <span className="flex items-center gap-1">
                            Esc to close
                        </span>
                        <span className="text-muted-foreground/30">•</span>
                        <span className="flex items-center gap-1">
                            Ctrl+S to save
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
