'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { type Brand } from '@/lib/types';
import { type FacetDefinition } from '@/lib/facets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface PetType {
  id: string;
  name: string;
}

interface CategorySummary {
  id: string;
  name: string;
  slug: string | null;
}

interface FacetSidebarProps {
  brands: Brand[];
  petTypes: PetType[];
  categories?: CategorySummary[];
  dynamicFacets?: FacetDefinition[];
}

export function FacetSidebar({ brands, petTypes, categories = [], dynamicFacets = [] }: FacetSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get('search') || '';
  const currentBrand = searchParams.get('brand') || '';
  const currentPetTypeId = searchParams.get('petTypeId') || '';
  const currentCategory = searchParams.get('category') || '';
  const currentStock = searchParams.get('stock') || '';

  const currentFacetsRaw = searchParams.get('facets') || '';
  const currentFacetsList = currentFacetsRaw ? currentFacetsRaw.split(',') : [];

  const [searchQuery, setSearchQuery] = useState(currentSearch);

  // Internal search states for long lists
  const [brandSearch, setBrandSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [petTypeSearch, setPetTypeSearch] = useState('');
  const [facetSearches, setFacetSearches] = useState<Record<string, string>>({});

  // "Show More" states
  const [expandedFacets, setExpandedFacets] = useState<Record<string, boolean>>({});

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/products?${params.toString()}`);
  };

  const toggleFacet = (facetSlug: string, valueSlug: string) => {
    const facetKey = `${facetSlug}:${valueSlug}`;
    const newFacets = currentFacetsList.includes(facetKey)
      ? currentFacetsList.filter(f => f !== facetKey)
      : [...currentFacetsList, facetKey];

    updateFilter('facets', newFacets.length > 0 ? newFacets.join(',') : null);
  };

  const hasFilters = currentSearch || currentBrand || currentPetTypeId || currentCategory || currentStock || currentFacetsRaw;

  // Build active filters list for pills
  const activeFilters = [];
  if (currentSearch) activeFilters.push({ key: 'search', label: `Search: ${currentSearch}`, value: null });
  if (currentStock) {
    const labels: Record<string, string> = { in_stock: 'In Stock', out_of_stock: 'Out of Stock', pre_order: 'Pre-Order' };
    activeFilters.push({ key: 'stock', label: labels[currentStock] || currentStock, value: null });
  }
  if (currentCategory) activeFilters.push({ key: 'category', label: `Category: ${currentCategory}`, value: null });
  if (currentBrand) {
    const brandName = brands.find(b => b.slug === currentBrand)?.name || currentBrand;
    activeFilters.push({ key: 'brand', label: `Brand: ${brandName}`, value: null });
  }
  if (currentPetTypeId) {
    const petName = petTypes.find(p => p.id === currentPetTypeId)?.name || 'Pet';
    activeFilters.push({ key: 'petTypeId', label: `Pet: ${petName}`, value: null });
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
    } else {
      updateFilter(key, null);
    }
  };

  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()));
  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  const filteredPetTypes = petTypes.filter(p => p.name.toLowerCase().includes(petTypeSearch.toLowerCase()));

  return (
    <div className="flex flex-col h-full lg:max-h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between pb-4 border-b shrink-0">
        <h2 className="text-xl font-bold text-zinc-900">Filters</h2>
        {hasFilters && (
          <Button variant="link" size="sm" onClick={() => router.push('/products')} className="h-auto p-0 text-primary">
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filters Pills */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-4 shrink-0">
          {activeFilters.map((filter, index) => (
            <div
              key={`${filter.key}-${index}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-[11px] font-bold text-zinc-600 hover:bg-zinc-200 transition-colors cursor-default"
            >
              <span className="capitalize">{filter.label}</span>
              <button
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
        <Accordion type="multiple" className="w-full">

          {/* Availability */}
          <AccordionItem value="stock" className="border-none">
            <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">Availability</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-1 pb-4">
              {[
                { id: 'in_stock', label: 'In Stock' },
                { id: 'out_of_stock', label: 'Out of Stock' },
                { id: 'pre_order', label: 'Pre-Order' }
              ].map((status) => (
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
            </AccordionContent>
          </AccordionItem>

          {/* Categories */}
          {categories.length > 0 && (
            <AccordionItem value="category" className="border-t border-zinc-100">
              <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">Category</AccordionTrigger>
              <AccordionContent className="pt-1 pb-4">
                {categories.length > 10 && (
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
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {(expandedFacets['category'] ? filteredCategories : filteredCategories.slice(0, 8)).map((category) => {
                    const slug = category.slug || category.name.toLowerCase();
                    return (
                      <div key={category.id} className="flex items-center space-x-3">
                        <Checkbox
                          id={`cat-${category.id}`}
                          checked={currentCategory === slug}
                          onCheckedChange={(checked) => updateFilter('category', checked ? slug : null)}
                        />
                        <Label htmlFor={`cat-${category.id}`} className="text-sm font-medium cursor-pointer leading-none">
                          {category.name}
                        </Label>
                      </div>
                    );
                  })}
                  {filteredCategories.length > 8 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary font-bold hover:bg-transparent"
                      onClick={() => setExpandedFacets(prev => ({ ...prev, category: !prev.category }))}
                    >
                      {expandedFacets['category'] ? 'Show Less' : `+ Show ${filteredCategories.length - 8} More`}
                    </Button>
                  )}
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
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {(expandedFacets['petType'] ? filteredPetTypes : filteredPetTypes.slice(0, 8)).map((pet) => (
                    <div key={pet.id} className="flex items-center space-x-3">
                      <Checkbox
                        id={`pet-${pet.id}`}
                        checked={currentPetTypeId === pet.id}
                        onCheckedChange={(checked) => updateFilter('petTypeId', checked ? pet.id : null)}
                      />
                      <Label htmlFor={`pet-${pet.id}`} className="text-sm font-medium cursor-pointer leading-none">
                        {pet.name}
                      </Label>
                    </div>
                  ))}
                  {filteredPetTypes.length > 8 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary font-bold hover:bg-transparent"
                      onClick={() => setExpandedFacets(prev => ({ ...prev, petType: !prev.petType }))}
                    >
                      {expandedFacets['petType'] ? 'Show Less' : `+ Show ${filteredPetTypes.length - 8} More`}
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Brand */}
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
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {(expandedFacets['brand'] ? filteredBrands : filteredBrands.slice(0, 8)).map((brand) => (
                  <div key={brand.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={`brand-${brand.id}`}
                      checked={currentBrand === brand.slug}
                      onCheckedChange={(checked) => updateFilter('brand', checked ? brand.slug : null)}
                    />
                    <Label htmlFor={`brand-${brand.id}`} className="text-sm font-medium cursor-pointer leading-none">
                      {brand.name}
                    </Label>
                  </div>
                ))}
                {filteredBrands.length > 8 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary font-bold hover:bg-transparent"
                    onClick={() => setExpandedFacets(prev => ({ ...prev, brand: !prev.brand }))}
                  >
                    {expandedFacets['brand'] ? 'Show Less' : `+ Show ${filteredBrands.length - 8} More`}
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Dynamic Schema Facets */}
          {dynamicFacets.map((facet) => {
            const facetSearch = facetSearches[facet.slug] || '';
            const filteredValues = facet.values.filter(v => v.value.toLowerCase().includes(facetSearch.toLowerCase()));
            const isExpanded = expandedFacets[facet.slug];
            const displayedValues = isExpanded ? filteredValues : filteredValues.slice(0, 6);

            return (
              <AccordionItem key={facet.id} value={facet.slug} className="border-t border-zinc-100">
                <AccordionTrigger className="text-sm font-bold hover:no-underline py-3">
                  {facet.name.replace(/_/g, ' ')}
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
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {displayedValues.map((val) => {
                      const isChecked = currentFacetsList.includes(`${facet.slug}:${val.slug}`);
                      return (
                        <div key={val.id} className="flex items-center space-x-3">
                          <Checkbox
                            id={`facet-${val.id}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleFacet(facet.slug, val.slug)}
                          />
                          <Label htmlFor={`facet-${val.id}`} className="text-sm font-medium cursor-pointer leading-none">
                            {val.value}
                          </Label>
                        </div>
                      );
                    })}
                    {filteredValues.length > 6 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-xs text-primary font-bold hover:bg-transparent"
                        onClick={() => setExpandedFacets(prev => ({ ...prev, [facet.slug]: !prev[facet.slug] }))}
                      >
                        {isExpanded ? 'Show Less' : `+ Show ${filteredValues.length - 6} More`}
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