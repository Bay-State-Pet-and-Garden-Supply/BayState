'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Package, Wrench, Tag } from 'lucide-react';
import Fuse from 'fuse.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import { useSearch } from '@/components/storefront/search-provider';

interface SearchResult {
  type: 'product' | 'service' | 'brand';
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}

const typeIcons = {
  product: Package,
  service: Wrench,
  brand: Tag,
};

const typeLabels = {
  product: 'Product',
  service: 'Service',
  brand: 'Brand',
};

export function InlineSearch() {
  const { searchIndex, isOpen, openSearch, closeSearch } = useSearch();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isOpen) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
         closeSearch();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeSearch]);

  // Derive search results
  const results = useMemo<SearchResult[]>(() => {
    if (!searchIndex || query.length < 2) {
      return [];
    }

    const searchResults = searchIndex.search(query, { limit: 6 });
    return searchResults.map((r) => {
      const item = r.item as SearchResult;
      return {
        type: item.type,
        id: item.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        price: item.price,
        imageUrl: item.imageUrl,
      };
    });
  }, [query, searchIndex]);

  const boundedSelectedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  const navigateToResult = useCallback((result: SearchResult) => {
    const paths = {
      product: `/products/${result.slug}`,
      service: `/services/${result.slug}`,
      brand: `/products?brand=${result.slug}`,
    };
    router.push(paths[result.type]);
    closeSearch();
    setQuery('');
  }, [router, closeSearch]);

  const handleFullSearch = useCallback(() => {
    if (query.trim()) {
      router.push(`/products?search=${encodeURIComponent(query.trim())}`);
      closeSearch();
      setQuery('');
    }
  }, [query, router, closeSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          // If we have a result highlighted, go to it. Otherwise do a full search.
          if (results.length > 0 && selectedIndex < results.length) {
            navigateToResult(results[boundedSelectedIndex]);
          } else {
            handleFullSearch();
          }
          break;
        case 'Escape':
            e.preventDefault();
            closeSearch();
            inputRef.current?.blur();
            break;
      }
    },
    [isOpen, results, boundedSelectedIndex, navigateToResult, closeSearch, handleFullSearch, selectedIndex]
  );

  return (
    <div ref={containerRef} className="relative z-50 flex-1">
      <div 
        className={cn(
            "flex items-center transition-all duration-300 ease-in-out relative origin-left",
            isOpen ? "w-full max-w-xl" : "w-11"
        )}
      >
        {isOpen ? (
            <form 
              className="relative w-full" 
              onSubmit={(e) => {
                e.preventDefault();
                handleFullSearch();
              }}
            >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search products, brands, or services..."
                    aria-label="Search"
                    className="pl-10 pr-24 h-11 bg-white text-zinc-900 border-none shadow-lg focus-visible:ring-2 focus-visible:ring-primary/20 rounded-lg text-base"
                  />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {query && (
                    <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 text-zinc-400 hover:text-zinc-600"
                        onClick={() => setQuery('')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button 
                    type="submit"
                    className="h-9 px-3 text-xs bg-primary text-white hover:bg-primary/90 rounded-md"
                  >
                    Search
                  </Button>
                </div>
            </form>
        ) : (
            <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-white hover:bg-white/20"
                onClick={openSearch}
                aria-label="Open search"
            >
                <Search className="h-5 w-5" />
            </Button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          {results.length > 0 ? (
            <>
              <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Suggestions</span>
                <span className="text-[10px] font-bold text-zinc-400">{results.length} found</span>
              </div>
              <ul>
                {results.map((result, index) => {
                  const Icon = typeIcons[result.type];
                  const isSelected = index === boundedSelectedIndex;

                  return (
                    <li key={`${result.type}-${result.id}`}>
                      <button
                        className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-primary/5" : "hover:bg-zinc-50"
                        )}
                        onClick={() => navigateToResult(result)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className={cn(
                          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border",
                          isSelected ? "bg-white border-primary/20" : "bg-zinc-100 border-transparent"
                        )}>
                          <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-zinc-500")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("font-bold text-sm truncate", isSelected ? "text-primary" : "text-zinc-900")}>
                              {result.name}
                            </span>
                            <span className="text-[9px] uppercase tracking-tighter font-black text-zinc-400 border border-zinc-200 px-1 rounded">
                              {typeLabels[result.type]}
                            </span>
                          </div>
                          {result.description && (
                            <p className="text-xs text-zinc-500 truncate mt-0.5">
                              {result.description}
                            </p>
                          )}
                        </div>
                        {result.price && (
                          <span className="text-sm font-black text-zinc-900 whitespace-nowrap bg-zinc-100 px-2 py-1 rounded">
                            {formatCurrency(result.price)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button 
                onClick={handleFullSearch}
                className="w-full py-3 bg-primary text-white text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                See all results for &quot;{query}&quot;
                <ArrowRight className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div className="p-8 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 mb-3">
                <Search className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-sm font-bold text-zinc-900">No instant matches</p>
              <p className="text-xs text-zinc-500 mb-4">But we might still have it!</p>
              <Button size="sm" onClick={handleFullSearch} className="rounded-full px-6">
                Try Full Search
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
