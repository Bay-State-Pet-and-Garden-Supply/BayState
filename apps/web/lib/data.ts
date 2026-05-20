import { createPublicClient } from '@/lib/supabase/server';
import {
  buildTaxonomyNodes,
  type TaxonomyCategoryNode,
  type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';

// Re-export types from lib/types.ts for backward compatibility
export type { Brand, Product, Service } from '@/lib/types';
import type { Service, Brand } from '@/lib/types';

/**
 * Fetches all active services.
 */
export async function getActiveServices(): Promise<Service[]> {
  const supabase = createPublicClient();
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
  const supabase = createPublicClient();
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
export async function getNavCategories(): Promise<TaxonomyCategoryNode[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, display_order, image_url, is_featured, department_key, depth, breadcrumb, facet_profile, seo_title, seo_description, synonym_keywords, sort_order, is_active')
    .eq('is_active', true)
    .order('display_order');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return buildTaxonomyNodes((data || []) as TaxonomyCategoryRecord[]);
}

/**
 * Fetches pet types for navigation.
 */
export async function getPetTypesNav() {
  const supabase = createPublicClient();
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

/**
 * Fetches a single category by its slug.
 */
export async function getCategoryBySlug(slug: string): Promise<TaxonomyCategoryRecord | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, description, display_order, image_url, is_featured, department_key, depth, breadcrumb, facet_profile, seo_title, seo_description, synonym_keywords, sort_order, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching category by slug:', error);
    }
    return null;
  }

  return data as TaxonomyCategoryRecord;
}

/**
 * Fetches a single brand by its slug.
 */
export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching brand by slug:', error);
    }
    return null;
  }

  return data;
}

// Re-export product functions from lib/products.ts for backward compatibility
// This ensures existing imports continue to work
export {
  getFeaturedProducts,
  getFilteredProducts as getProducts,
  getProductsByIds,
} from '@/lib/products';
