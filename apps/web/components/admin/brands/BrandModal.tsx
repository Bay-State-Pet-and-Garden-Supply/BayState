'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createBrand, updateBrand } from '@/app/admin/brands/actions';
import { AlertBanner } from '@/components/admin/pipeline/AlertBanner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

export interface Brand {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    description: string | null;
    website_url: string | null;
    official_domains: string[];
    preferred_domains: string[];
    created_at: string;
}

const brandSchema = z.object({
    name: z.string().min(1, 'Brand name is required').max(100, 'Name is too long'),
    slug: z.string().min(1, 'Slug is required').max(100, 'Slug is too long')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens'),
    logo_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
    description: z.string().max(500, 'Description is too long').optional(),
    website_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
    official_domains: z.string().optional(),
    preferred_domains: z.string().optional(),
});

type BrandFormValues = z.infer<typeof brandSchema>;

interface BrandModalProps {
    brand?: Brand;
    onClose: () => void;
    onSave: () => void;
}

export function BrandModal({
    brand,
    onClose,
    onSave,
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
            name: brand?.name ?? '',
            slug: brand?.slug ?? '',
            logo_url: brand?.logo_url ?? '',
            description: brand?.description ?? '',
            website_url: brand?.website_url ?? '',
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

            const result = brand
                ? await updateBrand(brand.id, formData)
                : await createBrand(formData);

            if (!result.success) {
                throw new Error(result.error || 'Failed to save brand');
            }

            toast.success(brand ? 'Brand updated successfully' : 'Brand created successfully');
            onSave();
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
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <Tag className="h-6 w-6 text-purple-600" />
                        <div>
                            <DialogTitle>{isEditing ? 'Edit Brand' : 'New Brand'}</DialogTitle>
                            {isEditing && <p className="text-sm text-muted-foreground font-mono">{brand.slug}</p>}
                        </div>
                    </div>
                </DialogHeader>

                {serverError && (
                    <AlertBanner
                        severity="error"
                        title="Save Failed"
                        message={serverError}
                        onDismiss={() => setServerError(null)}
                    />
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Brand Name *</Label>
                        <Input
                            id="name"
                            {...register('name')}
                            placeholder="e.g. Blue Buffalo"
                            autoFocus
                            aria-invalid={!!errors.name}
                            aria-describedby={errors.name ? 'name-error' : undefined}
                        />
                        {errors.name && (
                            <p id="name-error" className="text-sm text-destructive">{errors.name.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="slug">Slug *</Label>
                        <Input
                            id="slug"
                            {...register('slug')}
                            placeholder="e.g. blue-buffalo"
                            aria-invalid={!!errors.slug}
                            aria-describedby={errors.slug ? 'slug-error' : undefined}
                        />
                        {errors.slug && (
                            <p id="slug-error" className="text-sm text-destructive">{errors.slug.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="logo_url">Logo URL</Label>
                        <Input
                            id="logo_url"
                            {...register('logo_url')}
                            placeholder="https://example.com/logo.png"
                            aria-invalid={!!errors.logo_url}
                            aria-describedby={errors.logo_url ? 'logo-error' : undefined}
                        />
                        {errors.logo_url && (
                            <p id="logo-error" className="text-sm text-destructive">{errors.logo_url.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            {...register('description')}
                            placeholder="Optional description"
                            rows={3}
                            aria-invalid={!!errors.description}
                            aria-describedby={errors.description ? 'desc-error' : undefined}
                        />
                        {errors.description && (
                            <p id="desc-error" className="text-sm text-destructive">{errors.description.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website_url">Website URL</Label>
                        <Input
                            id="website_url"
                            {...register('website_url')}
                            placeholder="https://brand.example"
                            aria-invalid={!!errors.website_url}
                            aria-describedby={errors.website_url ? 'website-error' : undefined}
                        />
                        {errors.website_url && (
                            <p id="website-error" className="text-sm text-destructive">{errors.website_url.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="official_domains">Official Domains</Label>
                        <Textarea
                            id="official_domains"
                            {...register('official_domains')}
                            placeholder="scottsmiraclegro.com, mannapro.com"
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="preferred_domains">Preferred Domains</Label>
                        <Textarea
                            id="preferred_domains"
                            {...register('preferred_domains')}
                            placeholder="homedepot.com, chewy.com"
                            rows={2}
                        />
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <div className="flex-1 text-xs text-muted-foreground flex items-center">
                            Press <kbd className="mx-1 rounded bg-muted px-1">Esc</kbd> to close,{' '}
                            <kbd className="mx-1 rounded bg-muted px-1">Ctrl+S</kbd> to save
                        </div>
                        <div className="flex items-center gap-3">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                <Save className="mr-2 h-4 w-4" />
                                {isSubmitting ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Brand')}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
