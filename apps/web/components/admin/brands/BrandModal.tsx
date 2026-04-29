'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createBrand, updateBrand } from '@/app/admin/brands/actions';
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
    website_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
    official_domains: z.string().optional(),
    preferred_domains: z.string().optional(),
    aliases: z.string().optional(),
});

type BrandFormValues = z.infer<typeof brandSchema>;

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
            website_url: brand?.website_url ?? '',
            official_domains: (brand?.official_domains ?? []).join(', '),
            preferred_domains: (brand?.preferred_domains ?? []).join(', '),
            aliases: (brand?.aliases ?? []).join(', '),
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

    const onSubmit = useCallback(async (data: BrandFormValues) => {
        setServerError(null);

        try {
            const formData = new FormData();
            formData.append('name', data.name.trim());
            formData.append('slug', data.slug.trim());
            formData.append('logo_url', (data.logo_url ?? '').trim());
            formData.append('description', (data.description ?? '').trim());
            formData.append('website_url', (data.website_url ?? '').trim());
            formData.append('official_domains', (data.official_domains ?? '').trim());
            formData.append('preferred_domains', (data.preferred_domains ?? '').trim());
            formData.append('aliases', (data.aliases ?? '').trim());

            const result = brand
                ? await updateBrand(brand.id, formData)
                : await createBrand(formData);

            if (!result.success) {
                throw new Error(result.error || 'Failed to save brand');
            }

            toast.success(brand ? 'Brand updated successfully' : 'Brand created successfully');
            onSave(result.brand);
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            setServerError(message);
            toast.error(message);
        }
    }, [brand, onClose, onSave]);

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

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto border-4 border-zinc-900 shadow-[12px_12px_0px_rgba(0,0,0,1)] rounded-none p-0 bg-white">
                <DialogHeader className="p-6 border-b-4 border-zinc-900 bg-zinc-50">
                    <div className="flex items-center gap-4">
                        <div className="p-2 border-2 border-zinc-900 bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <Tag className="h-6 w-6 text-zinc-900" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-zinc-900">
                                {isEditing ? 'Edit Brand' : 'New Brand'}
                            </DialogTitle>
                            {isEditing && (
                                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mt-1">
                                    Slug: <span className="text-zinc-900">{brand.slug}</span>
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
                            <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-zinc-900">Brand Name *</Label>
                            <Input
                                id="name"
                                {...register('name')}
                                placeholder="e.g. Blue Buffalo"
                                autoFocus
                                className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0"
                            />
                            {errors.name && (
                                <p className="text-[10px] font-bold uppercase text-red-600">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="slug" className="text-xs font-black uppercase tracking-widest text-zinc-900">Slug *</Label>
                            <Input
                                id="slug"
                                {...register('slug')}
                                placeholder="e.g. blue-buffalo"
                                className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0"
                            />
                            {errors.slug && (
                                <p className="text-[10px] font-bold uppercase text-red-600">{errors.slug.message}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="logo_url" className="text-xs font-black uppercase tracking-widest text-zinc-900">Logo URL</Label>
                        <Input
                            id="logo_url"
                            {...register('logo_url')}
                            placeholder="https://example.com/logo.png"
                            className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0"
                        />
                        {errors.logo_url && (
                            <p className="text-[10px] font-bold uppercase text-red-600">{errors.logo_url.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-xs font-black uppercase tracking-widest text-zinc-900">Description</Label>
                        <Textarea
                            id="description"
                            {...register('description')}
                            placeholder="Optional description"
                            rows={3}
                            className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0 min-h-[100px]"
                        />
                        {errors.description && (
                            <p className="text-[10px] font-bold uppercase text-red-600">{errors.description.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website_url" className="text-xs font-black uppercase tracking-widest text-zinc-900">Official Website URL</Label>
                        <Input
                            id="website_url"
                            {...register('website_url')}
                            placeholder="https://brand.example"
                            className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0"
                        />
                        {errors.website_url && (
                            <p className="text-[10px] font-bold uppercase text-red-600">{errors.website_url.message}</p>
                        )}
                    </div>

                    <div className="p-4 border-2 border-zinc-900 bg-zinc-50 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 mb-4 flex items-center gap-2">
                            <span className="w-3 h-3 bg-zinc-900" />
                            AI Scraper Settings
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="aliases" className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Brand Aliases</Label>
                                <Input
                                    id="aliases"
                                    {...register('aliases')}
                                    placeholder="LV SEED, LAKEVALLEY"
                                    className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0 bg-white"
                                />
                                <p className="text-[10px] font-bold text-zinc-500 uppercase leading-tight italic">
                                    Alternative names used by suppliers.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="official_domains" className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Official Domains</Label>
                                <Input
                                    id="official_domains"
                                    {...register('official_domains')}
                                    placeholder="scottsmiraclegro.com, mannapro.com"
                                    className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0 bg-white"
                                />
                                <p className="text-[10px] font-bold text-zinc-500 uppercase leading-tight italic">
                                    URLs <strong>must</strong> match one of these domains.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="preferred_domains" className="text-[10px] font-black uppercase tracking-wider text-zinc-600">Preferred Domains</Label>
                                <Input
                                    id="preferred_domains"
                                    {...register('preferred_domains')}
                                    placeholder="homedepot.com, chewy.com"
                                    className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0 bg-white"
                                />
                                <p className="text-[10px] font-bold text-zinc-500 uppercase leading-tight italic">
                                    Priority search domains (retailers, etc).
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-4 pt-6 border-t-2 border-zinc-900">
                        <div className="flex-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center">
                            <span className="bg-zinc-200 px-1 py-0.5 border border-zinc-400 mr-1">Esc</span> close • 
                            <span className="bg-zinc-200 px-1 py-0.5 border border-zinc-400 mx-1">Ctrl+S</span> save
                        </div>
                        <div className="flex items-center gap-4">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={onClose} 
                                disabled={isSubmitting}
                                className="rounded-none border-2 border-zinc-900 font-black uppercase tracking-tighter hover:bg-zinc-100 transition-all"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className="bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase tracking-tighter shadow-[4px_4px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all rounded-none min-w-[140px]"
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
