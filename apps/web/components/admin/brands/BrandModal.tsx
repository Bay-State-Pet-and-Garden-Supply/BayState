'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Tag, Loader2, Pin, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
    createBrand,
    updateBrand,
    getAvailableScraperConfigsAction,
    getBrandScraperMappingsAction,
    updateBrandScraperMappings,
} from '@/app/admin/brands/actions';
import type { Brand } from '@/components/admin/brands/types';
import { AlertBanner } from '@/components/admin/pipeline/AlertBanner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

const brandSchema = z.object({
    name: z.string().min(1, 'Brand name is required').max(100, 'Name is too long'),
    slug: z.string().min(1, 'Slug is required').max(100, 'Slug is too long')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens'),
    logo_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
    description: z.string().max(500, 'Description is too long').optional(),
    official_domains: z.string().optional(),
    preferred_domains: z.string().optional(),
});

type BrandFormValues = z.infer<typeof brandSchema>;

interface ScraperOption {
    id: string;
    slug: string;
    name: string;
    display_name: string;
}

interface MappingFormValue {
    scraperConfigId: string;
    priority: number;
    notes: string;
    isActive: boolean;
}

interface BrandModalProps {
    brand?: Brand;
    onClose: () => void;
    onSave: (brand?: Brand) => void;
    initialName?: string;
}

