import { notFound } from 'next/navigation';
import { type Metadata } from 'next';
import { Fragment } from 'react';
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
import { getCategoryBySlug, getNavCategories } from '@/lib/data';
import { ProductCard } from '@/components/storefront/product-card';
import { FacetSidebar } from '@/components/storefront/facet-sidebar';
import { PageSizeSwitcher } from '@/components/storefront/page-size-switcher';
import { ProductSort } from '@/components/storefront/product-sort';
import { EmptyState } from '@/components/ui/empty-state';
import { getCategoryUrl } from '@/lib/urls';

interface CategoryPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{
    brand?: string;
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

/**
 * Resolves a catch-all slug array to the last slug segment (the category slug).
 * Next.js catch-all routes like /c/dog/food receive ['dog', 'food'] but our
 * category slugs are flat (e.g. 'dog-food'), so we use only the last segment.
 *
 * This also lets us support both `/c/dog-food` and `/c/dog/food` gracefully —
 * a single segment is the direct slug, and multi-segment paths will try the
 * last segment first, then fall back to joining with hyphens.
 */
async function resolveCategory(slugSegments: string[]) {
  // Try the last segment first (primary usage: /c/dog-food)
  const lastSegment = slugSegments[slugSegments.length - 1];
  const category = await getCategoryBySlug(lastSegment);
  if (category) return category;

  // Fallback: join segments with hyphens (/c/dog/food → dog-food)
  if (slugSegments.length > 1) {
    const joinedSlug = slugSegments.join('-');
    const catByJoin = await getCategoryBySlug(joinedSlug);
    if (catByJoin) return catByJoin;
  }

  return null;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await resolveCategory(slug);

  if (!category) {
    return { title: 'Category Not Found | Bay State Pet & Garden' };
  }

  const description = category.seo_description
    ?? (category.description
      ? category.description.slice(0, 160)
      : `Shop ${category.name} at Bay State Pet & Garden Supply.`);

  return {
    title: category.seo_title ?? `${category.name} | Bay State Pet & Garden`,
    description,
    openGraph: {
      title: category.name,
      description,
      type: 'website',
    },
    alternates: {
      canonical: getCategoryUrl(category.slug),
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const resolvedParams = await searchParams;
  const category = await resolveCategory(slug);

  if (!category) {
    notFound();
  }

  const categorySlug = category.slug!;
  const page = parseInt(resolvedParams.page || '1', 10);
  const limit = parseInt(resolvedParams.limit || '24', 10);
  const offset = (page - 1) * limit;
  const minPrice = resolvedParams.minPrice ? parseFloat(resolvedParams.minPrice) : undefined;
  const maxPrice = resolvedParams.maxPrice ? parseFloat(resolvedParams.maxPrice) : undefined;

  const filterOptions = {
    brandSlug: resolvedParams.brand,
    petTypeId: resolvedParams.petTypeId,
    categorySlug,
    stockStatus: resolvedParams.stock,
    minPrice: minPrice !== undefined && Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice !== undefined && Number.isFinite(maxPrice) ? maxPrice : undefined,
    search: resolvedParams.search,
    facets: resolvedParams.facets,
    sort: resolvedParams.sort,
    isSpecialOrder: resolvedParams.specialOrder === 'true',
  };

  const [{ products, count }, availableFilters, navCategories] = await Promise.all([
    getFilteredProducts({ ...filterOptions, limit, offset }),
    getAvailableProductFilters(filterOptions),
    getNavCategories(),
  ]);

  const totalPages = Math.ceil(count / limit);

  // Build breadcrumb trail from taxonomy ancestry
  const categoryById = new Map(navCategories.map(c => [c.id, c]));
  const breadcrumbTrail: Array<{ id: string; name: string; slug: string }> = [];
  let currentCat = categoryById.get(category.id);
  while (currentCat) {
    breadcrumbTrail.unshift({ id: currentCat.id, name: currentCat.name, slug: currentCat.slug });
    currentCat = currentCat.parent_id ? categoryById.get(currentCat.parent_id) : undefined;
  }

  // Build pagination URL preserving all current filters (minus stale redirect params)
  const buildPageUrl = (pageNum: number) => {
    const searchParamsObj = new URLSearchParams();
    Object.entries(resolvedParams).forEach(([key, value]) => {
      // Skip 'page' (we set it explicitly) and 'category' (it's in the URL path now)
      if (value && key !== 'page' && key !== 'category') {
        searchParamsObj.set(key, value);
      }
    });
    searchParamsObj.set('page', String(pageNum));
    return `${getCategoryUrl(categorySlug)}?${searchParamsObj.toString()}`;
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
            activeCategorySlug={categorySlug}
            hasSpecialOrder={availableFilters.hasSpecialOrder}
          />
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            {/* Breadcrumb Navigation - Now inline with results */}
            <Breadcrumb>
              <BreadcrumbList className="text-2xl text-zinc-900 font-bold sm:gap-3">
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">
                    <Home className="h-5 w-5" />
                    <span className="sr-only">Home</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {breadcrumbTrail.map((crumb, index) => (
                  <Fragment key={crumb.id}>
                    <BreadcrumbSeparator className="[&>svg]:size-5" />
                    <BreadcrumbItem>
                      {index === breadcrumbTrail.length - 1 ? (
                        <BreadcrumbPage className="font-bold capitalize text-zinc-900">{crumb.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={getCategoryUrl(crumb.slug)} className="capitalize">
                          {crumb.name}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
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
              actionHref={getCategoryUrl(categorySlug)}
              className="mt-8 border-none bg-transparent"
            />
          )}
        </div>
      </div>
    </div>
  );
}
