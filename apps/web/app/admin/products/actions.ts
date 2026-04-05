'use server';

import { createClient } from '@/lib/supabase/server';
import { syncProductCategoryIds } from '@/lib/product-category-sync';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';

const productSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    sku: z.string().optional().nullable(),
    price: z.coerce.number().min(0),
    stock_status: z.string().optional(),
    quantity: z.coerce.number().int().min(0).optional().nullable(),
    low_stock_threshold: z.coerce.number().int().min(0).optional().nullable(),
    description: z.string().optional(),
    long_description: z.string().optional(),
    brand_id: z.string().optional().nullable(),
    weight: z.string().optional().nullable(),
    search_keywords: z.string().optional().nullable(),
    gtin: z.string().optional().nullable(),
    availability: z.string().optional().nullable(),
    minimum_quantity: z.coerce.number().int().min(0).optional().nullable(),
    is_special_order: z.coerce.boolean().optional(),
    is_taxable: z.coerce.boolean().optional(),
    shopsite_pages: z.array(z.string()).optional().nullable(),
    published_at: z.string().optional().nullable(),
});

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function updateProduct(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawBrandId = formData.get('brand_id');
    const rawCategoryIds = formData.get('category_ids');
    const shopsitePagesRaw = formData.get('product_on_pages');
    let categoryIds: string[] = [];
    
    const rawData: Record<string, unknown> = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        sku: formData.get('sku'),
        price: formData.get('price'),
        stock_status: formData.get('stock_status') || 'in_stock',
        quantity: formData.get('quantity'),
        low_stock_threshold: formData.get('low_stock_threshold'),
        description: formData.get('description'),
        long_description: formData.get('long_description'),
        weight: formData.get('weight'),
        search_keywords: formData.get('search_keywords'),
        gtin: formData.get('gtin'),
        availability: formData.get('availability'),
        minimum_quantity: formData.get('minimum_quantity'),
        is_special_order: formData.get('is_special_order') === 'true',
        is_taxable: formData.get('is_taxable') === 'true',
        published_at: formData.get('published_at') ? new Date(formData.get('published_at') as string).toISOString() : null,
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

    if (rawCategoryIds) {
        try {
            const parsedCategoryIds = JSON.parse(rawCategoryIds as string);
            if (Array.isArray(parsedCategoryIds)) {
                categoryIds = parsedCategoryIds.filter(
                    (categoryId): categoryId is string => typeof categoryId === 'string' && categoryId.trim().length > 0
                );
            }
        } catch (e) {
            console.error('Failed to parse category_ids:', e);
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

        await syncProductCategoryIds(supabase, id, categoryIds);

        revalidatePath('/admin/products');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to update product' };
    }
}

export async function bulkUpdateProducts(ids: string[], formData: FormData): Promise<ActionState> {
    if (!ids || ids.length === 0) return { success: true };
    const supabase = await createClient();

    const rawData: Record<string, unknown> = {};
    let categoryIds: string[] | undefined;
    
    // Only extract what was provided in formData (meaning it wasn't 'mixed' and was actively changed or kept)
    if (formData.has('brand_id')) {
        const val = formData.get('brand_id');
        rawData.brand_id = val === '' ? null : val;
    }
    if (formData.has('search_keywords')) rawData.search_keywords = formData.get('search_keywords');
    if (formData.has('stock_status')) rawData.stock_status = formData.get('stock_status');
    if (formData.has('availability')) rawData.availability = formData.get('availability');
    if (formData.has('is_special_order')) rawData.is_special_order = formData.get('is_special_order') === 'true';
    if (formData.has('is_taxable')) rawData.is_taxable = formData.get('is_taxable') === 'true';
    if (formData.has('published_at')) {
        const val = formData.get('published_at');
        rawData.published_at = val ? new Date(val as string).toISOString() : null;
    }

    if (formData.has('product_on_pages')) {
        try {
            rawData.shopsite_pages = JSON.parse(formData.get('product_on_pages') as string);
        } catch (e) {
            console.error('Failed to parse shopsite_pages for bulk update:', e);
        }
    }

    if (formData.has('category_ids')) {
        try {
            const parsedCategoryIds = JSON.parse(formData.get('category_ids') as string);
            if (Array.isArray(parsedCategoryIds)) {
                categoryIds = parsedCategoryIds.filter(
                    (categoryId): categoryId is string => typeof categoryId === 'string' && categoryId.trim().length > 0
                );
            }
        } catch (e) {
            console.error('Failed to parse category_ids for bulk update:', e);
        }
    }

    try {
        const validatedData = productSchema.partial().parse(rawData);

        // Update main product data if there are any changes
        if (Object.keys(validatedData).length > 0) {
            const { error } = await supabase
                .from('products')
                .update(validatedData)
                .in('id', ids);

            if (error) {
                console.error('Bulk Update Database Error:', error);
                return { success: false, error: 'Failed to bulk update products' };
            }
        }

        if (categoryIds !== undefined) {
            for (const id of ids) {
                await syncProductCategoryIds(supabase, id, categoryIds);
            }
        }

        // Handle pet types update
        if (formData.has('pet_types')) {
            try {
                const petTypes = JSON.parse(formData.get('pet_types') as string);
                if (Array.isArray(petTypes)) {
                    for (const id of ids) {
                        // Delete existing
                        await supabase
                            .from('product_pet_types')
                            .delete()
                            .eq('product_id', id);

                        // Insert new
                        if (petTypes.length > 0) {
                            const newLinks = petTypes.map(pt => ({
                                product_id: id,
                                pet_type_id: pt.pet_type_id
                            }));
                            await supabase
                                .from('product_pet_types')
                                .insert(newLinks);
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to parse and update pet types for bulk update:', e);
            }
        }

        revalidatePath('/admin/products');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to bulk update products' };
    }
}
