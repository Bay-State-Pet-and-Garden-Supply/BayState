'use client';

import { useState } from 'react';
import { Package, Loader2, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { manualAddProductAction } from '@/app/admin/pipeline/actions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({
    sku: z.string().min(1, 'SKU is required').max(50, 'SKU is too long'),
    name: z.string().min(1, 'Product Name is required').max(200, 'Product name is too long'),
    price: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface ManualAddProductDialogProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export function ManualAddProductDialog({
    onSuccess,
    onCancel,
}: ManualAddProductDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            sku: '',
            name: '',
            price: '',
        },
        mode: 'onBlur',
    });

    const onSubmit = async (data: FormValues) => {
        setIsSubmitting(true);
        try {
            const parsedPrice = data.price ? parseFloat(data.price) : 0;
            const result = await manualAddProductAction({
                sku: data.sku.trim(),
                name: data.name.trim(),
                price: isNaN(parsedPrice) ? 0 : parsedPrice,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-brand-forest-green" />
                        <h2 className="text-lg font-semibold text-foreground">Add New Product</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                        aria-label="Close dialog"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="space-y-5 p-6">
                        <div className="space-y-2">
                            <Label htmlFor="sku">SKU / Item Number</Label>
                            <Input
                                id="sku"
                                placeholder="e.g. 12345"
                                disabled={isSubmitting}
                                aria-invalid={!!errors.sku}
                                aria-describedby={errors.sku ? "sku-error" : "sku-hint"}
                                {...register('sku')}
                            />
                            {errors.sku ? (
                                <p id="sku-error" className="text-sm font-medium text-destructive">{errors.sku.message}</p>
                            ) : (
                                <p id="sku-hint" className="text-sm text-muted-foreground">Unique identifier used for the product.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Product Name</Label>
                            <Input
                                id="name"
                                placeholder="e.g. Dog Food 20lb"
                                disabled={isSubmitting}
                                aria-invalid={!!errors.name}
                                aria-describedby={errors.name ? "name-error" : undefined}
                                {...register('name')}
                            />
                            {errors.name && (
                                <p id="name-error" className="text-sm font-medium text-destructive">{errors.name.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price">Price (Optional)</Label>
                            <Input
                                id="price"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                disabled={isSubmitting}
                                aria-invalid={!!errors.price}
                                aria-describedby={errors.price ? "price-error" : "price-hint"}
                                {...register('price')}
                            />
                            {errors.price ? (
                                <p id="price-error" className="text-sm font-medium text-destructive">{errors.price.message}</p>
                            ) : (
                                <p id="price-hint" className="text-sm text-muted-foreground">Base retail price before any discounts.</p>
                            )}
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
                            className="bg-brand-forest-green hover:bg-brand-forest-green/90 text-white"
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