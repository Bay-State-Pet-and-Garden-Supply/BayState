import { createClient } from '@/lib/supabase/server';

// Re-export types from lib/types.ts for backward compatibility
export type { Brand, Product, Service, Category } from '@/lib/types';
import type { Service, Brand } from '@/lib/types';

/**
 * Fetches all active services.
 */
export async function getActiveServices(): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching services:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetches all brands.
 */
export async function getBrands(): Promise<Brand[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching brands:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetches top-level categories for navigation.
 */
export async function getNavCategories(): Promise<Array<{
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  display_order: number | null;
  image_url: string | null;
  is_featured: boolean | null;
}>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, display_order, image_url, is_featured')
    .is('parent_id', null)
    .order('display_order');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetches pet types for navigation.
 */
export async function getPetTypesNav() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pet_types')
    .select('id, name, icon, display_order')
    .order('display_order');

  if (error) {
    console.error('Error fetching pet types:', error);
    return [];
  }

  return data || [];
}

// Re-export product functions from lib/products.ts for backward compatibility
// This ensures existing imports continue to work
export {
  getFeaturedProducts,
  getProductBySlug,
  getFilteredProducts as getProducts,
} from '@/lib/products';
