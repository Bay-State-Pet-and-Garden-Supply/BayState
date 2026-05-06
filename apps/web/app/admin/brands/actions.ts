'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';
import type { ActionState } from '@/lib/types';
import type { BrandActionState } from '@/components/admin/brands/types';
import {
  getBrandScraperMappings,
  setBrandScraperMappings,
  type MappingInput,
  type BrandScraperMapping,
} from '@/lib/admin/brand-scraper-mappings';

const brandSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    logo_url: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    official_domains: z.array(z.string()).optional(),
    preferred_domains: z.array(z.string()).optional(),
});

function parseDomainList(value: FormDataEntryValue | null): string[] {
    if (typeof value !== 'string') {
        return [];
    }

    return value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}


export async function createBrand(formData: FormData): Promise<BrandActionState> {
    const supabase = await createClient();

    const rawData = {
        name: formData.get('name'),
        slug: formData.get('slug'),
        logo_url: formData.get('logo_url'),
        description: formData.get('description'),
        official_domains: parseDomainList(formData.get('official_domains')).map(d => d.toLowerCase()),
        preferred_domains: parseDomainList(formData.get('preferred_domains')).map(d => d.toLowerCase()),
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { data, error } = await supabase
            .from('brands')
            .insert(validatedData)
            .select('id, name, slug, logo_url, description, official_domains, preferred_domains, created_at')
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
        official_domains: parseDomainList(formData.get('official_domains')).map(d => d.toLowerCase()),
        preferred_domains: parseDomainList(formData.get('preferred_domains')).map(d => d.toLowerCase()),
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { data, error } = await supabase
            .from('brands')
            .update(validatedData)
            .eq('id', id)
            .select('id, name, slug, logo_url, description, official_domains, preferred_domains, created_at')
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

async function requireAdminOrStaff(): Promise<{ id: string; email?: string } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = profile?.role;
    if (!role || (role !== 'admin' && role !== 'staff')) {
        return null;
    }

    return { id: user.id, email: user.email };
}

export async function getAvailableScraperConfigsAction(): Promise<{
    success: boolean;
    scrapers?: { id: string; slug: string; name: string; display_name: string }[];
    error?: string;
}> {
    const user = await requireAdminOrStaff();
    if (!user) {
        return { success: false, error: 'Forbidden: Admin or staff access required' };
    }

    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('scraper_configs')
            .select('id, slug, display_name')
            .order('display_name', { ascending: true });

        if (error) {
            throw error;
        }

        return {
            success: true,
            scrapers: (data || []).map((c: { id: string; slug: string; display_name: string | null }) => ({
                id: c.id,
                slug: c.slug,
                name: c.slug,
                display_name: c.display_name || c.slug,
            })),
        };
    } catch (err) {
        console.error('Error fetching scraper configs:', err);
        return { success: false, error: 'Failed to fetch scraper configs' };
    }
}

export async function getBrandScraperMappingsAction(brandId: string): Promise<{
    success: boolean;
    mappings?: BrandScraperMapping[];
    error?: string;
}> {
    const user = await requireAdminOrStaff();
    if (!user) {
        return { success: false, error: 'Forbidden: Admin or staff access required' };
    }

    try {
        const mappings = await getBrandScraperMappings(brandId);
        return { success: true, mappings };
    } catch (err) {
        console.error('Error fetching brand scraper mappings:', err);
        return { success: false, error: 'Failed to fetch brand scraper mappings' };
    }
}

const mappingSchema = z.array(z.object({
    scraperConfigId: z.string().uuid(),
    priority: z.number().int(),
    notes: z.string().max(500).optional(),
    isActive: z.boolean().optional().default(true),
})).max(50);

export async function updateBrandScraperMappings(
    brandId: string,
    mappings: MappingInput[]
): Promise<ActionState> {
    const user = await requireAdminOrStaff();
    if (!user) {
        return { success: false, error: 'Forbidden: Admin or staff access required' };
    }

    try {
        const validatedMappings = mappingSchema.parse(mappings);
        await setBrandScraperMappings(brandId, validatedMappings, user.id);
        revalidatePath('/admin/brands');
        return { success: true };
    } catch (err) {
        if (err instanceof z.ZodError) {
            return { success: false, error: 'Validation failed: ' + err.issues[0].message };
        }
        console.error('Error updating brand scraper mappings:', err);
        return { success: false, error: 'Failed to update brand scraper mappings' };
    }
}
