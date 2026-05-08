import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { getAvailableProductFilters, getFilteredProducts } from '@/lib/products';
import { ProductCard } from '@/components/storefront/product-card';
import { FacetSidebar } from '@/components/storefront/facet-sidebar';
import { PageSizeSwitcher } from '@/components/storefront/page-size-switcher';
import { ProductSort } from '@/components/storefront/product-sort';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface ProductsPageProps {
  searchParams: Promise<{
    brand?: string;
    petTypeId?: string;
    category?: string;
    stock?: string;
    minPrice?: string;
    maxPrice?: string;
    search?: string;
    page?: string;
    limit?: string;
    facets?: string;
    sort?: string;
    specialOrder?: string;
  }>;
}

/**
 * Products listing page with Chewy-inspired facet sidebar and dynamic filtering.
 */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const limit = parseInt(params.limit || '24', 10);
  const offset = (page - 1) * limit;
  const minPrice = params.minPrice ? parseFloat(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? parseFloat(params.maxPrice) : undefined;

  const filterOptions = {
    brandSlug: params.brand,
    petTypeId: params.petTypeId,
    categorySlug: params.category,
    stockStatus: params.stock,
    minPrice: minPrice !== undefined && Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice !== undefined && Number.isFinite(maxPrice) ? maxPrice : undefined,
    search: params.search,
    facets: params.facets,
    sort: params.sort,
    isSpecialOrder: params.specialOrder === 'true',
  };

  const [{ products, count }, availableFilters] = await Promise.all([
    getFilteredProducts({
      ...filterOptions,
      limit,
      offset,
    }),
    getAvailableProductFilters(filterOptions),
  ]);

  const totalPages = Math.ceil(count / limit);

  // Build pagination URL preserving all current filters
  const buildPageUrl = (pageNum: number) => {
    const searchParamsObj = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== 'page') {
        searchParamsObj.set(key, value);
      }
    });
    searchParamsObj.set('page', String(pageNum));
    return `/products?${searchParamsObj.toString()}`;
  };

  return (
    <div className="w-full px-4 pt-4 pb-8">
      <div className="flex flex-col gap-8 lg:flex-row items-start">
        {/* Filters Sidebar - Sticky/Pinned */}
        <aside className="w-full lg:w-72 flex-shrink-0 lg:sticky lg:top-24 h-auto lg:h-[calc(100vh-120px)] bg-zinc-50/50 rounded-lg p-4 lg:p-0 lg:bg-transparent">
          <FacetSidebar 
            brands={availableFilters.brands} 
            petTypes={availableFilters.petTypes} 
            categories={availableFilters.categories} 
            stockStatuses={availableFilters.stockStatuses}
            dynamicFacets={availableFilters.dynamicFacets}
            hasSpecialOrder={availableFilters.hasSpecialOrder}
          />
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            {/* Breadcrumb Navigation */}
            <Breadcrumb>
              <BreadcrumbList className="text-2xl text-zinc-900 font-bold sm:gap-3">
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">
                    <Home className="h-5 w-5" />
                    <span className="sr-only">Home</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="[&>svg]:size-5" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-bold text-zinc-900">Products</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-6">
              <ProductSort />
              <PageSizeSwitcher currentLimit={limit} />
              <p className="text-sm font-medium text-zinc-500 whitespace-nowrap">{count} result{count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          
          <h2 className="text-2xl font-semibold text-zinc-900 mb-6 sr-only">Product Listing</h2>
          {products.length > 0 ? (
            <>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8">
                  <Pagination>
                    <PaginationContent>
                      {page > 1 ? (
                        <PaginationItem>
                          <PaginationPrevious href={buildPageUrl(page - 1)} />
                        </PaginationItem>
                      ) : (
                        <PaginationItem>
                          <PaginationPrevious 
                            href="#" 
                            className="pointer-events-none opacity-50" 
                            aria-disabled="true"
                          />
                        </PaginationItem>
                      )}
                      
                      <PaginationItem>
                        <span className="flex h-9 min-w-9 items-center justify-center text-sm font-medium">
                          Page {page} of {totalPages}
                        </span>
                      </PaginationItem>

                      {page < totalPages ? (
                        <PaginationItem>
                          <PaginationNext href={buildPageUrl(page + 1)} />
                        </PaginationItem>
                      ) : (
                        <PaginationItem>
                          <PaginationNext 
                            href="#" 
                            className="pointer-events-none opacity-50" 
                            aria-disabled="true"
                          />
                        </PaginationItem>
                      )}
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Search}
              title="No products found"
              description="We couldn't find any products matching your filters. Try clearing some filters or searching for something else."
              actionLabel="Clear Filters"
              actionHref="/products"
              className="mt-8 border-none bg-transparent"
            />
          )}
        </div>
      </div>
    </div>
  );
}
