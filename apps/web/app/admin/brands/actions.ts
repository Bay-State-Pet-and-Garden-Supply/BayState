'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';
import type { ActionState } from '@/lib/types';
import type { BrandActionState } from '@/components/admin/brands/types';

const brandSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    logo_url: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    website_url: z.string().optional().nullable(),
    official_domains: z.array(z.string()).optional(),
    preferred_domains: z.array(z.string()).optional(),
});

function parseDomainList(value: FormDataEntryValue | null): string[] {
    if (typeof value !== 'string') {
        return [];
    }

    return value
        .split(/[\n,]/)
        .map((item) => item.trim().toLowerCase())
        .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}


export async function createBrand(formData: FormData): Promise<BrandActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        logo_url: formData.get('logo_url'),
        description: formData.get('description'),
        website_url: formData.get('website_url'),
        official_domains: parseDomainList(formData.get('official_domains')),
        preferred_domains: parseDomainList(formData.get('preferred_domains')),
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { data, error } = await supabase
            .from('brands')
            .insert(validatedData)
            .select('id, name, slug, logo_url, description, website_url, official_domains, preferred_domains, created_at')
            .single();

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to create brand' };
        }

        revalidatePath('/admin/brands');
        revalidatePath('/');
        revalidatePath('/brands');
        revalidatePath('/products');
        revalidatePath('/', 'layout');
        return { success: true, brand: data ?? undefined };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        return { success: false, error: 'Failed to create brand' };
    }
}

export async function updateBrand(id: string, formData: FormData): Promise<BrandActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        logo_url: formData.get('logo_url'),
        description: formData.get('description'),
        website_url: formData.get('website_url'),
        official_domains: parseDomainList(formData.get('official_domains')),
        preferred_domains: parseDomainList(formData.get('preferred_domains')),
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { data, error } = await supabase
            .from('brands')
            .update(validatedData)
            .eq('id', id)
            .select('id, name, slug, logo_url, description, website_url, official_domains, preferred_domains, created_at')
            .single();

        if (error) {
            console.error('Database Error:', error);
            return { success: false, error: 'Failed to update brand' };
        }

        revalidatePath('/admin/brands');
        revalidatePath('/');
        revalidatePath('/brands');
        revalidatePath('/products');
        revalidatePath('/', 'layout');
        return { success: true, brand: data ?? undefined };
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
    revalidatePath('/');
    revalidatePath('/brands');
    revalidatePath('/products');
    revalidatePath('/', 'layout');
    return { success: true };
}
