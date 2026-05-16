'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProductsBatch(
  skus: string[],
  updates: {
    brand_id?: string | null;
    official_domains?: string[];
    // Add other fields as needed
  }
) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('products_ingestion')
    .update(updates)
    .in('sku', skus);

  if (error) throw error;
  
  revalidatePath('/admin/pipeline');
  return { success: true };
}

export async function updateCohortBatch(
  cohortId: string,
  updates: {
    brand_id?: string | null;
    brand_name?: string | null;
    name?: string | null;
  }
) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('cohort_batches')
    .update(updates)
    .eq('id', cohortId);

  if (error) throw error;
  
  revalidatePath('/admin/pipeline');
  return { success: true };
}
