'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { createCategory, updateCategory } from '@/app/admin/categories/actions';
import { AlertBanner } from '@/components/admin/pipeline/AlertBanner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

export interface Category {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    parent_id: string | null;
    display_order: number;
    image_url: string | null;
    is_featured: boolean;
    created_at: string;
    department_key?: string | null;
    facet_profile?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    synonym_keywords?: string[] | null;
    sort_order?: number | null;
    is_active?: boolean | null;
    depth?: number | null;
    breadcrumb?: string | null;
}

const DEPARTMENT_OPTIONS = [
    { label: 'Dog', value: 'dog' },
    { label: 'Cat', value: 'cat' },
    { label: 'Small Pet', value: 'small-pet' },
    { label: 'Pet Bird', value: 'pet-bird' },
    { label: 'Fish & Aquarium', value: 'fish-aquarium' },
    { label: 'Reptile & Amphibian', value: 'reptile-amphibian' },
    { label: 'Wild Bird & Wildlife', value: 'wild-bird-wildlife' },
    { label: 'Chicken & Poultry', value: 'chicken-poultry' },
    { label: 'Horse', value: 'horse' },
    { label: 'Farm & Livestock', value: 'farm-livestock' },
    { label: 'Lawn & Garden', value: 'lawn-garden' },
    { label: 'Home & Heating', value: 'home-heating' },
    { label: 'Tools & Hardware', value: 'tools-hardware' },
];

const FACET_PROFILE_OPTIONS = [
    { label: 'Animal Food', value: 'animal_food' },
    { label: 'Animal Treats & Chews', value: 'animal_treats_chews' },
    { label: 'Animal Feed (Farm)', value: 'animal_feed_farm' },
    { label: 'Animal Health & Wellness', value: 'animal_health_wellness' },
    { label: 'Animal Toys & Enrichment', value: 'animal_toys_enrichment' },
    { label: 'Animal Habitat & Containment', value: 'animal_habitat_containment' },
    { label: 'Animal Litter & Bedding', value: 'animal_litter_bedding' },
    { label: 'Grooming & Cleaning', value: 'grooming_cleaning' },
    { label: 'Aquarium Equipment', value: 'aquarium_equipment' },
    { label: 'Reptile Equipment', value: 'reptile_equipment' },
    { label: 'Garden Consumable', value: 'garden_consumable' },
    { label: 'Garden Equipment', value: 'garden_equipment' },
    { label: 'Home & Heating', value: 'home_heating' },
    { label: 'Hardware & Tools', value: 'hardware_tools' },
    { label: 'General', value: 'general' },
];

