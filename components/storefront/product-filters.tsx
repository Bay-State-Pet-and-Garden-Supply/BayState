'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { type Brand } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface PetType {
  id: string;
  name: string;
}

interface ProductFiltersProps {
  brands: Brand[];
  petTypes: PetType[];
}

/**
 * ProductFilters - Sidebar filters for product listing.
 */
export function ProductFilters({ brands, petTypes }: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get('search') || '';
  const currentBrand = searchParams.get('brand') || '';
  const currentPetType = searchParams.get('petType') || '';
  const currentStock = searchParams.get('stock') || '';
  const currentMinPrice = searchParams.get('minPrice') || '';
  const currentMaxPrice = searchParams.get('maxPrice') || '';

  const [searchQuery, setSearchQuery] = useState(currentSearch);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // Reset to page 1 on filter change
    router.push(`/products?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter('search', searchQuery.trim());
  };

  const clearSearch = () => {
    setSearchQuery('');
    updateFilter('search', '');
  };

  const clearFilters = () => {
    setSearchQuery('');
    router.push('/products');
  };

  const hasFilters = currentSearch || currentBrand || currentPetType || currentStock || currentMinPrice || currentMaxPrice;

  return (
    <div className="space-y-6 rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900">Filters</h2>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div>
        <Label className="text-sm font-medium">Search Products</Label>
        <form onSubmit={handleSearchSubmit} className="mt-2">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-16"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={clearSearch}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button type="submit" variant="ghost" size="icon" className="h-7 w-7" aria-label="Search">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>
        {currentSearch && (
          <p className="mt-1 text-xs text-zinc-700">
            Showing results for &quot;{currentSearch}&quot;
          </p>
        )}
      </div>

      {/* Brand Filter */}
      <div>
        <Label htmlFor="brand-filter" className="text-sm font-medium">Brand</Label>
        <select
          id="brand-filter"
          value={currentBrand}
          onChange={(e) => updateFilter('brand', e.target.value)}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Brands</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {/* Pet Type Filter */}
      <div>
        <Label htmlFor="pet-type-filter" className="text-sm font-medium">Pet Type</Label>
        <select
          id="pet-type-filter"
          value={currentPetType}
          onChange={(e) => updateFilter('petType', e.target.value)}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Pets</option>
          {petTypes.map((petType) => (
            <option key={petType.id} value={petType.id}>
              {petType.name}
            </option>
          ))}
        </select>
      </div>

      {/* Stock Status Filter */}
      <div>
        <Label htmlFor="stock-filter" className="text-sm font-medium">Availability</Label>
        <select
          id="stock-filter"
          value={currentStock}
          onChange={(e) => updateFilter('stock', e.target.value)}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Items</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="pre_order">Pre-Order</option>
        </select>
      </div>

      {/* Price Range */}
      <div>
        <Label className="text-sm font-medium">Price Range</Label>
        <div className="mt-2 flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={currentMinPrice}
            onChange={(e) => updateFilter('minPrice', e.target.value)}
            className="w-full"
          />
          <Input
            type="number"
            placeholder="Max"
            value={currentMaxPrice}
            onChange={(e) => updateFilter('maxPrice', e.target.value)}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
