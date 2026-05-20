import { SupabaseClient } from '@supabase/supabase-js';
import { groupSkusByPrefix } from '@/lib/admin/cohort-utils';

/**
 * Re-cohorts products based on their UPC prefix and a new brand assignment.
 * This resolves mixed-brand cohorts by splitting them into brand-specific "pure" cohorts.
 */
export async function recohortProducts(
  supabase: SupabaseClient,
  skus: string[],
  brandId: string | null
) {
  if (!skus.length) return;

  // 1. Fetch products to get their current cohort IDs, brand IDs, and UPC prefixes
  const { data: products, error: fetchError } = await supabase
    .from('products_ingestion')
    .select('sku, cohort_id, brand_id, consolidated')
    .in('sku', skus);

  if (fetchError || !products) {
    console.error('[recohortProducts] Failed to fetch products:', fetchError);
    return;
  }

  const oldCohortIds = new Set(products.map(p => p.cohort_id).filter(Boolean) as string[]);
  
  // 2. Group SKUs by UPC prefix
  const groups = groupSkusByPrefix(skus);

  for (const [prefix, groupSkus] of groups.entries()) {
    if (prefix === 'UNGROUPED') continue;

    // 3. Find or create target cohort for this (prefix, brandId)
    let targetCohortId: string;
    
    let query = supabase
      .from('cohort_batches')
      .select('id')
      .eq('upc_prefix', prefix);

    if (brandId === null) {
      query = query.is('brand_id', null);
    } else {
      query = query.eq('brand_id', brandId);
    }

    const { data: existingCohort } = await query.maybeSingle();

    if (existingCohort) {
      targetCohortId = existingCohort.id;
    } else {
      // Create new cohort
      const { data: newCohort, error: createError } = await supabase
        .from('cohort_batches')
        .insert({
          upc_prefix: prefix,
          brand_id: brandId,
          status: 'completed',
          name: prefix,
        })
        .select('id')
        .single();

      if (createError || !newCohort) {
        console.error(`[recohortProducts] Failed to create cohort for ${prefix}:`, createError);
        continue;
      }
      targetCohortId = newCohort.id;
    }

    // 4. Update products_ingestion for this group
    // Fetch current state for these products to preserve other consolidated fields
    const { data: currentProducts } = await supabase
      .from('products_ingestion')
      .select('sku, brand_id, consolidated')
      .in('sku', groupSkus);

    for (const sku of groupSkus) {
      const product = currentProducts?.find(p => p.sku === sku);
      const currentConsolidated = (product?.consolidated as Record<string, unknown>) || {};
      
      const updatedConsolidated = {
        ...currentConsolidated,
        brand_id: brandId
      };

      const oldBrandId = product?.brand_id || null;
      const brandChanged = brandId !== oldBrandId;

      // Determine status transition: reset to imported when brand is assigned or changed
      const statusUpdate: Record<string, unknown> = {};
      if (brandId !== null && brandChanged) {
        statusUpdate.pipeline_status = 'imported';
      }

      await supabase
        .from('products_ingestion')
        .update({
          cohort_id: targetCohortId,
          brand_id: brandId,  // Write durable brand_id for source plan eligibility
          consolidated: updatedConsolidated,
          pipeline_status: statusUpdate.pipeline_status ?? undefined,
          updated_at: new Date().toISOString()
        })
        .eq('sku', sku);
    }

    // 5. Update cohort_members
    // Upsert into cohort_members for the target cohort
    const memberRows = groupSkus.map((sku, index) => ({
      cohort_id: targetCohortId,
      product_sku: sku,
      upc_prefix: prefix,
      sort_order: index // Optional: recalculate sort order properly if needed
    }));

    await supabase
      .from('cohort_members')
      .upsert(memberRows, { onConflict: 'cohort_id,product_sku' });
      
    // Remove from old cohorts if they were different
    for (const oldId of oldCohortIds) {
      if (oldId === targetCohortId) continue;
      await supabase
        .from('cohort_members')
        .delete()
        .eq('cohort_id', oldId)
        .in('product_sku', groupSkus);
    }
  }

  // 6. Cleanup empty cohorts
  for (const oldId of oldCohortIds) {
    const { count } = await supabase
      .from('cohort_members')
      .select('*', { count: 'exact', head: true })
      .eq('cohort_id', oldId);

    if (count === 0) {
      await supabase
        .from('cohort_batches')
        .delete()
        .eq('id', oldId);
    }
  }
}
