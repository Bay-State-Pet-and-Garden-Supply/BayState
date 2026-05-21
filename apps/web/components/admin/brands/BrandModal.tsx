'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Tag, Loader2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    createBrand,
    updateBrand,
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
            official_domains: (brand?.official_domains ?? []).join(', '),
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
            formData.append('official_domains', (data.official_domains ?? '').trim());

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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border rounded-lg shadow-sm rounded-none p-0 bg-card">
                <DialogHeader className="p-6 border-b-4 border-border bg-muted">
                    <div className="flex items-center gap-4">
                        <div className="p-2 border-2 border-border bg-card shadow-sm">
                            <Tag className="h-6 w-6 text-foreground" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-semibold text-foreground">
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
                            <Label htmlFor="name" className="text-xs font-semibold text-foreground">Brand Name *</Label>
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
                            <Label htmlFor="slug" className="text-xs font-semibold text-foreground">Slug *</Label>
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
                        <Label htmlFor="logo_url" className="text-xs font-semibold text-foreground">Logo URL</Label>
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
                        <Label htmlFor="description" className="text-xs font-semibold text-foreground">Description</Label>
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

                    <div className="p-4 border-2 border-border bg-muted shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            Official Brand Settings
                        </h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="official_domains" className="text-[10px] font-semibold text-muted-foreground">Official Domains</Label>
                                <Input
                                    id="official_domains"
                                    {...register('official_domains')}
                                    placeholder="scottsmiraclegro.com, mannapro.com"
                                    className="rounded-none border-2 border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 bg-card text-xs"
                                />
                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                                    URLs <strong>must</strong> match one of these domains for extraction to run.
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-4 pt-6 border-t-2 border-border">
                        <div className="flex-1 text-[10px] font-semibold text-muted-foreground flex items-center">
                            <span className="bg-muted px-1 py-0.5 border border-border mr-1 text-foreground">Esc</span> close • 
                            <span className="bg-muted px-1 py-0.5 border border-border mx-1 text-foreground">Ctrl+S</span> save
                        </div>
                        <div className="flex items-center gap-4">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={onClose} 
                                disabled={isSubmitting}
                                className="rounded-none border-2 border-border font-semibold hover:bg-muted transition-all"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={isSubmitting} 
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all rounded-none min-w-[140px]"
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
