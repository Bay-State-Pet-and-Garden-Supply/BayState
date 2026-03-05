'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Package, ExternalLink, Pencil, RefreshCw, Search } from 'lucide-react';
import { ProductEditModal, PublishedProduct } from './ProductEditModal';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';

interface AdminProductsClientProps {
    initialProducts: PublishedProduct[];
    totalCount: number;
}

export function AdminProductsClient({ initialProducts, totalCount }: AdminProductsClientProps) {
    const router = useRouter();
    const [products] = useState<PublishedProduct[]>(initialProducts);
    const [editingProduct, setEditingProduct] = useState<PublishedProduct | null>(null);
    const [search, setSearch] = useState('');

    // NOTE: Simple client-side search for now as the initial load is limited to 50
    // ideally this should be server-side search if the list grows large.
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase())
    );

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

    const handleEdit = (product: PublishedProduct) => {
        setEditingProduct(product);
    };

    const handeCloseModal = () => {
        setEditingProduct(null);
    };

    const handleSave = () => {
        // Refresh the page to get updated data from server
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Package className="h-8 w-8 text-indigo-600" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
                        <p className="text-muted-foreground">{totalCount} published products</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/admin/data/products">
                            View All Data
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/admin/pipeline">
                            <Plus className="mr-2 h-4 w-4" /> Add via Pipeline
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                        type="text"
                        placeholder="Search loaded products..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                    />
                </div>
                <Button variant="outline" onClick={() => router.refresh()}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </Button>
            </div>

            {(!products || products.length === 0) ? (
                <EmptyState
                    icon={Package}
                    title="No published products yet"
                    description="Products flow through the pipeline before being published"
                    actionLabel="Go to Pipeline"
                    actionHref="/admin/pipeline"
                />
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                        const images = parseImages(product.images);
                        const imageUrl = images[0];
                        const stockColor = product.stock_status === 'in_stock'
                            ? 'bg-green-100 text-green-700'
                            : product.stock_status === 'out_of_stock'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700';

                        return (
                            <Card key={product.id} className="overflow-hidden flex flex-col">
                                {/* Product Image */}
                                <div className="relative aspect-square bg-gray-100">
                                    {imageUrl ? (
                                        <Image
                                            src={imageUrl}
                                            alt={product.name}
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-gray-600">
                                            <Package className="h-12 w-12" />
                                        </div>
                                    )}
                                    {product.is_featured && (
                                        <Badge className="absolute top-2 right-2 bg-yellow-500 hover:bg-yellow-600 border-none text-white">
                                            Featured
                                        </Badge>
                                    )}
                                </div>

                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <CardTitle className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">
                                            {product.name}
                                        </CardTitle>
                                    </div>
                                    {product.brand_name && (
                                        <p className="text-xs text-muted-foreground">{product.brand_name}</p>
                                    )}
                                    <p className="text-xs text-gray-600 font-mono">{product.sku}</p>
                                </CardHeader>

                                <CardContent className="space-y-3 mt-auto">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xl font-bold text-green-600">
                                            {formatCurrency(Number(product.price))}
                                        </span>
                                        <Badge className={stockColor + " border-none"}>
                                            {product.stock_status === 'in_stock' ? 'In Stock' :
                                                product.stock_status === 'out_of_stock' ? 'Out of Stock' : 'Pre-order'}
                                        </Badge>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(product)}>
                                            <Pencil className="mr-1 h-3 w-3" /> Edit
                                        </Button>
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={`/products/${product.slug}`} target="_blank">
                                                <ExternalLink className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {products && products.length >= 50 && (
                <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Only showing the most recent 50 products. Use Data Explorer to see all.</p>
                    <Button variant="outline" asChild>
                        <Link href="/admin/data/products">View All Products in Data Explorer</Link>
                    </Button>
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
