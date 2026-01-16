import Link from 'next/link';
import { getFilteredProducts } from '@/lib/products';
import { getBrands } from '@/lib/data';
import { getPetTypes } from '@/lib/recommendations';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductFilters } from '@/components/storefront/product-filters';

interface ProductsPageProps {
  searchParams: Promise<{
    brand?: string;
    petType?: string;
    stock?: string;
    minPrice?: string;
    maxPrice?: string;
    search?: string;
    page?: string;
  }>;
}

/**
 * Products listing page with filtering and pagination.
 */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const limit = 12;
  const offset = (page - 1) * limit;

  const [{ products, count }, brands, petTypes] = await Promise.all([
    getFilteredProducts({
      brandSlug: params.brand,
      petTypeId: params.petType,
      stockStatus: params.stock,
      minPrice: params.minPrice ? parseFloat(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? parseFloat(params.maxPrice) : undefined,
      search: params.search,
      limit,
      offset,
    }),
    getBrands(),
    getPetTypes(),
  ]);

  const totalPages = Math.ceil(count / limit);

  // Build pagination URL preserving all current filters
  const buildPageUrl = (pageNum: number) => {
    const searchParamsObj = new URLSearchParams();
    if (params.brand) searchParamsObj.set('brand', params.brand);
    if (params.petType) searchParamsObj.set('petType', params.petType);
    if (params.stock) searchParamsObj.set('stock', params.stock);
    if (params.minPrice) searchParamsObj.set('minPrice', params.minPrice);
    if (params.maxPrice) searchParamsObj.set('maxPrice', params.maxPrice);
    if (params.search) searchParamsObj.set('search', params.search);
    searchParamsObj.set('page', String(pageNum));
    return `/products?${searchParamsObj.toString()}`;
  };

  return (
    <div className="w-full px-4 py-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Filters Sidebar */}
        <aside className="w-full lg:w-64 flex-shrink-0 lg:sticky lg:top-20 lg:h-fit">
          <ProductFilters brands={brands} petTypes={petTypes} />
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-zinc-900 mb-6">Products</h1>
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
                <div className="mt-8 flex items-center justify-center gap-2">
                  {page > 1 && (
                    <Link
                      href={buildPageUrl(page - 1)}
                      className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50"
                    >
                      Previous
                    </Link>
                  )}
                  <span className="text-sm text-zinc-700">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={buildPageUrl(page + 1)}
                      className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50"
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg text-zinc-700">No products found</p>
              <p className="mt-2 text-sm text-zinc-700">
                Try adjusting your filters or search terms
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
