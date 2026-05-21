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
    };

    try {
        const validatedData = brandSchema.parse(rawData);

        const { data, error } = await supabase
            .from('brands')
            .insert(validatedData)
            .select('id, name, slug, logo_url, description, official_domains, preferred_domains, created_at')
            .single();

        if (error) {
            console.error('Database Error in createBrand:', error);
            return { success: false, error: 'Failed to create brand' };
        }

        // Auto-sync official brand source in brand_sources
        await syncOfficialBrandSource(supabase, data.id, data.slug, data.name, data.official_domains ?? []);

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
            console.error('Database Error in updateBrand:', error);
            return { success: false, error: 'Failed to update brand' };
        }

        // Auto-sync official brand source in brand_sources
        await syncOfficialBrandSource(supabase, data.id, data.slug, data.name, data.official_domains ?? []);

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
        console.error('Database Error in deleteBrand:', error);
        return { success: false, error: 'Failed to delete brand' };
    }

    revalidatePath('/admin/brands');
    revalidatePath('/');
    revalidatePath('/brands');
    revalidatePath('/products');
    revalidatePath('/', 'layout');
    return { success: true };
}

async function syncOfficialBrandSource(
  supabase: any,
  brandId: string,
  slug: string,
  name: string,
  officialDomains: string[]
): Promise<void> {
  if (!officialDomains || officialDomains.length === 0) {
    // If no official domains are set, remove any existing official_brand source for this brand
    const { error } = await supabase
      .from('brand_sources')
      .delete()
      .eq('brand_id', brandId)
      .eq('source_type', 'official_brand');
    
    if (error) {
      console.error('Error deleting official brand source during sync:', error);
    }
    return;
  }

  // Upsert the official_brand source
  const sourceData = {
    brand_id: brandId,
    source_type: 'official_brand',
    source_slug: slug,
    display_name: name,
    domains: officialDomains,
    asset_domains: [],
    crawl4ai_adapter_slug: 'crawl4ai_direct',
    requires_auth: false,
    credential_ref: null,
    search_mode: 'domain_search',
    allowed_fields: ['title', 'description', 'images', 'ingredients', 'guaranteed_analysis', 'category'],
    priority: 50,
    enabled: true,
  };

  const { error } = await supabase
    .from('brand_sources')
    .upsert(sourceData, {
      onConflict: 'brand_id,source_type,source_slug'
    });

  if (error) {
    console.error('Error upserting official brand source during sync:', error);
  }
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
