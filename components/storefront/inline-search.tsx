'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Package, Wrench, Tag } from 'lucide-react';
import Fuse from 'fuse.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
        // Small delay to ensure input is rendered and transition started
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle click outside if open
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

    const searchResults = searchIndex.search(query, { limit: 8 });
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
          if (results[boundedSelectedIndex]) {
            navigateToResult(results[boundedSelectedIndex]);
          }
          break;
        case 'Escape':
            e.preventDefault();
            closeSearch();
            // Optional: clear query on close?
            // setQuery(''); 
            inputRef.current?.blur();
            break;
      }
    },
    [isOpen, results, boundedSelectedIndex, navigateToResult, closeSearch]
  );

  return (
    <div ref={containerRef} className="relative z-50">
      <div 
        className={cn(
            "flex items-center transition-all duration-300 ease-in-out relative",
            isOpen ? "w-[280px]" : "w-11"
        )}
      >
        {isOpen ? (
            <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-700 pointer-events-none" />
<Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search..."
                    aria-label="Search products, services, and brands"
                    className="pl-10 pr-10 h-10 bg-white text-zinc-900 border-none shadow-sm focus-visible:ring-2 focus-visible:ring-white/20"
                    autoFocus
                  />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-zinc-700 hover:text-zinc-700 hover:bg-zinc-100"
                    onClick={() => { 
                        setQuery(''); 
                        closeSearch(); 
                    }}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        ) : (
            <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-white hover:bg-white/20"
                onClick={openSearch}
                aria-label="Search"
            >
                <Search className="h-5 w-5" />
            </Button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.length >= 2 && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-zinc-200 max-h-[70vh] overflow-auto z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <ul className="py-1">
            {results.map((result, index) => {
              const Icon = typeIcons[result.type];
              const isSelected = index === boundedSelectedIndex;

              return (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"
                    )}
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-zinc-100">
                      <Icon className="h-4 w-4 text-zinc-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-zinc-900 truncate">
                          {result.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-700 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-100">
                          {typeLabels[result.type]}
                        </span>
                      </div>
                      {result.description && (
                        <p className="text-xs text-zinc-700 truncate mt-0.5">
                          {result.description}
                        </p>
                      )}
                    </div>
                    {result.price && (
                      <span className="text-sm font-medium text-zinc-900 whitespace-nowrap">
                        ${result.price.toFixed(2)}
                      </span>
                    )}
                      <ArrowRight className="h-3 w-3 text-zinc-700 ml-2" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-zinc-100 px-3 py-1.5 bg-zinc-50 text-[10px] text-zinc-700 flex justify-between items-center rounded-b-lg">
             <span>Press <kbd className="font-sans border border-zinc-200 rounded px-1 bg-white">↵</kbd> to select</span>
             <span><kbd className="font-sans border border-zinc-200 rounded px-1 bg-white">esc</kbd> to close</span>
          </div>
        </div>
      )}

       {/* Empty state */}
       {isOpen && query.length >= 2 && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-zinc-200 p-6 text-center z-[100]">
            <p className="text-sm text-zinc-700">No results found for &quot;{query}&quot;</p>
          </div>
        )}
    </div>
  );
}
