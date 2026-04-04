'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import Link from 'next/link';
import Image from 'next/image';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Package, ExternalLink, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { ProductEditModal, PublishedProduct } from './ProductEditModal';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { splitMultiValueFacet } from '@/lib/facets/normalization';
import { formatCurrency, cn, formatImageUrl } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

interface AdminProductsClientProps {
    initialProducts: PublishedProduct[];
    totalCount: number;
    brands: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    productTypes: string[];
}

export function AdminProductsClient({ 
    initialProducts, 
    totalCount, 
    brands,
    categories,
    productTypes
}: AdminProductsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    
    // Sync products with initialProducts prop (which changes on server re-render)
    const products = initialProducts;
    
    const [editingProduct, setEditingProduct] = useState<PublishedProduct | null>(null);
    
    // Search state
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const debouncedSearch = useDebounce(search, 500);

    // Filter states from URL
    const brandFilter = searchParams.get('brand') || 'all';
    const categoryFilter = searchParams.get('category') || 'all';
    const typeFilter = searchParams.get('type') || 'all';
    const stockFilter = searchParams.get('stock') || 'all';
    const featuredFilter = searchParams.get('featured') || 'all';

    // Update URL when filters or search change
    const updateFilters = useCallback((updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === 'all' || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    }, [pathname, router, searchParams]);

    // Handle debounced search update
    useEffect(() => {
        if (debouncedSearch !== (searchParams.get('search') || '')) {
            updateFilters({ search: debouncedSearch });
        }
    }, [debouncedSearch, searchParams, updateFilters]);

    const hasActiveFilters = search !== '' || 
                            brandFilter !== 'all' || 
                            categoryFilter !== 'all' || 
                            typeFilter !== 'all' || 
                            stockFilter !== 'all' || 
                            featuredFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        router.push(pathname);
    };

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

    const isValidImageUrl = (url: string) => {
        return url && (url.startsWith('/') || url.startsWith('http'));
    };

    const handleEdit = (product: PublishedProduct) => {
        setEditingProduct(product);
    };

    const handeCloseModal = () => {
        setEditingProduct(null);
    };

    const handleSave = () => {
        startTransition(() => {
            router.refresh();
        });
    };

    const handleRefresh = () => {
        startTransition(() => {
            router.refresh();
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <Package className="size-6 text-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
                        <p className="text-muted-foreground">
                            {searchParams.get('search') ? `Found ${totalCount} matches` : `${totalCount} published products total`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/admin/data/products">
                            View All Data
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/admin/pipeline">
                            <Plus data-icon="inline-start" />
                            Add via Pipeline
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Toolbar & Filters */}
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search across all products by name or SKU…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10"
                            aria-label="Search all products"
                        />
                        {isPending && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Spinner className="size-4" />
                            </div>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={categoryFilter} onValueChange={(val) => updateFilters({ category: val })}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={typeFilter} onValueChange={(val) => updateFilters({ type: val })}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {productTypes.map(type => (
                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={brandFilter} onValueChange={(val) => updateFilters({ brand: val })}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="All Brands" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Brands</SelectItem>
                                {brands.map(brand => (
                                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={stockFilter} onValueChange={(val) => updateFilters({ stock: val })}>
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Stock Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stock</SelectItem>
                                <SelectItem value="in_stock">In Stock</SelectItem>
                                <SelectItem value="low_stock">Low Stock</SelectItem>
                                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                <SelectItem value="pre_order">Pre-order</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={featuredFilter} onValueChange={(val) => updateFilters({ featured: val })}>
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder="Featured" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any Featured</SelectItem>
                                <SelectItem value="featured">Featured Only</SelectItem>
                                <SelectItem value="not_featured">Not Featured</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button 
                            variant="ghost" 
                            onClick={handleRefresh}
                            disabled={isPending}
                            className="size-9 p-0"
                            title="Refresh data"
                        >
                            <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
                        </Button>

                        {hasActiveFilters && (
                            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-foreground h-9 px-2">
                                <X data-icon="inline-start" className="size-3" />
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center justify-between border-t pt-4">
                    <p className="text-xs text-muted-foreground">
                        {searchParams.get('search') ? (
                            <>Found <span className="font-semibold text-foreground">{totalCount}</span> matching products</>
                        ) : (
                            <>Showing the <span className="font-semibold text-foreground">{products.length}</span> most recent products</>
                        )}
                    </p>
                </div>
            </div>

            {(!products || products.length === 0) ? (
                <EmptyState
                    icon={Package}
                    title={searchParams.get('search') ? "No matches found" : "No published products yet"}
                    description={searchParams.get('search') ? "Try adjusting your search or filters" : "Products flow through the pipeline before being published"}
                    actionLabel={searchParams.get('search') ? "Clear Search" : "Go to Pipeline"}
                    actionHref={searchParams.get('search') ? undefined : "/admin/pipeline"}
                    onAction={searchParams.get('search') ? clearFilters : undefined}
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => {
                        const images = parseImages(product.images);
                        const imageUrl = images[0];

                        return (
                            <Card key={product.id} className="group flex flex-col overflow-hidden transition-all hover:shadow-md">
                                <div className="relative aspect-square overflow-hidden bg-muted">
                                    {imageUrl && isValidImageUrl(imageUrl) ? (
                                        <Image
                                            src={imageUrl}
                                            alt={product.name}
                                            fill
                                            className="object-cover transition-transform group-hover:scale-105"
                                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-muted-foreground">
                                            <Package className="size-12" />
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                                        {product.is_featured && (
                                            <Badge className="bg-yellow-500 hover:bg-yellow-600 border-none text-white shadow-sm">
                                                Featured
                                            </Badge>
                                        )}
                                        <Badge 
                                            variant={
                                                product.stock_status === 'in_stock' ? 'default' : 
                                                product.stock_status === 'out_of_stock' ? 'destructive' : 'secondary'
                                            }
                                            className="shadow-sm"
                                        >
                                            {product.stock_status === 'in_stock' ? 'In Stock' :
                                                product.stock_status === 'out_of_stock' ? 'Out of Stock' : 'Pre-order'}
                                        </Badge>
                                        {product.quantity !== null && product.quantity !== undefined && (
                                            <Badge variant="outline" className="bg-background/80 backdrop-blur-sm shadow-sm self-end">
                                                Qty: {product.quantity}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <CardTitle className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
                                            {product.name}
                                        </CardTitle>
                                    </div>
                                    <div className="flex flex-col gap-0.5 mt-1">
                                        {product.brand_name && (
                                            <p className="text-xs text-muted-foreground font-medium">{product.brand_name}</p>
                                        )}
                                        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{product.sku}</p>
                                    </div>
                                </CardHeader>

                                <CardContent className="flex flex-col gap-4 p-4 mt-auto">
                                    <div className="flex items-center justify-between">
                                        <span className="text-lg font-bold text-foreground">
                                            {formatCurrency(Number(product.price))}
                                        </span>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(product)}>
                                            <Pencil data-icon="inline-start" />
                                            Edit
                                        </Button>
                                        <Button variant="ghost" size="sm" asChild className="size-8 p-0" title="View in Storefront">
                                            <Link href={`/products/${product.slug}`} target="_blank">
                                                <ExternalLink className="size-4" />
                                                <span className="sr-only">View in Storefront</span>
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {totalCount > products.length && !searchParams.get('search') && (
                <div className="flex flex-col items-center gap-3 py-6 border-t border-dashed">
                    <p className="text-sm text-muted-foreground">Only showing the most recent 50 products. Use the search bar to find others.</p>
                </div>
            )}

            {editingProduct && (
                <ProductEditModal
                    product={editingProduct}
                    onClose={handeCloseModal}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