export function BrandModal({
    brand,
    onClose,
    onSave,
    initialName,
}: BrandModalProps) {
    const [serverError, setServerError] = useState<string | null>(null);
    const [availableScrapers, setAvailableScrapers] = useState<ScraperOption[]>([]);
    const [scraperMappings, setScraperMappings] = useState<MappingFormValue[]>([]);
    const [scrapersLoading, setScrapersLoading] = useState(false);
    const [scrapersError, setScrapersError] = useState<string | null>(null);
    const isEditing = !!brand;

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<BrandFormValues>({
        resolver: zodResolver(brandSchema),
        defaultValues: {
            name: brand?.name ?? initialName ?? '',
            slug: brand?.slug ?? '',
            logo_url: brand?.logo_url ?? '',
            description: brand?.description ?? '',
            official_domains: (brand?.official_domains ?? []).join(', '),
            preferred_domains: (brand?.preferred_domains ?? []).join(', '),
        },
    });

    const nameValue = watch('name');

    // Auto-generate slug from name when creating
    useEffect(() => {
        if (!brand && nameValue) {
            setValue('slug', nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), {
                shouldValidate: false,
            });
        }
    }, [nameValue, brand, setValue]);

    // Load available scrapers and existing mappings
    useEffect(() => {
        let cancelled = false;

        async function load() {
            setScrapersLoading(true);
            setScrapersError(null);
            try {
                const [scraperResult, mappingResult] = await Promise.all([
                    getAvailableScraperConfigsAction(),
                    brand ? getBrandScraperMappingsAction(brand.id) : Promise.resolve({ success: true, mappings: [] }),
                ]);

                if (cancelled) return;

                if (!scraperResult.success) {
                    setScrapersError(scraperResult.error || 'Failed to load scrapers');
                } else {
                    setAvailableScrapers(scraperResult.scrapers ?? []);
                }

                if (mappingResult.success && mappingResult.mappings) {
                    setScraperMappings(
                        mappingResult.mappings.map((m) => ({
                            scraperConfigId: m.scraper_config_id,
                            priority: m.priority,
                            notes: m.notes ?? '',
                            isActive: m.is_active,
                        }))
                    );
                }
            } catch (err) {
                if (!cancelled) {
                    setScrapersError(err instanceof Error ? err.message : 'Failed to load scraper data');
                }
            } finally {
                if (!cancelled) setScrapersLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [brand]);

    const toggleScraper = useCallback((id: string) => {
        setScraperMappings((prev) => {
            const exists = prev.find((m) => m.scraperConfigId === id);
            if (exists) {
                return prev.filter((m) => m.scraperConfigId !== id);
            }
            return [...prev, { scraperConfigId: id, priority: prev.length + 1, notes: '', isActive: true }];
        });
    }, []);

    const updateMapping = useCallback((slug: string, updates: Partial<MappingFormValue>) => {
        setScraperMappings((prev) =>
            prev.map((m) => (m.scraperConfigId === slug ? { ...m, ...updates } : m))
        );
    }, []);

    const removeMapping = useCallback((slug: string) => {
        setScraperMappings((prev) => prev.filter((m) => m.scraperConfigId !== slug));
    }, []);

    const onSubmit = useCallback(async (data: BrandFormValues) => {
        setServerError(null);

        try {
            const formData = new FormData();
            formData.append('name', data.name.trim());
            formData.append('slug', data.slug.trim());
            formData.append('logo_url', (data.logo_url ?? '').trim());
            formData.append('description', (data.description ?? '').trim());
            formData.append('official_domains', (data.official_domains ?? '').trim());
            formData.append('preferred_domains', (data.preferred_domains ?? '').trim());

            const result = brand
                ? await updateBrand(brand.id, formData)
                : await createBrand(formData);

            if (!result.success) {
                throw new Error(result.error || 'Failed to save brand');
            }

            // Save scraper mappings if editing
            if (brand) {
                const mappingResult = await updateBrandScraperMappings(
                    brand.id,
                    scraperMappings.map((m) => ({
                        scraperConfigId: m.scraperConfigId,
                        priority: m.priority,
                        notes: m.notes || undefined,
                        isActive: m.isActive,
                    }))
                );
                if (!mappingResult.success) {
                    throw new Error(mappingResult.error || 'Failed to save scraper mappings');
                }
            }

            toast.success(brand ? 'Brand updated successfully' : 'Brand created successfully');
            onSave(result.brand);
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            setServerError(message);
            toast.error(message);
        }
    }, [brand, onClose, onSave, scraperMappings]);

    // Ctrl+S keyboard shortcut
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSubmit(onSubmit)();
            }
        },
        [handleSubmit, onSubmit]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const assignedSlugs = new Set(scraperMappings.map((m) => m.scraperConfigId));

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-4 border-border shadow-[12px_12px_0px_rgba(0,0,0,1)] rounded-none p-0 bg-card">
                <DialogHeader className="p-6 border-b-4 border-border bg-muted">
                    <div className="flex items-center gap-4">
                        <div className="p-2 border-2 border-border bg-card shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <Tag className="h-6 w-6 text-foreground" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-foreground">
                                {isEditing ? 'Edit Brand' : 'New Brand'}
                            </DialogTitle>
                            {isEditing && (
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1">
                                    Slug: <span className="text-foreground">{brand.slug}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {serverError && (
                    <div className="mx-6 mt-6">
                        <AlertBanner
                            severity="error"
                            title="Save Failed"
                            message={serverError}
                            onDismiss={() => setServerError(null)}
                        />
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-foreground">Brand Name *</Label>
                            <Input
                                id="name"
                                {...register('name')}
                                placeholder="e.g. Blue Buffalo"
                                autoFocus
                                className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0"
                            />
                            {errors.name && (
                                <p className="text-[10px] font-bold uppercase text-red-600">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="slug" className="text-xs font-black uppercase tracking-widest text-foreground">Slug *</Label>
                            <Input
                                id="slug"
                                {...register('slug')}
                                placeholder="e.g. blue-buffalo"
                                className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0"
                            />
                            {errors.slug && (
                                <p className="text-[10px] font-bold uppercase text-red-600">{errors.slug.message}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="logo_url" className="text-xs font-black uppercase tracking-widest text-foreground">Logo URL</Label>
                        <Input
                            id="logo_url"
                            {...register('logo_url')}
                            placeholder="https://example.com/logo.png"
                            className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0"
                        />
                        {errors.logo_url && (
                            <p className="text-[10px] font-bold uppercase text-red-600">{errors.logo_url.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-xs font-black uppercase tracking-widest text-foreground">Description</Label>
                        <Textarea
                            id="description"
                            {...register('description')}
                            placeholder="Optional description"
                            rows={3}
                            className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 min-h-[100px]"
                        />
                        {errors.description && (
                            <p className="text-[10px] font-bold uppercase text-red-600">{errors.description.message}</p>
                        )}
                    </div>

                    <div className="p-4 border-2 border-border bg-muted shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-sm font-black uppercase tracking-widest text-foreground mb-4 flex items-center gap-2">
                            <span className="w-3 h-3 bg-foreground" />
                            AI Scraper Settings
                        </h3>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="official_domains" className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Official Domains</Label>
                                <Input
                                    id="official_domains"
                                    {...register('official_domains')}
                                    placeholder="scottsmiraclegro.com, mannapro.com"
                                    className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 bg-card"
                                />
                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                                    URLs <strong>must</strong> match one of these domains.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="preferred_domains" className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Preferred Domains</Label>
                                <Input
                                    id="preferred_domains"
                                    {...register('preferred_domains')}
                                    placeholder="homedepot.com, chewy.com"
                                    className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 bg-card"
                                />
                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                                    Priority search domains (retailers, etc).
                                </p>
                            </div>
                        </div>
                    </div>

                    {isEditing && (
                        <div className="p-4 border-2 border-border bg-muted shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                            <h3 className="text-sm font-black uppercase tracking-widest text-foreground mb-4 flex items-center gap-2">
                                <Pin className="h-4 w-4" />
                                Scraper Defaults
                            </h3>

                            {scrapersLoading && (
                                <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading scrapers...
                                </div>
                            )}

                            {scrapersError && (
                                <AlertBanner
                                    severity="error"
                                    title="Scraper Load Error"
                                    message={scrapersError}
                                    onDismiss={() => setScrapersError(null)}
                                />
                            )}

                            {!scrapersLoading && !scrapersError && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            Available Scrapers
                                        </h4>
                                        <div className="border-2 border-border bg-card max-h-[240px] overflow-y-auto">
                                            {availableScrapers.length === 0 ? (
                                                <p className="p-3 text-[10px] font-bold uppercase text-muted-foreground">
                                                    No scrapers found.
                                                </p>
                                            ) : (
                                                availableScrapers.map((scraper) => (
                                                    <label
                                                        key={scraper.id}
                                                        className="flex items-center gap-2 p-2 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted"
                                                    >
                                                        <Checkbox
                                                            checked={assignedSlugs.has(scraper.id)}
                                                            onCheckedChange={() => toggleScraper(scraper.id)}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-foreground truncate">
                                                                {scraper.display_name || scraper.name}
                                                            </p>
                                                            <p className="text-[10px] font-bold uppercase text-muted-foreground truncate">
                                                                {scraper.slug}
                                                            </p>
                                                        </div>
                                                        {assignedSlugs.has(scraper.id) ? (
                                                            <Pin className="h-3 w-3 text-foreground shrink-0" />
                                                        ) : (
                                                            <Sparkles className="h-3 w-3 text-muted shrink-0" />
                                                        )}
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            Assigned Scrapers ({scraperMappings.length})
                                        </h4>
                                        <div className="border-2 border-border bg-card max-h-[240px] overflow-y-auto">
                                            {scraperMappings.length === 0 ? (
                                                <p className="p-3 text-[10px] font-bold uppercase text-muted-foreground">
                                                    No scrapers assigned. Check scrapers on the left to assign them.
                                                </p>
                                            ) : (
                                                scraperMappings.map((mapping) => {
                                                    const scraper = availableScrapers.find(
                                                        (s) => s.id === mapping.scraperConfigId
                                                    );
                                                    return (
                                                        <div
                                                            key={mapping.scraperConfigId}
                                                            className="p-2 border-b border-border last:border-b-0 space-y-2"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <Pin className="h-3 w-3 text-foreground shrink-0" />
                                                                    <span className="text-xs font-bold text-foreground truncate">
                                                                        {scraper?.display_name || scraper?.name || mapping.scraperConfigId}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeMapping(mapping.scraperConfigId)}
                                                                    className="shrink-0 p-1 hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors"
                                                                    title="Remove"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                                                        Priority
                                                                    </Label>
                                                                    <Input
                                                                        type="number"
                                                                        value={mapping.priority}
                                                                        onChange={(e) =>
                                                                            updateMapping(mapping.scraperConfigId, {
                                                                                priority: parseInt(e.target.value, 10) || 0,
                                                                            })
                                                                        }
                                                                        className="h-7 rounded-none border-2 border-border text-xs focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 bg-card"
                                                                    />
                                                                </div>
                                                                <div className="flex items-end pb-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <Switch
                                                                            checked={mapping.isActive}
                                                                            onCheckedChange={(checked) =>
                                                                                updateMapping(mapping.scraperConfigId, {
                                                                                    isActive: checked,
                                                                                })
                                                                            }
                                                                        />
                                                                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                                                                            {mapping.isActive ? 'Active' : 'Inactive'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <Input
                                                                placeholder="Notes"
                                                                value={mapping.notes}
                                                                onChange={(e) =>
                                                                    updateMapping(mapping.scraperConfigId, {
                                                                        notes: e.target.value,
                                                                    })
                                                                }
                                                                className="h-7 rounded-none border-2 border-border text-xs focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 bg-card"
                                                            />
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="flex-col sm:flex-row gap-4 pt-6 border-t-2 border-border">
                        <div className="flex-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center">
                            <span className="bg-muted px-1 py-0.5 border border-border mr-1 text-foreground">Esc</span> close • 
                            <span className="bg-muted px-1 py-0.5 border border-border mx-1 text-foreground">Ctrl+S</span> save
                        </div>
                        <div className="flex items-center gap-4">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={onClose} 
                                disabled={isSubmitting}
                                className="rounded-none border-2 border-border font-black uppercase tracking-tighter hover:bg-muted transition-all"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-tighter shadow-[4px_4px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all rounded-none min-w-[140px]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        {isEditing ? 'Save Changes' : 'Create Brand'}
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
