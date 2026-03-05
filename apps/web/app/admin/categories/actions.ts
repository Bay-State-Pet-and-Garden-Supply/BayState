'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';

const categorySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    description: z.string().optional().nullable(),
    parent_id: z.string().optional().nullable(),
    display_order: z.coerce.number().default(0),
    image_url: z.string().optional().nullable(),
    is_featured: z.coerce.boolean().default(false),
});

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function createCategory(formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        description: formData.get('description'),
        parent_id: formData.get('parent_id') || null,
        display_order: formData.get('display_order'),
        image_url: formData.get('image_url'),
        is_featured: formData.get('is_featured') === 'true',
    };

    try {
        const validatedData = categorySchema.parse(rawData);

        const { error } = await supabase
            .from('categories')
            .insert(validatedData);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to create category' };
        }

        revalidatePath('/admin/categories');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to create category' };
    }
}

export async function updateCategory(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        description: formData.get('description'),
        parent_id: formData.get('parent_id') || null,
        display_order: formData.get('display_order'),
        image_url: formData.get('image_url'),
        is_featured: formData.get('is_featured') === 'true',
    };

    try {
        const validatedData = categorySchema.parse(rawData);

        const { error } = await supabase
            .from('categories')
            .update(validatedData)
            .eq('id', id);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to update category' };
        }

        revalidatePath('/admin/categories');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to update category' };
    }
}

export async function deleteCategory(id: string): Promise<ActionState> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Database Error:', error);
        return { success: false, error: 'Failed to delete category' };
    }

    revalidatePath('/admin/categories');
    return { success: true };
}
