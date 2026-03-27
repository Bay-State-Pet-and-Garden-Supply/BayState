import { createAdminClient } from '../lib/supabase/server';

/**
 * Logic for resetting published products and purging placeholders.
 * Target: Products table + storefront settings (published_at = null, is_featured = false).
 * Purge: Test products identified by slug or name pattern.
 */
export async function resetProducts() {
  const supabase = await createAdminClient();

  // 1. Reset published_at for all products
  const { error: resetProductsError } = await supabase
    .from('products')
    .update({
      published_at: null,
    })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (resetProductsError) {
    throw new Error(`Product reset failed: ${resetProductsError.message}`);
  }

  // 2. Reset featured flags in the dedicated storefront settings table
  const { error: resetSettingsError } = await supabase
    .from('product_storefront_settings')
    .update({
      is_featured: false,
    })
    .neq('product_id', '00000000-0000-0000-0000-000000000000');

  if (resetSettingsError) {
    throw new Error(`Storefront settings reset failed: ${resetSettingsError.message}`);
  }

  // 3. Delete placeholder products
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
