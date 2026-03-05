'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Package, Wrench, Tag } from 'lucide-react';
import Fuse from 'fuse.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';

interface SearchResult {
  type: 'product' | 'service' | 'brand';
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
}

interface CommandBarProps {
  searchIndex: Fuse<unknown> | null;
  isOpen: boolean;
  onClose: () => void;
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

/**
 * CommandBar - Intelligent fuzzy search with keyboard navigation.
 * Mobile only (md:hidden).
 */
export function CommandBar({ searchIndex, isOpen, onClose }: CommandBarProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Derive search results using useMemo instead of useEffect + setState
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

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure transitions don't mess up focus
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Ensure selectedIndex stays within bounds
  const boundedSelectedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  const navigateToResult = useCallback((result: SearchResult) => {
    const paths = {
      product: `/products/${result.slug}`,
      service: `/services/${result.slug}`,
      brand: `/products?brand=${result.slug}`,
    };
    router.push(paths[result.type]);
    onClose();
    setQuery('');
  }, [router, onClose]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
          onClose();
          break;
      }
    },
    [results, boundedSelectedIndex, onClose, navigateToResult]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Command Bar */}
      <div className="relative w-full max-w-xl mx-4 rounded-xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Search Input */}
        <div className="flex items-center border-b px-4">
          <Search className="h-5 w-5 text-zinc-700" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search products, services..."
            aria-label="Search products, services, and brands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border-0 bg-transparent px-4 py-4 text-lg focus-visible:ring-0"
          />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-[60vh] overflow-y-auto p-2">
            {results.map((result, index) => {
              const Icon = typeIcons[result.type];
              const isSelected = index === boundedSelectedIndex;

              return (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    className={cn(
                        "flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"
                    )}
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                      <Icon className="h-5 w-5 text-zinc-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900 truncate">
                          {result.name}
                        </span>
                        <span className="text-xs text-zinc-700 border border-zinc-200 px-1 rounded bg-zinc-50 uppercase tracking-wider scale-90 origin-left">
                          {typeLabels[result.type]}
                        </span>
                      </div>
                      {result.description && (
                        <p className="text-sm text-zinc-700 truncate">
                          {result.description}
                        </p>
                      )}
                    </div>
                    {result.price && (
                      <span className="text-sm font-medium text-zinc-900">
                        {formatCurrency(result.price)}
                      </span>
                    )}
                      <ArrowRight className="h-4 w-4 text-zinc-700" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Empty state */}
        {query.length >= 2 && results.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-zinc-700">No results found for &quot;{query}&quot;</p>
            <p className="mt-2 text-sm text-zinc-700">
              Try a different search term
            </p>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="flex items-center justify-center gap-4 border-t px-4 py-2 text-xs text-zinc-700">
          <span>
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5">Enter</kbd> Select
          </span>
          <span>
            <kbd className="rounded bg-zinc-100 px-1.5 py-0.5">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
