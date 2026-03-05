import { createClient } from '@/lib/supabase/server';
import { type Service } from '@/lib/data';

/**
 * Fetches a single service by slug.
 */
export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching service:', error);
    return null;
  }

  return data;
}

/**
 * Fetches all active services.
 */
export async function getAllActiveServices(): Promise<Service[]> {
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
