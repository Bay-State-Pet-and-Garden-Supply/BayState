'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Search, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { BrandModal } from '@/components/admin/brands/BrandModal';
import type { Brand } from '@/components/admin/brands/types';
import { adminFetch } from '@/lib/admin/api-client';

export type BrandPickerOption = Brand;

interface BrandPickerProps {
 value: BrandPickerOption | null;
 onAssign: (brand: BrandPickerOption | null) => Promise<void>;
 className?: string;
 triggerClassName?: string;
 emptyLabel?: string;
}

function slugifyBrandName(value: string): string {
 return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isBrandConfigured(brand: BrandPickerOption): boolean {
 const officialDomains = brand.official_domains ?? [];
 const preferredDomains = brand.preferred_domains ?? [];

 return Boolean(
 officialDomains.length > 0
 || preferredDomains.length > 0
 );
}

export function BrandPicker({
 value,
 onAssign,
 className,
 triggerClassName,
 emptyLabel = 'Assign Brand',
}: BrandPickerProps) {
 const [open, setOpen] = useState(false);
 const [brands, setBrands] = useState<BrandPickerOption[]>([]);
 const [loadingBrands, setLoadingBrands] = useState(false);
 const [search, setSearch] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [createName, setCreateName] = useState<string | null>(null);

 const fetchBrands = useCallback(async () => {
 setLoadingBrands(true);
 try {
 const response = await adminFetch('/api/admin/brands');
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

 const id = window.setTimeout(() => {
 void fetchBrands();
 }, 0);

 return () => window.clearTimeout(id);
 }, [fetchBrands, open]);

 const filteredBrands = useMemo(() => {
 const query = search.trim().toLowerCase();
 if (!query) {
 return brands;
 }

 return brands.filter((brand) => {
 return `${brand.name} ${brand.slug}`.toLowerCase().includes(query);
 });
 }, [brands, search]);

 const exactMatch = useMemo(() => {
 const query = search.trim().toLowerCase();
 if (!query) {
 return false;
 }

 return brands.some((brand) => brand.name.toLowerCase() === query || brand.slug.toLowerCase() === slugifyBrandName(query));
 }, [brands, search]);

 const assignBrand = useCallback(async (brand: BrandPickerOption | null) => {
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
 const hasConfiguredDomains = Boolean((value?.official_domains?.length ?? 0) > 0 || (value?.preferred_domains?.length ?? 0) > 0);

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
 'justify-between gap-2 rounded-none border border-border ',
 value
 ? hasConfiguredDomains
 ? 'bg-brand-forest-green/10 text-brand-forest-green hover:bg-brand-forest-green/20'
 : 'bg-brand-gold/10 text-brand-burgundy hover:bg-brand-gold/20 border-brand-gold'
 : 'border-dashed text-muted-foreground hover:border-brand-forest-green hover:text-brand-forest-green hover:bg-brand-forest-green/5',
 triggerClassName,
 )}
 disabled={isSubmitting}
 >
 <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
 <Tag className="h-3.5 w-3.5 shrink-0" />
 <span className="truncate text-xs font-semibold">{selectedLabel}</span>
 {value && (
 <span className={cn(
 'hidden rounded-none border px-1 py-0 text-[9px] font-semibold md:inline-flex',
 hasConfiguredDomains
 ? 'border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green'
 : 'border-brand-gold bg-brand-gold/10 text-brand-burgundy'
 )}>
 {hasConfiguredDomains ? 'Configured' : 'Needs Domains'}
 </span>
 )}
 </span>
 <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-[360px] p-0 rounded-none border-2 border-border bg-card" align="start">
 <div className="flex flex-col">
 <div className="flex items-center border-b-2 border-border px-3 py-2 bg-muted">
 <Search className="mr-2 h-4 w-4 shrink-0 text-foreground" />
 <input
 className="flex h-8 w-full bg-transparent text-xs font-medium outline-none placeholder:text-zinc-400"
 placeholder="Search brands..."
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 />
 </div>
 <div className="max-h-72 overflow-y-auto">
 {value && (
 <button
 type="button"
 className="flex w-full items-center px-4 py-2 text-left text-[10px] font-semibold text-brand-burgundy hover:bg-brand-burgundy/5 border-b border-zinc-100"
 onClick={() => void assignBrand(null)}
 disabled={isSubmitting}
 >
 <X className="mr-2 h-3.5 w-3.5" />
 Clear brand assignment
 </button>
 )}
 {loadingBrands ? (
 <div className="p-8 text-center">
 <div className="animate-spin inline-block w-4 h-4 border-2 border-border border-t-transparent mb-2"></div>
 <div className="text-[10px] font-semibold text-zinc-500">Loading...</div>
 </div>
 ) : filteredBrands.length > 0 ? (
 <div className="divide-y divide-border">
 {filteredBrands.map((brand) => {
 const selected = value?.id === brand.id;
 const configured = isBrandConfigured(brand);
 return (
 <button
 key={brand.id}
 type="button"
 className={cn(
 'flex w-full items-start px-4 py-3 text-left hover:bg-muted transition-colors',
 selected && 'bg-muted'
 )}
 onClick={() => void assignBrand(brand)}
 disabled={isSubmitting}
 >
 <Check className={cn('mr-3 mt-0.5 h-4 w-4 shrink-0 text-foreground', selected ? 'opacity-100' : 'opacity-0')} />
 <span className="flex min-w-0 flex-1 flex-col gap-0.5">
 <span className="flex items-center gap-2">
 <span className="truncate text-xs font-semibold text-foreground">{brand.name}</span>
 <span className={cn(
 'rounded-none border px-1 py-0 text-[8px] font-semibold',
 configured
 ? 'border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green'
 : 'border-brand-burgundy bg-brand-burgundy/10 text-brand-burgundy'
 )}>
 {configured ? 'Config' : 'Needs Site'}
 </span>
 </span>
 <span className="truncate text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{brand.slug}</span>
 {brand.official_domains && brand.official_domains.length > 0 && (
 <span className="truncate text-[9px] italic text-muted-foreground">{brand.official_domains[0]}</span>
 )}
 </span>
 </button>
 );
 })}
 </div>
 ) : (
 <div className="p-8 text-center text-[10px] font-semibold text-muted-foreground">No brands found.</div>
 )}
 </div>
 {search.trim() && !exactMatch && (
 <div className="border-t-2 border-border p-2 bg-muted">
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="w-full justify-start text-[10px] font-semibold hover:bg-accent hover:text-accent-foreground rounded-none border border-transparent hover:border-border transition-all"
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
