import { createClient } from '@/lib/supabase/server';
import { type Brand } from '@/lib/data';

/**
 * Fetches a single brand by ID.
 */
export async function getBrandById(id: string): Promise<Brand | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching brand:', error);
        return null;
    }

    return data;
}

/**
 * Creates a new brand.
 */
export async function createBrand(brandData: {
    name: string;
    slug: string;
    logo_url?: string | null;
}): Promise<Brand | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('brands')
        .insert(brandData)
        .select()
        .single();

    if (error) {
        console.error('Error creating brand:', error);
        return null;
    }

    return data;
}

/**
 * Updates an existing brand.
 */
export async function updateBrand(
    id: string,
    brandData: Partial<{ name: string; slug: string; logo_url: string | null }>
): Promise<Brand | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('brands')
        .update(brandData)
        .eq('id', id);

    if (error) {
        console.error('Error updating brand:', error);
        return null;
    }

    return data as Brand | null;
}

/**
 * Deletes a brand by ID.
 */
export async function deleteBrand(id: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting brand:', error);
        return false;
    }

    return true;
}
