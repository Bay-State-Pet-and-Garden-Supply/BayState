'use client';

import { useEffect, useMemo, useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, MoreHorizontal, Package, Plus, RefreshCw, Search, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdminControlBar } from '@/components/admin/admin-control-bar';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { DataTable, type Column } from '@/components/admin/data-table';
import type { PublishedProduct } from './ProductEditModal';
import { useDebounce } from '@/hooks/use-debounce';
import { cn, formatCurrency } from '@/lib/utils';

interface AdminProductsClientProps {
  initialProducts: PublishedProduct[];
  totalCount: number;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

function getStockBadgeVariant(stockStatus: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (stockStatus) {
    case 'in_stock':
      return 'success';
    case 'low_stock':
      return 'warning';
    case 'out_of_stock':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function getStockLabel(stockStatus: string) {
  switch (stockStatus) {
    case 'in_stock':
      return 'In stock';
    case 'low_stock':
      return 'Low stock';
    case 'out_of_stock':
      return 'Out of stock';
    case 'pre_order':
      return 'Pre-order';
    default:
      return stockStatus.replace(/_/g, ' ');
  }
}

function getPageCount(productPages: PublishedProduct['product_on_pages']) {
  if (!productPages) return 0;
  if (Array.isArray(productPages)) return productPages.length;
  if (typeof productPages === 'string') {
    try {
      const parsed = JSON.parse(productPages);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function AdminProductsClient({
  initialProducts,
  totalCount,
  brands,
  categories,
}: AdminProductsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const products = initialProducts;

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(search, 350);

  const brandFilter = searchParams.get('brand') || 'all';
  const categoryFilter = searchParams.get('category') || 'all';
  const stockFilter = searchParams.get('stock') || 'all';

  const updateFilters = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      startTransition(() => {
        const next = params.toString();
        router.push(next ? `${pathname}?${next}` : pathname);
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const currentSearch = searchParams.get('search') || '';
    if (debouncedSearch !== currentSearch) {
      updateFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, searchParams, updateFilters]);

  const stats = useMemo(() => {
    const inStock = products.filter((product) => product.stock_status === 'in_stock').length;
    const attention = products.filter(
      (product) => product.stock_status === 'low_stock' || product.stock_status === 'out_of_stock',
    ).length;
    const featured = products.filter((product) => product.is_featured).length;

    return { inStock, attention, featured };
  }, [products]);

  const hasActiveFilters =
    search.trim() !== '' || brandFilter !== 'all' || categoryFilter !== 'all' || stockFilter !== 'all';

  const handleClearFilters = () => {
    setSearch('');
    router.push(pathname);
  };

  const columns = useMemo<Column<PublishedProduct>[]>(
    () => [
      {
        key: 'name',
        header: 'Product',
        sortable: true,
        className: 'min-w-[220px]',
        render: (_value, product) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{product.name}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{product.brand_name || 'No brand'}</span>
              <span>SKU {product.sku || 'Missing'}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'stock_status',
        header: 'Status',
        sortable: true,
        className: 'min-w-[160px]',
        render: (_value, product) => (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStockBadgeVariant(product.stock_status)}>{getStockLabel(product.stock_status)}</Badge>
            {product.is_featured ? <Badge variant="outline">Featured</Badge> : null}
            {product.is_special_order ? <Badge variant="secondary">Special order</Badge> : null}
          </div>
        ),
      },
      {
        key: 'price',
        header: 'Price',
        sortable: true,
        className: 'min-w-[100px] tabular-nums',
        render: (value) => <span className="font-medium">{formatCurrency(Number(value || 0))}</span>,
      },
      {
        key: 'quantity',
        header: 'On hand',
        sortable: true,
        className: 'min-w-[100px] tabular-nums',
        render: (_value, product) => (
          <div className="space-y-1 text-sm">
            <div className="font-medium text-foreground">{product.quantity ?? '—'}</div>
            {product.low_stock_threshold ? (
              <div className="text-xs text-muted-foreground">Low at {product.low_stock_threshold}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'product_on_pages',
        header: 'Storefront',
        className: 'hidden 2xl:table-cell min-w-[140px]',
        render: (_value, product) => {
          const pageCount = getPageCount(product.product_on_pages);
          return (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-foreground">{pageCount} page{pageCount === 1 ? '' : 's'}</div>
              <div className="text-xs text-muted-foreground">
                {product.published_at ? 'Published' : 'Not published'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'created_at',
        header: 'Added',
        sortable: true,
        className: 'hidden 2xl:table-cell min-w-[110px]',
        render: (value) => (
          <span className="text-sm text-muted-foreground">
            {value ? new Date(String(value)).toLocaleDateString() : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  if (!products.length) {
    return (
      <div className="flex flex-col gap-5 pb-6">
        <AdminControlBar>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by product name or SKU"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                aria-label="Search products"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/pipeline">
                  <Workflow className="h-4 w-4" />
                  Open pipeline
                </Link>
              </Button>
              <Button asChild>
                <Link href="/admin/products/new">
                  <Plus className="h-4 w-4" />
                  New product
                </Link>
              </Button>
            </div>
          </div>
        </AdminControlBar>

        <AdminEmptyState
          icon={Package}
          title={hasActiveFilters ? 'No products match these filters.' : 'No published products yet.'}
          description={
            hasActiveFilters
              ? 'Clear the current search or filters, then try again.'
              : 'Products move here after pipeline review and publication.'
          }
          actionLabel={hasActiveFilters ? 'Clear filters' : 'Open pipeline'}
          actionHref={hasActiveFilters ? undefined : '/admin/pipeline'}
          onAction={hasActiveFilters ? handleClearFilters : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Loaded now" value={products.length} hint="Showing up to the newest 50 products for the current filters." icon={<Package className="h-5 w-5" />} />
        <AdminStatCard label="In stock" value={stats.inStock} hint="Ready to sell now." tone="success" />
        <AdminStatCard label="Need attention" value={stats.attention} hint="Low stock or out of stock." tone="warning" />
        <AdminStatCard label="Featured" value={stats.featured} hint="Featured on the storefront." />
      </div>

      <AdminControlBar>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by product name or SKU"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                aria-label="Search products"
              />
            </div>

            <Select value={categoryFilter} onValueChange={(value) => updateFilters({ category: value })}>
              <SelectTrigger className="w-full lg:w-[200px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={brandFilter} onValueChange={(value) => updateFilters({ brand: value })}>
              <SelectTrigger className="w-full lg:w-[200px]">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stockFilter} onValueChange={(value) => updateFilters({ stock: value })}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="All stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="in_stock">In stock</SelectItem>
                <SelectItem value="low_stock">Low stock</SelectItem>
                <SelectItem value="out_of_stock">Out of stock</SelectItem>
                <SelectItem value="pre_order">Pre-order</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => startTransition(() => router.refresh())}
              disabled={isPending}
            >
              <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/pipeline">
                <Workflow className="h-4 w-4" />
                Open pipeline
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus className="h-4 w-4" />
                New product
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            Row click opens product editing. Use the action menu for variants, images, and the live page.
          </span>
          {totalCount > products.length ? (
            <span>Only the newest 50 matching products are loaded into this queue right now.</span>
          ) : null}
          {hasActiveFilters ? (
            <Button variant="ghost" onClick={handleClearFilters} className="h-auto px-0 text-sm text-muted-foreground hover:text-foreground">
              Clear filters
            </Button>
          ) : null}
        </div>
      </AdminControlBar>

      <div className="grid gap-4 xl:hidden">
        {products.map((product) => {
          const pageCount = getPageCount(product.product_on_pages);
          return (
            <div
              key={product.id}
              className="rounded-[1rem] border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/products/${product.id}/edit`)}
                    className="text-left text-base font-semibold text-foreground hover:text-primary"
                  >
                    {product.name}
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{product.brand_name || 'No brand'}</span>
                    <span>SKU {product.sku || 'Missing'}</span>
                  </div>
                </div>
                <span className="text-base font-semibold text-foreground tabular-nums">
                  {formatCurrency(Number(product.price || 0))}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant={getStockBadgeVariant(product.stock_status)}>{getStockLabel(product.stock_status)}</Badge>
                {product.is_featured ? <Badge variant="outline">Featured</Badge> : null}
                {product.is_special_order ? <Badge variant="secondary">Special order</Badge> : null}
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/20 p-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">On hand</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{product.quantity ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Storefront pages</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{pageCount}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Added</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {new Date(product.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/products/${product.id}/edit`}>Open product</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/products/${product.slug}`} target="_blank">
                    <ArrowUpRight className="h-4 w-4" />
                    Live
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${product.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/products/${product.id}/images`}>Manage images</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/products/${product.id}/variants`}>Manage variants</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden xl:block">
        <DataTable
          data={products}
          columns={columns}
          searchable={false}
          pageSize={20}
          emptyMessage="No products match the current filters."
          onRowClick={(product) => router.push(`/admin/products/${product.id}/edit`)}
          actions={(product) => (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/products/${product.slug}`} target="_blank">
                  <ArrowUpRight className="h-4 w-4" />
                  Live
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${product.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/products/${product.id}/edit`}>Open product</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/products/${product.id}/images`}>Manage images</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/products/${product.id}/variants`}>Manage variants</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        />
      </div>
    </div>
  );
}
