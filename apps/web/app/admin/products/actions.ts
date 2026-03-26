'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';

const productSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    price: z.coerce.number().min(0),
    stock_status: z.string().optional(),
    description: z.string().optional(),
    long_description: z.string().optional(),
    brand_id: z.string().optional().nullable(),
    weight: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    product_type: z.string().optional().nullable(),
    search_keywords: z.string().optional().nullable(),
    gtin: z.string().optional().nullable(),
    availability: z.string().optional().nullable(),
    minimum_quantity: z.coerce.number().int().min(0).optional(),
    is_special_order: z.coerce.boolean().optional(),
    is_taxable: z.coerce.boolean().optional(),
    shopsite_pages: z.array(z.string()).optional().nullable(),
});

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function updateProduct(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawBrandId = formData.get('brand_id');
    const shopsitePagesRaw = formData.get('product_on_pages');
    
    const rawData: Record<string, unknown> = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        price: formData.get('price'),
        stock_status: formData.get('stock_status') || 'in_stock',
        description: formData.get('description'),
        long_description: formData.get('long_description'),
        weight: formData.get('weight'),
        category: formData.get('category'),
        product_type: formData.get('product_type'),
        search_keywords: formData.get('search_keywords'),
        gtin: formData.get('gtin'),
        availability: formData.get('availability'),
        minimum_quantity: formData.get('minimum_quantity'),
        is_special_order: formData.get('is_special_order') === 'true',
        is_taxable: formData.get('is_taxable') === 'true',
    };

    // Only include brand_id if it has a value
    if (rawBrandId && rawBrandId !== 'none') {
        rawData.brand_id = rawBrandId;
    } else {
        rawData.brand_id = null;
    }

    // Parse ShopSite pages if provided
    if (shopsitePagesRaw) {
        try {
            rawData.shopsite_pages = JSON.parse(shopsitePagesRaw as string);
        } catch (e) {
            console.error('Failed to parse shopsite_pages:', e);
        }
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
