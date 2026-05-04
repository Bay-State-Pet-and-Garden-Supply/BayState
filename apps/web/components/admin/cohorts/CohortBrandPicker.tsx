'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Search, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { BrandModal } from '@/components/admin/brands/BrandModal';
import type { Brand } from '@/components/admin/brands/types';

export type CohortBrandOption = Brand;

interface CohortBrandPickerProps {
  value: CohortBrandOption | null;
  onAssign: (brand: CohortBrandOption | null) => Promise<void>;
  className?: string;
  triggerClassName?: string;
  emptyLabel?: string;
}

function slugifyBrandName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isBrandConfigured(brand: CohortBrandOption): boolean {
  const officialDomains = brand.official_domains ?? [];
  const preferredDomains = brand.preferred_domains ?? [];

  return Boolean(
    (brand.website_url && brand.website_url.trim())
      || officialDomains.length > 0
      || preferredDomains.length > 0
  );
}

export function CohortBrandPicker({
  value,
  onAssign,
  className,
  triggerClassName,
  emptyLabel = 'Assign Brand',
}: CohortBrandPickerProps) {
  const [open, setOpen] = useState(false);
  const [brands, setBrands] = useState<CohortBrandOption[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createName, setCreateName] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    setLoadingBrands(true);
    try {
      const response = await fetch('/api/admin/brands');
      if (!response.ok) {
        throw new Error('Failed to load brands');
      }

      const data = await response.json();
      setBrands(Array.isArray(data.brands) ? data.brands : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load brands');
    } finally {
      setLoadingBrands(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    void fetchBrands();
  }, [fetchBrands, open]);

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return brands;
    }

    return brands.filter((brand) => {
      return `${brand.name} ${brand.slug} ${brand.website_url ?? ''}`.toLowerCase().includes(query);
    });
  }, [brands, search]);

  const exactMatch = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return false;
    }

    return brands.some((brand) => brand.name.toLowerCase() === query || brand.slug.toLowerCase() === slugifyBrandName(query));
  }, [brands, search]);

  const assignBrand = useCallback(async (brand: CohortBrandOption | null) => {
    setIsSubmitting(true);
    try {
      await onAssign(brand);
      setOpen(false);
      setSearch('');
    } finally {
      setIsSubmitting(false);
    }
  }, [onAssign]);

  const createBrand = useCallback((name: string) => {
    setCreateName(name.trim());
  }, []);

  const selectedLabel = value?.name ?? emptyLabel;
  const hasWebsite = Boolean(value?.website_url && value.website_url.trim());
  const selectedConfigured = value ? isBrandConfigured(value) : false;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearch('');
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'justify-between gap-2 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]',
              value
                ? hasWebsite
                  ? 'bg-brand-forest-green/10 text-brand-forest-green hover:bg-brand-forest-green/20'
                  : 'bg-brand-gold/10 text-brand-burgundy hover:bg-brand-gold/20 border-brand-gold'
                : 'border-dashed text-muted-foreground hover:border-brand-forest-green hover:text-brand-forest-green hover:bg-brand-forest-green/5',
              triggerClassName,
            )}
            disabled={isSubmitting}
          >
            <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-xs font-black uppercase tracking-tight">{selectedLabel}</span>
              {value && (
                <span className={cn(
                  'hidden rounded-none border px-1 py-0 text-[9px] font-black uppercase md:inline-flex',
                  hasWebsite
                    ? 'border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green'
                    : 'border-brand-gold bg-brand-gold/10 text-brand-burgundy'
                )}>
                  {hasWebsite ? 'Configured' : 'Needs Site'}
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0 rounded-none border-2 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white" align="start">
          <div className="flex flex-col">
            <div className="flex items-center border-b-2 border-zinc-900 px-3 py-2 bg-zinc-50">
              <Search className="mr-2 h-4 w-4 shrink-0 text-zinc-900" />
              <input
                className="flex h-8 w-full bg-transparent text-xs font-bold uppercase tracking-tight outline-none placeholder:text-zinc-400"
                placeholder="Search brands..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {value && (
                <button
                  type="button"
                  className="flex w-full items-center px-4 py-2 text-left text-[10px] font-black uppercase text-brand-burgundy hover:bg-brand-burgundy/5 border-b border-zinc-100"
                  onClick={() => void assignBrand(null)}
                  disabled={isSubmitting}
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  Clear brand assignment
                </button>
              )}
              {loadingBrands ? (
                <div className="p-8 text-center">
                  <div className="animate-spin inline-block w-4 h-4 border-2 border-zinc-900 border-t-transparent mb-2"></div>
                  <div className="text-[10px] font-black uppercase text-zinc-500">Loading...</div>
                </div>
              ) : filteredBrands.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {filteredBrands.map((brand) => {
                    const selected = value?.id === brand.id;
                    const configured = isBrandConfigured(brand);
                    return (
                      <button
                        key={brand.id}
                        type="button"
                        className={cn(
                          'flex w-full items-start px-4 py-3 text-left hover:bg-zinc-50 transition-colors',
                          selected && 'bg-zinc-50'
                        )}
                        onClick={() => void assignBrand(brand)}
                        disabled={isSubmitting}
                      >
                        <Check className={cn('mr-3 mt-0.5 h-4 w-4 shrink-0 text-zinc-900', selected ? 'opacity-100' : 'opacity-0')} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-black uppercase tracking-tight text-zinc-900">{brand.name}</span>
                            <span className={cn(
                              'rounded-none border px-1 py-0 text-[8px] font-black uppercase',
                              configured
                                ? 'border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green'
                                : 'border-brand-burgundy bg-brand-burgundy/10 text-brand-burgundy'
                            )}>
                              {configured ? 'Config' : 'Needs Site'}
                            </span>
                          </span>
                          <span className="truncate text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{brand.slug}</span>
                          {brand.website_url && (
                            <span className="truncate text-[9px] italic text-zinc-500">{brand.website_url}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-[10px] font-black uppercase text-zinc-400">No brands found.</div>
              )}
            </div>
            {search.trim() && !exactMatch && (
              <div className="border-t-2 border-zinc-900 p-2 bg-zinc-50">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[10px] font-black uppercase tracking-tight hover:bg-zinc-900 hover:text-white rounded-none border border-transparent hover:border-zinc-900 transition-all"
                  onClick={() => createBrand(search.trim())}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create brand &quot;{search.trim()}&quot;
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {createName && (
        <BrandModal
          initialName={createName}
          onClose={() => setCreateName(null)}
          onSave={(createdBrand) => {
            setCreateName(null);
            if (createdBrand) {
              setBrands((previous) => {
                const withoutDuplicate = previous.filter((brand) => brand.id !== createdBrand.id);
                return [...withoutDuplicate, createdBrand].sort((left, right) => left.name.localeCompare(right.name));
              });
              void assignBrand(createdBrand);
            } else {
              void fetchBrands();
            }
          }}
        />
      )}
    </>
  );
}
