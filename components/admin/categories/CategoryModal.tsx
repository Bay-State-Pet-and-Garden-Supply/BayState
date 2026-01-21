'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { createCategory, updateCategory } from '@/app/admin/categories/actions';

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
}

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

    const [name, setName] = useState(category?.name || '');
    const [slug, setSlug] = useState(category?.slug || '');
    const [description, setDescription] = useState(category?.description || '');
    const [parentId, setParentId] = useState<string | null>(
        category?.parent_id ?? defaultParentId ?? null
    );
    const [displayOrder, setDisplayOrder] = useState(category?.display_order ?? 0);
    const [imageUrl, setImageUrl] = useState(category?.image_url || '');
    const [isFeatured, setIsFeatured] = useState(category?.is_featured ?? false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter out current category and its children from parent options
    const getDescendantIds = (catId: string): string[] => {
        const directChildren = allCategories.filter((c) => c.parent_id === catId);
        return [
            catId,
            ...directChildren.flatMap((c) => getDescendantIds(c.id)),
        ];
    };

    const excludeIds = category ? getDescendantIds(category.id) : [];
    const parentOptions = allCategories.filter(
        (c) => !excludeIds.includes(c.id)
    );

    // Auto-generate slug
    useEffect(() => {
        if (!isEditing && name) {
            setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
        }
    }, [name, isEditing]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        },
        [onClose]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('slug', slug.trim());
            if (description) formData.append('description', description.trim());
            if (parentId) formData.append('parent_id', parentId);
            formData.append('display_order', String(displayOrder));
            if (imageUrl) formData.append('image_url', imageUrl.trim());
            formData.append('is_featured', String(isFeatured));

            let result;
            if (category) {
                result = await updateCategory(category.id, formData);
            } else {
                result = await createCategory(formData);
            }

            if (!result.success) {
                throw new Error(result.error || 'Failed to save category');
            }

            toast.success(isEditing ? 'Category updated' : 'Category created');
            onSave();
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                    <div className="flex items-center gap-3">
                        <FolderTree className="h-6 w-6 text-green-600" />
                        <div>
                            <h2 className="text-lg font-semibold">{isEditing ? 'Edit Category' : 'New Category'}</h2>
                            {isEditing && <p className="text-sm text-gray-600 font-mono">{category?.slug}</p>}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 hover:bg-gray-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Form Content */}
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Dog Food"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="slug">Slug *</Label>
                        <Input
                            id="slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="e.g. dog-food"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="parent_id">Parent Category</Label>
                        <select
                            id="parent_id"
                            value={parentId || ''}
                            onChange={(e) => setParentId(e.target.value || null)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <option value="">None (Top Level)</option>
                            {parentOptions.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="display_order">Display Order</Label>
                        <Input
                            id="display_order"
                            type="number"
                            value={displayOrder}
                            onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                            min={0}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="imageUrl">Image URL</Label>
                        <Input
                            id="imageUrl"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            placeholder="https://example.com/image.png"
                        />
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox
                            id="is_featured"
                            checked={isFeatured}
                            onCheckedChange={(checked) => setIsFeatured(checked === true)}
                        />
                        <Label htmlFor="is_featured" className="cursor-pointer">
                            Featured Category
                        </Label>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 flex items-center justify-between border-t bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-600">
                        Press <kbd className="rounded bg-gray-200 px-1">Esc</kbd> to close,{' '}
                        <kbd className="rounded bg-gray-200 px-1">Ctrl+S</kbd> to save
                    </p>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                        >
                            <Save className="mr-2 h-4 w-4" />
                            {saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Category')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
