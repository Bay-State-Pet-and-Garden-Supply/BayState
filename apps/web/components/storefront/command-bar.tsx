'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CommandBarProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * CommandBar - Standard search with keyboard navigation.
 * Mobile only (md:hidden).
 */
export function CommandBar({ isOpen, onClose }: CommandBarProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure transitions don't mess up focus
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleFullSearch = useCallback(() => {
    if (query.trim()) {
      router.push(`/products?search=${encodeURIComponent(query.trim())}`);
      onClose();
    }
  }, [query, router, onClose]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleFullSearch();
          break;
        case 'Escape':
          onClose();
          break;
      }
    },
    [handleFullSearch, onClose]
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleFullSearch();
          }}
        >
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
              className="flex-1 border-0 bg-transparent px-4 py-4 text-lg focus-visible:ring-0 shadow-none"
            />
            <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
             <span className="text-zinc-500">Press enter to search</span>
             <Button type="submit" size="sm" className="bg-primary text-white">
               Search
             </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
