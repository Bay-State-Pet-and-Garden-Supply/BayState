'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSearch } from '@/components/storefront/search-provider';

export function InlineSearch() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFullSearch = useCallback(() => {
    if (query.trim()) {
      router.push(`/products?search=${encodeURIComponent(query.trim())}`);
    }
  }, [query, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleFullSearch();
          break;
        case 'Escape':
            e.preventDefault();
            inputRef.current?.blur();
            break;
      }
    },
    [handleFullSearch]
  );

  return (
    <div className="relative z-50 flex-1 w-full max-w-xl">
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
            placeholder="Search products or brands..."
            aria-label="Search"
            className="pl-10 pr-24 h-11 bg-white text-zinc-900 border-2 border-zinc-200 focus:border-primary/50 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20 rounded-lg text-base transition-all"
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
    </div>
  );
}
