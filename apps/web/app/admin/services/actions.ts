'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';

const serviceSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    description: z.string().optional().nullable(),
    price: z.coerce.number().min(0).optional().nullable(),
    unit: z.string().optional().nullable(),
    is_active: z.coerce.boolean().default(true),
});

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function createService(formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        description: formData.get('description'),
        price: formData.get('price'),
        unit: formData.get('unit'),
        is_active: formData.get('is_active') === 'true',
    };

    try {
        const validatedData = serviceSchema.parse(rawData);

        const { error } = await supabase
            .from('services')
            .insert(validatedData);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to create service' };
        }

        revalidatePath('/admin/services');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to create service' };
    }
}

export async function updateService(id: string, formData: FormData): Promise<ActionState> {
    const supabase = await createClient();

    // If is_active is missing from formData, it might be because we're just updating other fields
    // However, for checkboxes, "on" means true, missing means false usually. 
    // But here we are matching the schema.

    const rawData: Record<string, unknown> = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        description: formData.get('description'),
        price: formData.get('price'),
        unit: formData.get('unit'),
    };

    // Only include is_active if it's explicitly in the form data or if we are doing a specific toggle
    // For safety, let's assume the modal sends everything.
    if (formData.has('is_active')) {
        rawData.is_active = formData.get('is_active') === 'true';
    }

    try {
        // We might need a partial schema for updates if not all fields are present? 
        // But for the modal, we send everything.
        // For the toggle in the list, we might want a separate action or just be careful.

        // Let's stick to the full update for the modal.
        const validatedData = serviceSchema.parse(rawData);

        const { error } = await supabase
            .from('services')
            .update(validatedData)
            .eq('id', id);

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to update service' };
        }

        revalidatePath('/admin/services');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to update service' };
    }
}

export async function toggleServiceStatus(id: string, isActive: boolean): Promise<ActionState> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('services')
        .update({ is_active: isActive })
        .eq('id', id);

    if (error) {
        console.error('Database Error:', error);
        return { success: false, error: 'Failed to toggle service status' };
    }

    revalidatePath('/admin/services');
    return { success: true };
}


export async function deleteService(id: string): Promise<ActionState> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Database Error:', error);
        return { success: false, error: 'Failed to delete service' };
    }

    revalidatePath('/admin/services');
    return { success: true };
}
