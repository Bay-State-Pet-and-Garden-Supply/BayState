'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrand, updateBrand } from '@/app/admin/brands/actions';

export interface Brand {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    description: string | null;
    created_at: string;
}

interface BrandModalProps {
    brand?: Brand; // If provided, we are editing. If undefined, we are creating.
    onClose: () => void;
    onSave: () => void;
}

export function BrandModal({
    brand,
    onClose,
    onSave,
}: BrandModalProps) {
    const [name, setName] = useState(brand?.name || '');
    const [slug, setSlug] = useState(brand?.slug || '');
    const [logoUrl, setLogoUrl] = useState(brand?.logo_url || '');
    const [description, setDescription] = useState(brand?.description || '');

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-generate slug from name if creating a new brand
    useEffect(() => {
        if (!brand && name) {
            setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
        }
    }, [name, brand]);

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
            formData.append('logo_url', logoUrl.trim());
            formData.append('description', description.trim());

            let result;
            if (brand) {
                result = await updateBrand(brand.id, formData);
            } else {
                result = await createBrand(formData);
            }

            if (!result.success) {
                throw new Error(result.error || 'Failed to save brand');
            }

            toast.success(brand ? 'Brand updated successfully' : 'Brand created successfully');
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

    const isEditing = !!brand;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Tag className="h-6 w-6 text-purple-600" />
                        <div>
                            <h2 className="text-lg font-semibold">{isEditing ? 'Edit Brand' : 'New Brand'}</h2>
                            {isEditing && <p className="text-sm text-gray-600 font-mono">{brand.slug}</p>}
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
                        <Label htmlFor="name">Brand Name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Blue Buffalo"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="slug">Slug *</Label>
                        <Input
                            id="slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="e.g. blue-buffalo"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="logoUrl">Logo URL</Label>
                        <Input
                            id="logoUrl"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://example.com/logo.png"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description"
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
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
                            {saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Brand')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
