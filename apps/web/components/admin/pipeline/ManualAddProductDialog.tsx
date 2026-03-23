'use client';

import { useState } from 'react';
import { Package, Loader2, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { manualAddProductAction } from '@/app/admin/pipeline/actions';

interface ManualAddProductDialogProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function ManualAddProductDialog({
    onSuccess,
    onCancel,
}: ManualAddProductDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sku, setSku] = useState('');
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!sku.trim() || !name.trim()) {
            toast.error('SKU and Name are required');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await manualAddProductAction({
                sku: sku.trim(),
                name: name.trim(),
                price: parseFloat(price) || 0,
            });

            if (result.success) {
                toast.success('Product added to pipeline');
                onSuccess();
            } else {
                toast.error(result.error || 'Failed to add product');
            }
        } catch (error) {
            console.error('Failed to add product:', error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-[#008850]" />
                        <h2 className="text-lg font-semibold text-foreground">Add New Product</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="p-2 text-muted-foreground hover:text-muted-foreground disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 p-6">
                        <div className="space-y-2">
                            <Label htmlFor="sku">SKU / Item Number</Label>
                            <Input
                                id="sku"
                                placeholder="e.g. 12345"
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Product Name</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Dog Food 20lb"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price">Price (Optional)</Label>
                            <Input
                                id="price"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-border bg-muted px-6 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-[#008850] hover:bg-[#2a7034]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Adding…
                                </>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Product
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