const categorySchema = z.object({
    name: z.string().min(1, 'Category name is required').max(100, 'Name is too long'),
    slug: z.string().min(1, 'Slug is required').max(100, 'Slug is too long')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens'),
    description: z.string().max(500, 'Description is too long').optional(),
    parent_id: z.string().nullable().optional(),
    display_order: z.number().int().min(0, 'Must be 0 or greater'),
    image_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
    is_featured: z.boolean(),
    department_key: z.string().optional(),
    facet_profile: z.string().optional(),
    seo_title: z.string().max(200, 'SEO title is too long').optional(),
    seo_description: z.string().max(500, 'SEO description is too long').optional(),
    synonym_keywords: z.string().optional(),
    sort_order: z.number().int().min(0, 'Must be 0 or greater').optional(),
    is_active: z.boolean().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryModalProps {
    category?: Category;
    allCategories: Category[];
    defaultParentId?: string | null;
    onClose: () => void;
    onSave: () => void;
}

export function CategoryModal({
    category,
    allCategories,
    defaultParentId,
    onClose,
    onSave,
}: CategoryModalProps) {
    const isEditing = Boolean(category);
    const [serverError, setServerError] = useState<string | null>(null);

    // Filter out current category and its descendants from parent options
    const { excludeIds, parentOptions } = useMemo(() => {
        const getDescendantIds = (catId: string): string[] => {
            const directChildren = allCategories.filter((c) => c.parent_id === catId);
            return [catId, ...directChildren.flatMap((c) => getDescendantIds(c.id))];
        };
        const ids = category ? getDescendantIds(category.id) : [];
        return {
            excludeIds: ids,
            parentOptions: allCategories.filter((c) => !ids.includes(c.id)),
        };
    }, [category, allCategories]);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        control,
        formState: { errors, isSubmitting },
    } = useForm<CategoryFormValues>({
        resolver: zodResolver(categorySchema),
        defaultValues: {
            name: category?.name ?? '',
            slug: category?.slug ?? '',
            description: category?.description ?? '',
            parent_id: category?.parent_id ?? defaultParentId ?? null,
            display_order: category?.display_order ?? 0,
            image_url: category?.image_url ?? '',
            is_featured: category?.is_featured ?? false,
            department_key: category?.department_key ?? '',
            facet_profile: category?.facet_profile ?? '',
            seo_title: category?.seo_title ?? '',
            seo_description: category?.seo_description ?? '',
            synonym_keywords: category?.synonym_keywords?.join(', ') ?? '',
            sort_order: category?.sort_order ?? category?.display_order ?? 0,
            is_active: category?.is_active ?? true,
        },
    });

    const nameValue = watch('name');

    // Auto-generate slug from name when creating
    useEffect(() => {
        if (!isEditing && nameValue) {
            setValue('slug', nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), {
                shouldValidate: false,
            });
        }
    }, [nameValue, isEditing, setValue]);

    const onSubmit = async (data: CategoryFormValues) => {
        setServerError(null);

        try {
            const formData = new FormData();
            formData.append('name', data.name.trim());
            formData.append('slug', data.slug.trim());
            if (data.description) formData.append('description', data.description.trim());
            if (data.parent_id) formData.append('parent_id', data.parent_id);
            formData.append('display_order', String(data.display_order));
            if (data.image_url) formData.append('image_url', data.image_url.trim());
            formData.append('is_featured', String(data.is_featured));
            if (data.department_key) formData.append('department_key', data.department_key);
            if (data.facet_profile) formData.append('facet_profile', data.facet_profile);
            if (data.seo_title) formData.append('seo_title', data.seo_title);
            if (data.seo_description) formData.append('seo_description', data.seo_description);
            if (data.synonym_keywords) formData.append('synonym_keywords', data.synonym_keywords);
            formData.append('sort_order', String(data.sort_order ?? data.display_order));
            formData.append('is_active', String(data.is_active !== false));

            const result = category
                ? await updateCategory(category.id, formData)
                : await createCategory(formData);

            if (!result.success) {
                throw new Error(result.error || 'Failed to save category');
            }

            toast.success(isEditing ? 'Category updated' : 'Category created');
            onSave();
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            setServerError(message);
            toast.error(message);
        }
    };

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
                        <FolderTree className="h-6 w-6 text-green-600" />
                        <div>
                            <DialogTitle>{isEditing ? 'Edit Category' : 'New Category'}</DialogTitle>
                            {isEditing && <p className="text-sm text-muted-foreground font-mono">{category?.slug}</p>}
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
                        <Label htmlFor="name">Name *</Label>
                        <Input
                            id="name"
                            {...register('name')}
                            placeholder="e.g. Dog Food"
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
                            placeholder="e.g. dog-food"
                            aria-invalid={!!errors.slug}
                            aria-describedby={errors.slug ? 'slug-error' : undefined}
                        />
                        {errors.slug && (
                            <p id="slug-error" className="text-sm text-destructive">{errors.slug.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="parent_id">Parent Category</Label>
                        <Controller
                            name="parent_id"
                            control={control}
                            render={({ field }) => (
                                <select
                                    id="parent_id"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(e.target.value || null)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">None (Top Level)</option>
                                    {parentOptions.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                            id="description"
                            {...register('description')}
                            placeholder="Brief description"
                            aria-invalid={!!errors.description}
                            aria-describedby={errors.description ? 'desc-error' : undefined}
                        />
                        {errors.description && (
                            <p id="desc-error" className="text-sm text-destructive">{errors.description.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="display_order">Display Order</Label>
                        <Input
                            id="display_order"
                            type="number"
                            {...register('display_order')}
                            min={0}
                            aria-invalid={!!errors.display_order}
                            aria-describedby={errors.display_order ? 'order-error' : undefined}
                        />
                        {errors.display_order && (
                            <p id="order-error" className="text-sm text-destructive">{errors.display_order.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="image_url">Image URL</Label>
                        <Input
                            id="image_url"
                            {...register('image_url')}
                            placeholder="https://example.com/image.png"
                            aria-invalid={!!errors.image_url}
                            aria-describedby={errors.image_url ? 'img-error' : undefined}
                        />
                        {errors.image_url && (
                            <p id="img-error" className="text-sm text-destructive">{errors.image_url.message}</p>
                        )}
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                        <Controller
                            name="is_featured"
                            control={control}
                            render={({ field }) => (
                                <Checkbox
                                    id="is_featured"
                                    checked={field.value}
                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                />
                            )}
                        />
                        <Label htmlFor="is_featured" className="cursor-pointer">
                            Featured Category
                        </Label>
                    </div>

                    <hr className="my-2 border-t" />
                    <h3 className="text-sm font-semibold text-muted-foreground">Taxonomy &amp; SEO</h3>

                    <div className="space-y-2">
                        <Label htmlFor="department_key">Department</Label>
                        <Controller
                            name="department_key"
                            control={control}
                            render={({ field }) => (
                                <select
                                    id="department_key"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(e.target.value || '')}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">None (Inherit from parent)</option>
                                    {DEPARTMENT_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="facet_profile">Facet Profile</Label>
                        <Controller
                            name="facet_profile"
                            control={control}
                            render={({ field }) => (
                                <select
                                    id="facet_profile"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(e.target.value || '')}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    <option value="">None (General)</option>
                                    {FACET_PROFILE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sort_order">Sort Order</Label>
                        <Input
                            id="sort_order"
                            type="number"
                            {...register('sort_order')}
                            min={0}
                            placeholder="Same as display order if empty"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="seo_title">SEO Title</Label>
                        <Input
                            id="seo_title"
                            {...register('seo_title')}
                            placeholder="Custom meta title (optional)"
                            aria-invalid={!!errors.seo_title}
                            aria-describedby={errors.seo_title ? 'seo-title-error' : undefined}
                        />
                        {errors.seo_title && (
                            <p id="seo-title-error" className="text-sm text-destructive">{errors.seo_title.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="seo_description">SEO Description</Label>
                        <textarea
                            id="seo_description"
                            {...register('seo_description')}
                            placeholder="Custom meta description (optional)"
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="synonym_keywords">Synonym Keywords</Label>
                        <Input
                            id="synonym_keywords"
                            {...register('synonym_keywords')}
                            placeholder="Comma-separated: dog food, puppy food, kibble"
                        />
                        <p className="text-xs text-muted-foreground">
                            Alternative search terms for matching products to this category.
                        </p>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                        <Controller
                            name="is_active"
                            control={control}
                            render={({ field }) => (
                                <Checkbox
                                    id="is_active"
                                    checked={field.value !== false}
                                    onCheckedChange={(checked) => field.onChange(checked !== false)}
                                />
                            )}
                        />
                        <Label htmlFor="is_active" className="cursor-pointer">
                            Active (visible on storefront)
                        </Label>
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
                                {isSubmitting ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Category')}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
