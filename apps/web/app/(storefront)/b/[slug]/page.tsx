import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { Home, Search } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getAvailableProductFilters, getFilteredProducts } from '@/lib/products';
import { getBrandBySlug } from '@/lib/data';
import { ProductCard } from '@/components/storefront/product-card';
import { FacetSidebar } from '@/components/storefront/facet-sidebar';
import { PageSizeSwitcher } from '@/components/storefront/page-size-switcher';
import { ProductSort } from '@/components/storefront/product-sort';
import { EmptyState } from '@/components/ui/empty-state';
import { getBrandUrl } from '@/lib/urls';

interface BrandPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    category?: string;
    petTypeId?: string;
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

export async function generateMetadata({ params }: BrandPageProps): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);

  if (!brand) {
    return { title: 'Brand Not Found | Bay State Pet & Garden' };
  }

  const description = `Shop ${brand.name} products at Bay State Pet & Garden Supply.`;

  return {
    title: `${brand.name} | Bay State Pet & Garden`,
    description,
    openGraph: {
      title: brand.name,
      description,
      images: brand.logo_url ? [{ url: brand.logo_url }] : undefined,
      type: 'website',
    },
    alternates: {
      canonical: getBrandUrl(brand.slug),
    },
  };
}

export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const { slug } = await params;
  const resolvedParams = await searchParams;
  const brand = await getBrandBySlug(slug);

  if (!brand) {
    notFound();
  }

  const page = parseInt(resolvedParams.page || '1', 10);
  const limit = parseInt(resolvedParams.limit || '24', 10);
  const offset = (page - 1) * limit;
  const minPrice = resolvedParams.minPrice ? parseFloat(resolvedParams.minPrice) : undefined;
  const maxPrice = resolvedParams.maxPrice ? parseFloat(resolvedParams.maxPrice) : undefined;

  const filterOptions = {
    brandSlug: brand.slug,
    petTypeId: resolvedParams.petTypeId,
    categorySlug: resolvedParams.category,
    stockStatus: resolvedParams.stock,
    minPrice: minPrice !== undefined && Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice !== undefined && Number.isFinite(maxPrice) ? maxPrice : undefined,
    search: resolvedParams.search,
    facets: resolvedParams.facets,
    sort: resolvedParams.sort,
    isSpecialOrder: resolvedParams.specialOrder === 'true',
  };

  const [{ products, count }, availableFilters] = await Promise.all([
    getFilteredProducts({ ...filterOptions, limit, offset }),
    getAvailableProductFilters(filterOptions),
  ]);

  const totalPages = Math.ceil(count / limit);

  // Build pagination URL preserving all current filters
  const buildPageUrl = (pageNum: number) => {
    const searchParamsObj = new URLSearchParams();
    Object.entries(resolvedParams).forEach(([key, value]) => {
      if (value && key !== 'page') {
        searchParamsObj.set(key, value);
      }
    });
    searchParamsObj.set('page', String(pageNum));
    return `${getBrandUrl(slug)}?${searchParamsObj.toString()}`;
  };

  return (
    <div className="w-full px-4 pt-4 pb-8">
      <div className="flex flex-col gap-8 lg:flex-row items-start">
        {/* Filters Sidebar - Sticky/Pinned */}
        <aside className="w-full lg:w-72 flex-shrink-0 lg:sticky lg:top-36 h-auto lg:h-[calc(100vh-170px)] bg-zinc-50/50 rounded-lg p-4 lg:p-0 lg:bg-transparent">
          <FacetSidebar
            brands={availableFilters.brands}
            petTypes={availableFilters.petTypes}
            categories={availableFilters.categories}
            stockStatuses={availableFilters.stockStatuses}
            dynamicFacets={availableFilters.dynamicFacets}
            activeBrandSlug={brand.slug}
            hasSpecialOrder={availableFilters.hasSpecialOrder}
          />
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            {/* Breadcrumb Navigation - Now inline with results */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">
                    <Home className="h-4 w-4" />
                    <span className="sr-only">Home</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/brands">Brands</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-medium text-zinc-900">{brand.name}</BreadcrumbPage>
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
              actionHref={getBrandUrl(slug)}
              className="mt-8 border-none bg-transparent"
            />
          )}
        </div>
      </div>
    </div>
  );
}
