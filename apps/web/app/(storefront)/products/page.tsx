import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { getFilteredProducts } from '@/lib/products';
import { getBrands, getNavCategories } from '@/lib/data';
import { getPetTypes } from '@/lib/recommendations';
import { getDynamicFacets } from '@/lib/facets';
import { ProductCard } from '@/components/storefront/product-card';
import { FacetSidebar } from '@/components/storefront/facet-sidebar';
import { EmptyState } from '@/components/ui/empty-state';
import { Search } from 'lucide-react';

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
    facets?: string; // Example: 'color:red,size:large'
  }>;
}

/**
 * Products listing page with Chewy-inspired facet sidebar and dynamic filtering.
 */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const limit = 12;
  const offset = (page - 1) * limit;

  const [{ products, count }, brands, petTypes, categories, dynamicFacets] = await Promise.all([
    getFilteredProducts({
      brandSlug: params.brand,
      petTypeId: params.petTypeId,
      categorySlug: params.category,
      stockStatus: params.stock,
      minPrice: params.minPrice ? parseFloat(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? parseFloat(params.maxPrice) : undefined,
      search: params.search,
      facets: params.facets,
      limit,
      offset,
    }),
    getBrands(),
    getPetTypes(),
    getNavCategories(),
    getDynamicFacets(),
  ]);

  const totalPages = Math.ceil(count / limit);

  // Build pagination URL preserving all current filters
  const buildPageUrl = (pageNum: number) => {
    const searchParamsObj = new URLSearchParams();
    if (params.brand) searchParamsObj.set('brand', params.brand);
    if (params.petTypeId) searchParamsObj.set('petTypeId', params.petTypeId);
    if (params.category) searchParamsObj.set('category', params.category);
    if (params.stock) searchParamsObj.set('stock', params.stock);
    if (params.minPrice) searchParamsObj.set('minPrice', params.minPrice);
    if (params.maxPrice) searchParamsObj.set('maxPrice', params.maxPrice);
    if (params.search) searchParamsObj.set('search', params.search);
    if (params.facets) searchParamsObj.set('facets', params.facets);
    searchParamsObj.set('page', String(pageNum));
    return `/products?${searchParamsObj.toString()}`;
  };

  return (
    <div className="w-full px-4 pt-4 pb-8">
      <div className="flex flex-col gap-8 lg:flex-row items-start">
        {/* Filters Sidebar - Sticky/Pinned */}
        <aside className="w-full lg:w-72 flex-shrink-0 lg:sticky lg:top-24 h-auto lg:h-[calc(100vh-120px)] bg-zinc-50/50 rounded-lg p-4 lg:p-0 lg:bg-transparent">
          <FacetSidebar 
            brands={brands} 
            petTypes={petTypes} 
            categories={categories} 
            dynamicFacets={dynamicFacets}
          />
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-zinc-900">Products</h1>
            <p className="text-sm text-zinc-500">{count} result{count !== 1 ? 's' : ''}</p>
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
