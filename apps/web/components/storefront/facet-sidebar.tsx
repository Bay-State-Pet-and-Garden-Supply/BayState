'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { type Brand } from '@/lib/types';
import { type FacetDefinition } from '@/lib/facets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toTitleCase } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getCategoryUrl, getBrandUrl } from '@/lib/urls';

interface PetType {
  id: string;
  name: string;
}

interface CategorySummary {
  id: string;
  name: string;
  slug: string | null;
  breadcrumb?: string;
  depth?: number;
  is_leaf?: boolean;
  parent_id?: string | null;
  ancestor_slugs?: string[];
  ancestor_names?: string[];
}

interface FacetSidebarProps {
  brands: Brand[];
  petTypes: PetType[];
  categories?: CategorySummary[];
  stockStatuses?: Array<{ id: string; label: string }>;
  dynamicFacets?: FacetDefinition[];
  /** When rendered inside a /c/[slug] page, this is the active category slug */
  activeCategorySlug?: string;
  /** When rendered inside a /b/[slug] page, this is the active brand slug */
  activeBrandSlug?: string;
  hasSpecialOrder?: boolean;
}

export function FacetSidebar({
  brands,
  petTypes,
  categories = [],
  stockStatuses = [],
  dynamicFacets = [],
  activeCategorySlug,
  activeBrandSlug,
  hasSpecialOrder = false,
}: FacetSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Determine if we're on a category or brand page (slug-based routes)
  const isOnCategoryPage = pathname.startsWith('/c/');
  const isOnBrandPage = pathname.startsWith('/b/');

  // For /c/ pages, category comes from the route; for /products, from query params
  const currentCategory = activeCategorySlug || searchParams.get('category') || '';
  const currentBrand = activeBrandSlug || searchParams.get('brand') || '';

  const currentSearch = searchParams.get('search') || '';
  const currentPetTypeId = searchParams.get('petTypeId') || '';
  const currentStock = searchParams.get('stock') || '';
  const currentSpecialOrder = searchParams.get('specialOrder') === 'true';

  const currentFacetsRaw = searchParams.get('facets') || '';
  const currentFacetsList = currentFacetsRaw ? currentFacetsRaw.split(',') : [];

  // Compute Active Category Context for Drill-Down
  const activeCategory = currentCategory ? categories.find((c) => (c.slug || c.name.toLowerCase()) === currentCategory) : undefined;
  const renderCategories = activeCategory 
    ? categories.filter((c) => c.parent_id === activeCategory.id)
    : categories.filter((c) => !c.parent_id);

  // Internal search states for long lists
  const [brandSearch, setBrandSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [petTypeSearch, setPetTypeSearch] = useState('');
  const [facetSearches, setFacetSearches] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleExpanded = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  /**
   * Builds a URL preserving current filter context.
   * When on a /c/ or /b/ page, filters are applied as query params on that page.
   * When on /products, category/brand are also query params.
   */
  const buildFilterUrl = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete('page');

    // If navigating to a specific category, use the /c/ route
    if (overrides.category !== undefined) {
      const catSlug = overrides.category;
      // Remove category from query params since it's in the URL path
      params.delete('category');
      const qs = params.toString();
      return catSlug ? `${getCategoryUrl(catSlug)}${qs ? `?${qs}` : ''}` : '/products';
    }

    // If navigating to a specific brand, use the /b/ route
    if (overrides.brand !== undefined) {
      const brandSlug = overrides.brand;
      // Remove brand from query params since it's in the URL path
      params.delete('brand');
      const qs = params.toString();
      return brandSlug ? `${getBrandUrl(brandSlug)}${qs ? `?${qs}` : ''}` : '/products';
    }

    // For other filters, stay on the current page
    let basePath = pathname;
    // On /products with legacy query params, stay on /products
    if (!isOnCategoryPage && !isOnBrandPage) {
      basePath = '/products';
    }

    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };

  const updateFilter = (key: string, value: string | null) => {
    router.push(buildFilterUrl({ [key]: value }));
  };

  const toggleFacet = (facetSlug: string, valueSlug: string) => {
    const facetKey = `${facetSlug}:${valueSlug}`;
    const newFacets = currentFacetsList.includes(facetKey)
      ? currentFacetsList.filter(f => f !== facetKey)
      : [...currentFacetsList, facetKey];

    updateFilter('facets', newFacets.length > 0 ? newFacets.join(',') : null);
  };

  const hasFilters = currentSearch || currentBrand || currentPetTypeId || currentCategory || currentStock || currentSpecialOrder || currentFacetsRaw;

  // Build active filters list for pills
  const activeFilters = [];
  if (currentSearch) activeFilters.push({ key: 'search', label: `Search: ${currentSearch}`, value: null });
  if (currentStock) {
    const labels: Record<string, string> = { in_stock: 'In Stock', out_of_stock: 'Out of Stock', pre_order: 'Pre-Order' };
    activeFilters.push({ key: 'stock', label: labels[currentStock] || currentStock, value: null });
  }
  if (currentCategory && !isOnCategoryPage) {
    const categoryLabel = categories.find((category) => category.slug === currentCategory)?.breadcrumb
      || categories.find((category) => category.slug === currentCategory)?.name
      || currentCategory;
    activeFilters.push({ key: 'category', label: `Category: ${categoryLabel}`, value: null });
  }
  if (currentBrand && !isOnBrandPage) {
    const brandName = brands.find(b => b.slug === currentBrand)?.name || currentBrand;
    activeFilters.push({ key: 'brand', label: `Brand: ${brandName}`, value: null });
  }
  if (currentPetTypeId) {
    const petName = petTypes.find(p => p.id === currentPetTypeId)?.name || 'Pet';
    activeFilters.push({ key: 'petTypeId', label: `Pet: ${petName}`, value: null });
  }
  if (currentSpecialOrder) {
    activeFilters.push({ key: 'specialOrder', label: 'Special Order', value: null });
  }
  currentFacetsList.forEach(f => {
    const [facetSlug, valSlug] = f.split(':');
    const facet = dynamicFacets.find(df => df.slug === facetSlug);
    const val = facet?.values.find(v => v.slug === valSlug);
    activeFilters.push({
      key: 'facets',
      label: `${facet?.name || facetSlug}: ${val?.value || valSlug}`,
      value: f
    });
  });

  const removeFilter = (key: string, value: string | null) => {
    if (key === 'facets' && value) {
      const newFacets = currentFacetsList.filter(f => f !== value);
      updateFilter('facets', newFacets.length > 0 ? newFacets.join(',') : null);
    } else if (key === 'category' && isOnCategoryPage) {
      // On a category page, removing the category = go to /products
      router.push('/products');
    } else if (key === 'brand' && isOnBrandPage) {
      // On a brand page, removing the brand = go to /products
      router.push('/products');
    } else {
      updateFilter(key, null);
    }
  };

  const clearAllFilters = () => {
    if (isOnCategoryPage && activeCategorySlug) {
      router.push(getCategoryUrl(activeCategorySlug));
    } else if (isOnBrandPage && activeBrandSlug) {
      router.push(getBrandUrl(activeBrandSlug));
    } else {
      router.push('/products');
    }
  };

  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()));
  const filteredCategories = renderCategories.filter((category) =>
    category.name.toLowerCase().includes(categorySearch.toLowerCase())
  );
  const filteredPetTypes = petTypes.filter(p => p.name.toLowerCase().includes(petTypeSearch.toLowerCase()));

  return (
    <div className="flex flex-col h-full lg:max-h-[calc(100vh-170px)]">
      <div className="flex items-center justify-between pb-4 border-b shrink-0">
        <h2 className="text-xl font-bold text-zinc-900">Filters</h2>
        {hasFilters && (
          <Button variant="link" size="sm" onClick={clearAllFilters} className="h-auto p-0 text-primary">
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filters Pills */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-4 shrink-0">
          {activeFilters.map((filter) => (
            <div
              key={`${filter.key}-${filter.value ?? filter.label}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-[11px] font-bold text-zinc-600 hover:bg-zinc-200 transition-colors cursor-default"
            >
              <span>{toTitleCase(filter.label)}</span>
              <button
                type="button"
                onClick={() => removeFilter(filter.key, filter.value)}
                className="hover:text-red-600 transition-colors p-0.5"
                aria-label={`Remove ${filter.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2 py-4 scrollbar-thin scrollbar-thumb-zinc-200">
        <Accordion 
          type="multiple" 
          defaultValue={["stock", "category", "petType", "brand", ...dynamicFacets.map(f => f.slug)]} 
          className="w-full"
        >

          {/* Availability */}
          {stockStatuses.length > 0 && (
            <AccordionItem value="stock" className="border-none">
              <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">Availability</AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1 pb-4">
                {stockStatuses.map((status) => (
                  <div key={status.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={`stock-${status.id}`}
                      checked={currentStock === status.id}
                      onCheckedChange={(checked) => updateFilter('stock', checked ? status.id : null)}
                    />
                    <Label htmlFor={`stock-${status.id}`} className="text-sm font-medium cursor-pointer leading-none">
                      {status.label}
                    </Label>
                  </div>
                ))}

                {hasSpecialOrder && (
                  <div className="flex items-center space-x-3 pt-2 border-t border-zinc-50">
                    <Checkbox
                      id="special-order"
                      checked={currentSpecialOrder}
                      onCheckedChange={(checked) => updateFilter('specialOrder', checked ? 'true' : null)}
                    />
                    <Label htmlFor="special-order" className="text-sm font-medium cursor-pointer leading-none">
                      Special Order
                    </Label>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <AccordionItem value="category" className="border-t border-zinc-100">
              <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">Category</AccordionTrigger>
              <AccordionContent className="pt-1 pb-4">
                {filteredCategories.length > 10 && (
                  <div className="relative mb-3">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                    <Input
                      placeholder="Search categories..."
                      className="h-8 pl-7 text-xs"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-3">
                  {/* Ancestors navigation */}
                  {activeCategory?.parent_id && activeCategory.ancestor_names && activeCategory.ancestor_slugs && (
                    <div className="flex flex-col space-y-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          const parentSlug = activeCategory.ancestor_slugs![activeCategory.ancestor_slugs!.length - 1];
                          router.push(parentSlug ? getCategoryUrl(parentSlug) : '/products');
                        }}
                        className="flex items-center text-sm font-medium text-zinc-500 hover:text-primary transition-colors text-left"
                      >
                        <span className="mr-1.5 text-xs">&lt;</span> Back to {activeCategory.ancestor_names[activeCategory.ancestor_names.length - 1]}
                      </button>
                    </div>
                  )}

                  {/* Children / Siblings List */}
                  {filteredCategories.length > 0 ? (
                    <div className="space-y-2 pr-1 pl-1">
                      {(expandedSections['category'] ? filteredCategories : filteredCategories.slice(0, 10)).map((category) => {
                        const slug = category.slug || category.name.toLowerCase();
                        return (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => router.push(getCategoryUrl(slug))}
                            className="block w-full text-left text-sm text-zinc-600 hover:text-primary hover:font-medium transition-colors border-l-2 border-transparent pl-3"
                          >
                            {toTitleCase(category.name)}
                          </button>
                        );
                      })}
                      {filteredCategories.length > 10 && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 pt-1 text-primary text-xs font-bold hover:no-underline"
                          onClick={() => toggleExpanded('category')}
                        >
                          {expandedSections['category'] ? 'Show Less' : `Show ${filteredCategories.length - 10} More`}
                        </Button>
                      )}
                    </div>
                  ) : activeCategory ? (
                    <div className="text-sm text-zinc-400 pl-1 italic">No subcategories</div>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}


          {/* Pet Type */}
          {petTypes.length > 0 && (
            <AccordionItem value="petType" className="border-t border-zinc-100">
              <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">Pet Type</AccordionTrigger>
              <AccordionContent className="pt-1 pb-4">
                {petTypes.length > 10 && (
                  <div className="relative mb-3">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                    <Input
                      placeholder="Search pets..."
                      className="h-8 pl-7 text-xs"
                      value={petTypeSearch}
                      onChange={(e) => setPetTypeSearch(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-3 pr-1">
                  {(expandedSections['petType'] ? filteredPetTypes : filteredPetTypes.slice(0, 10)).map((pet) => (
                    <div key={pet.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={`pet-${pet.id}`}
                        checked={currentPetTypeId === pet.id}
                        onCheckedChange={(checked) => updateFilter('petTypeId', checked ? pet.id : null)}
                      />
                      <Label htmlFor={`pet-${pet.id}`} className="text-sm font-medium cursor-pointer leading-none">
                        {toTitleCase(pet.name)}
                      </Label>
                    </div>
                  ))}
                  {filteredPetTypes.length > 10 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 pt-1 text-primary text-xs font-bold hover:no-underline"
                      onClick={() => toggleExpanded('petType')}
                    >
                      {expandedSections['petType'] ? 'Show Less' : `Show ${filteredPetTypes.length - 10} More`}
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Brand */}
          {brands.length > 0 && (
          <AccordionItem value="brand" className="border-t border-zinc-100">
            <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">Brand</AccordionTrigger>
            <AccordionContent className="pt-1 pb-4">
              {brands.length > 10 && (
                <div className="relative mb-3">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                  <Input
                    placeholder="Search brands..."
                    className="h-8 pl-7 text-xs"
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-3 pr-1">
                {(expandedSections['brand'] ? filteredBrands : filteredBrands.slice(0, 10)).map((brand) => (
                  <div key={brand.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={`brand-${brand.id}`}
                      checked={currentBrand === brand.slug}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          router.push(getBrandUrl(brand.slug));
                        } else if (isOnBrandPage) {
                          router.push('/products');
                        } else {
                          updateFilter('brand', null);
                        }
                      }}
                    />
                    <Label htmlFor={`brand-${brand.id}`} className="text-sm font-medium cursor-pointer leading-none">
                      {toTitleCase(brand.name)}
                    </Label>
                  </div>
                ))}
                {filteredBrands.length > 10 && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 pt-1 text-primary text-xs font-bold hover:no-underline"
                    onClick={() => toggleExpanded('brand')}
                  >
                    {expandedSections['brand'] ? 'Show Less' : `Show ${filteredBrands.length - 10} More`}
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Dynamic Schema Facets */}
          {dynamicFacets.map((facet) => {
            const facetSearch = facetSearches[facet.slug] || '';
            const filteredValues = facet.values.filter(v => v.value.toLowerCase().includes(facetSearch.toLowerCase()));

            return (
              <AccordionItem key={facet.id} value={facet.slug} className="border-t border-zinc-100">
                <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">
                  {toTitleCase(facet.name.replace(/_/g, ' '))}
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-4">
                  {facet.values.length > 8 && (
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400" />
                      <Input
                        placeholder={`Search ${facet.name}...`}
                        className="h-8 pl-7 text-xs"
                        value={facetSearch}
                        onChange={(e) => setFacetSearches(prev => ({ ...prev, [facet.slug]: e.target.value }))}
                      />
                    </div>
                  )}
                  <div className="space-y-3 pr-1">
                    {(expandedSections[facet.slug] ? filteredValues : filteredValues.slice(0, 10)).map((val) => {
                      const isChecked = currentFacetsList.includes(`${facet.slug}:${val.slug}`);
                      return (
                        <div key={val.id} className="flex items-center space-x-3">
                          <Checkbox
                            id={`facet-${facet.slug}-${val.slug}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleFacet(facet.slug, val.slug)}
                          />
                          <Label htmlFor={`facet-${facet.slug}-${val.slug}`} className="text-sm font-medium cursor-pointer leading-none">
                            {toTitleCase(val.value)}
                          </Label>
                        </div>
                      );
                    })}
                    {filteredValues.length > 10 && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 pt-1 text-primary text-xs font-bold hover:no-underline"
                        onClick={() => toggleExpanded(facet.slug)}
                      >
                        {expandedSections[facet.slug] ? 'Show Less' : `Show ${filteredValues.length - 10} More`}
                      </Button>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
