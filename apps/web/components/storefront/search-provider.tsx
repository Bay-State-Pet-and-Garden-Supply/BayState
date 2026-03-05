'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import Fuse from 'fuse.js';
import { CommandBar } from '@/components/storefront/command-bar';

interface SearchContextType {
  searchIndex: Fuse<unknown> | null;
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}

interface SearchProviderProps {
  children: ReactNode;
  initialData?: {
    products: Array<{ id: string; name: string; slug: string; description?: string | null; price: number; images?: string[]; brand?: { name: string } | null }>;
    services: Array<{ id: string; name: string; slug: string; description?: string | null; price?: number | null }>;
    brands: Array<{ id: string; name: string; slug: string; logo_url?: string | null }>;
  };
}

/**
 * SearchProvider - Provides search functionality across the storefront.
 */
export function SearchProvider({ children, initialData }: SearchProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Build search index from initial data
  const searchIndex = useMemo(() => {
    if (!initialData) return null;

    const searchableItems = [
      ...(initialData.products || []).map((p) => ({
        type: 'product' as const,
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        imageUrl: p.images?.[0] || null,
        brandName: p.brand?.name || null,
      })),
      ...(initialData.services || []).map((s) => ({
        type: 'service' as const,
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        price: s.price,
      })),
      ...(initialData.brands || []).map((b) => ({
        type: 'brand' as const,
        id: b.id,
        name: b.name,
        slug: b.slug,
        imageUrl: b.logo_url || null,
      })),
    ];

    return new Fuse(searchableItems, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'description', weight: 1 },
        { name: 'brandName', weight: 1.5 },
      ],
      threshold: 0.4,
      distance: 100,
      includeScore: true,
      minMatchCharLength: 2,
    });
  }, [initialData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => setIsOpen(false), []);

  return (
    <SearchContext.Provider value={{ searchIndex, isOpen, openSearch, closeSearch }}>
      {children}
      <CommandBar searchIndex={searchIndex} isOpen={isOpen} onClose={closeSearch} />
    </SearchContext.Provider>
  );
}
