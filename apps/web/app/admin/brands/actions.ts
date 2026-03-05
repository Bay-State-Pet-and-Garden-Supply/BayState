'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';

const brandSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    logo_url: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
});

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function createBrand(formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        logo_url: formData.get('logo_url'),
        description: formData.get('description'),
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { error } = await supabase
            .from('brands')
            .insert(validatedData);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to create brand' };
        }

        revalidatePath('/admin/brands');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to create brand' };
    }
}

export async function updateBrand(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        logo_url: formData.get('logo_url'),
        description: formData.get('description'),
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { error } = await supabase
            .from('brands')
            .update(validatedData)
            .eq('id', id);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to update brand' };
        }

        revalidatePath('/admin/brands');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to update brand' };
    }
}

export async function deleteBrand(id: string): Promise<ActionState> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Database Error:', error);
        return { success: false, error: 'Failed to delete brand' };
    }

    revalidatePath('/admin/brands');
    return { success: true };
}
