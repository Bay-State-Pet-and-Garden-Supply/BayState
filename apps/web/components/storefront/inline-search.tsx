'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSearch } from '@/components/storefront/search-provider';

export function InlineSearch() {
  const { isOpen, openSearch, closeSearch } = useSearch();
  const [query, setQuery] = useState('');
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

  const handleFullSearch = useCallback(() => {
    if (query.trim()) {
      router.push(`/products?search=${encodeURIComponent(query.trim())}`);
      closeSearch();
    }
  }, [query, router, closeSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleFullSearch();
          break;
        case 'Escape':
            e.preventDefault();
            closeSearch();
            inputRef.current?.blur();
            break;
      }
    },
    [isOpen, closeSearch, handleFullSearch]
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
    </div>
  );
}
