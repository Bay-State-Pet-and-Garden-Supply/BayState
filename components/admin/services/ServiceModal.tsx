'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { createService, updateService } from '@/app/admin/services/actions';

export interface Service {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: number | null;
    unit: string | null;
    is_active: boolean;
    created_at: string;
}

interface ServiceModalProps {
    service?: Service;
    onClose: () => void;
    onSave: () => void;
}

export function ServiceModal({
    service,
    onClose,
    onSave,
}: ServiceModalProps) {
    const isEditing = Boolean(service);

    const [name, setName] = useState(service?.name || '');
    const [slug, setSlug] = useState(service?.slug || '');
    const [description, setDescription] = useState(service?.description || '');
    const [price, setPrice] = useState(service?.price?.toString() || '');
    const [unit, setUnit] = useState(service?.unit || '');
    const [isActive, setIsActive] = useState(service?.is_active ?? true);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            if (price) formData.append('price', price);
            if (unit) formData.append('unit', unit.trim());
            formData.append('is_active', String(isActive));

            let result;
            if (service) {
                result = await updateService(service.id, formData);
            } else {
                result = await createService(formData);
            }

            if (!result.success) {
                throw new Error(result.error || 'Failed to save service');
            }

            toast.success(isEditing ? 'Service updated' : 'Service created');
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
                        <Wrench className="h-6 w-6 text-blue-600" />
                        <div>
                            <h2 className="text-lg font-semibold">{isEditing ? 'Edit Service' : 'New Service'}</h2>
                            {isEditing && <p className="text-sm text-gray-600 font-mono">{service?.slug}</p>}
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
                        <Label htmlFor="name">Service Name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Propane Refill"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="slug">Slug *</Label>
                        <Input
                            id="slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="e.g. propane-refill"
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="price">Price (optional)</Label>
                            <Input
                                id="price"
                                type="number"
                                step="0.01"
                                min="0"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="20.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unit">Unit (optional)</Label>
                            <Input
                                id="unit"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                                placeholder="tank, hour, etc."
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox
                            id="is_active"
                            checked={isActive}
                            onCheckedChange={(checked) => setIsActive(checked === true)}
                        />
                        <Label htmlFor="is_active" className="cursor-pointer">
                            Active
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
                            {saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Service')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
