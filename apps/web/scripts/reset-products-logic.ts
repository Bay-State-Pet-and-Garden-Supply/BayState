import { createAdminClient } from '../lib/supabase/server';

/**
 * Logic for resetting published products and purging placeholders.
 * Target: Products table (published_at = null, is_featured = false).
 * Purge: Test products identified by slug or name pattern.
 */
export async function resetProducts() {
  const supabase = await createAdminClient();

  // 1. Reset 'published_at' and 'is_featured' for ALL products
  // Supabase updates require a filter - using a guaranteed mismatch to target all records
  const { error: resetError } = await supabase
    .from('products')
    .update({
      published_at: null,
      is_featured: false,
    })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (resetError) {
    throw new Error(`Reset failed: ${resetError.message}`);
  }

  // 2. Delete placeholder products
  // Identify placeholders by known accessibility test slugs or name patterns
  const { error: deleteError } = await supabase
    .from('products')
    .delete()
    .or('slug.eq.test-product,name.ilike.Test %');

  if (deleteError) {
    throw new Error(`Deletion of placeholders failed: ${deleteError.message}`);
  }

  return { success: true };
}
