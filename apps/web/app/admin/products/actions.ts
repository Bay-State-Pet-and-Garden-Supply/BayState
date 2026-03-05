'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';

const productSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    price: z.coerce.number().min(0),
    stock_status: z.enum(['in_stock', 'out_of_stock', 'pre_order']),
    description: z.string().optional(),
    brand_id: z.string().optional(),
    is_featured: z.coerce.boolean(),
});

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function updateProduct(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawBrandId = formData.get('brand_id');
    const rawData: Record<string, unknown> = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        price: formData.get('price'),
        stock_status: formData.get('stock_status'),
        description: formData.get('description'),
        is_featured: formData.get('is_featured') === 'true',
    };

    // Only include brand_id if it has a value
    if (rawBrandId) {
        rawData.brand_id = rawBrandId;
    }

    try {
        const validatedData = productSchema.parse(rawData);

        const { error } = await supabase
            .from('products')
            .update(validatedData)
            .eq('id', id);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to update product in database' };
        }

        revalidatePath('/admin/products');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to update product' };
    }
}
