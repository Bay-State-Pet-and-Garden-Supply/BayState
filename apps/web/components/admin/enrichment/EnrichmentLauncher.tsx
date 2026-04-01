'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Product {
    sku: string;
    name: string;
    brand: string;
    status: string;
    last_enriched_at?: string;
    pipeline_status?: string;
    input?: {
        name?: string;
        brand?: string;
    };
    consolidated?: {
        name?: string;
        brand?: string;
    };
}

interface EnrichmentLauncherProps {
    onNext: (selectedSkus: string[]) => void;
}

export function EnrichmentLauncher({ onNext }: EnrichmentLauncherProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

    const [brandFilter, setBrandFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [needsEnrichment, setNeedsEnrichment] = useState(false);

    useEffect(() => {
        async function fetchProducts() {
            try {
                setIsLoading(true);
                setError(null);
                const res = await fetch('/api/admin/pipeline?status=staging&limit=1000');
                if (!res.ok) {
                    throw new Error('Failed to fetch products');
                }
                const data = await res.json();
                setProducts(data.products || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchProducts();
    }, []);

    const brands = useMemo(() => {
        const uniqueBrands = new Set<string>();
        products.forEach(p => {
            const brand = p.consolidated?.brand || p.input?.brand || p.brand;
            if (brand) uniqueBrands.add(brand);
        });
        return Array.from(uniqueBrands).sort();
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const brand = p.consolidated?.brand || p.input?.brand || p.brand || 'Unknown';
            if (brandFilter !== 'all' && brand !== brandFilter) return false;
            
            const status = p.pipeline_status || p.status || 'staging';
            if (statusFilter !== 'all' && status !== statusFilter) return false;

            if (needsEnrichment) {
                if (p.last_enriched_at) return false;
            }

            return true;
        });
    }, [products, brandFilter, statusFilter, needsEnrichment]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedSkus(new Set(filteredProducts.map(p => p.sku)));
        } else {
            setSelectedSkus(new Set());
        }
    };

    const handleSelectRow = (sku: string, checked: boolean) => {
        const newSelected = new Set(selectedSkus);
        if (checked) {
            newSelected.add(sku);
        } else {
            newSelected.delete(sku);
        }
        setSelectedSkus(newSelected);
    };

    const handleNext = () => {
        onNext(Array.from(selectedSkus));
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p>Loading products...</p>
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error loading products</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end justify-between border-b pb-4">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="space-y-1.5 min-w-[150px]">
                        <label className="text-sm font-medium text-muted-foreground">Brand</label>
                        <Select value={brandFilter} onValueChange={setBrandFilter}>
                            <SelectTrigger data-testid="brand-filter">
                                <SelectValue placeholder="All Brands" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Brands</SelectItem>
                                {brands.map(brand => (
                                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 min-w-[150px]">
                        <label className="text-sm font-medium text-muted-foreground">Status</label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger data-testid="status-filter">
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="staging">Staging</SelectItem>
                                <SelectItem value="scraped">Scraped</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-2 pt-6">
                        <Checkbox 
                            id="needs-enrichment" 
                            checked={needsEnrichment}
                            onCheckedChange={(checked) => setNeedsEnrichment(checked as boolean)}
                            data-testid="needs-enrichment-toggle"
                        />
                        <label 
                            htmlFor="needs-enrichment" 
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                            Needs enrichment
                        </label>
                    </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                    <div className="text-sm text-muted-foreground font-medium" data-testid="selected-count">
                        {selectedSkus.size} selected
                    </div>
                    <Button 
                        onClick={handleNext} 
                        disabled={selectedSkus.size === 0}
                        data-testid="enrichment-next-button"
                        className="bg-primary hover:bg-primary/80 text-white font-medium"
                    >
                        Next Step
                    </Button>
                </div>
            </div>

            <div className="rounded-md border bg-card overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted">
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox 
                                    checked={filteredProducts.length > 0 && selectedSkus.size === filteredProducts.length}
                                    onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                                    aria-label="Select all"
                                />
                            </TableHead>
                            <TableHead className="w-[120px] font-semibold text-foreground">SKU</TableHead>
                            <TableHead className="font-semibold text-foreground">Name</TableHead>
                            <TableHead className="w-[150px] font-semibold text-foreground">Brand</TableHead>
                            <TableHead className="w-[120px] font-semibold text-foreground">Status</TableHead>
                            <TableHead className="w-[150px] font-semibold text-foreground text-right">Last Enriched</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredProducts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No products found matching filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredProducts.map((product) => {
                                const name = product.consolidated?.name || product.input?.name || product.name || 'Unknown';
                                const brand = product.consolidated?.brand || product.input?.brand || product.brand || 'Unknown';
                                const status = product.pipeline_status || product.status || 'staging';
                                
                                return (
                                    <TableRow 
                                        key={product.sku}
                                        className="hover:bg-muted transition-colors"
                                    >
                                        <TableCell>
                                            <Checkbox 
                                                checked={selectedSkus.has(product.sku)}
                                                onCheckedChange={(checked) => handleSelectRow(product.sku, checked as boolean)}
                                                data-testid={`product-checkbox-${product.sku}`}
                                                aria-label={`Select ${product.sku}`}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-muted-foreground">{product.sku}</TableCell>
                                        <TableCell className="font-medium text-foreground truncate max-w-[300px]" title={name}>
                                            {name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground truncate" title={brand}>
                                            {brand}
                                        </TableCell>
                                        <TableCell>
                                            <Badge 
                                                variant="outline" 
                                                className={`
                                                    ${status === 'staging' ? 'bg-muted text-muted-foreground border-border' : ''}
                                                    ${status === 'scraped' ? 'bg-blue-100 text-blue-700 border-blue-200' : ''}
                                                    ${status === 'failed' ? 'bg-red-100 text-red-700 border-red-200' : ''}
                                                `}
                                            >
                                                {status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground text-sm">
                                            {product.last_enriched_at 
                                                ? new Date(product.last_enriched_at).toLocaleDateString()
                                                : '-'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
