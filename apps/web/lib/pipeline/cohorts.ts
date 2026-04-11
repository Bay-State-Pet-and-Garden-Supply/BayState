import { createAdminClient } from '@/lib/supabase/server';

const DEFAULT_PREFIX_LENGTH = 8;

/**
 * Normalizes a SKU by removing dashes and spaces.
 */
export function normalizeSku(sku: string): string {
    if (!sku) return '';
    return sku.replace(/[- ]/g, '').trim();
}

/**
 * Extracts a prefix of specified length from a SKU.
 */
export function extractSkuPrefix(sku: string, length: number = DEFAULT_PREFIX_LENGTH): string {
    const normalized = normalizeSku(sku);
    if (normalized.length >= length) {
        return normalized.slice(0, length);
    }
    return normalized;
}

/**
 * Finds the longest common prefix of words among a list of product names.
 * Useful for interpolating a cohort name from its members.
 */
export function interpolateCohortName(names: string[]): string | null {
    const validNames = names.filter((n) => typeof n === 'string' && n.trim().length > 0);
    if (validNames.length === 0) return null;
    if (validNames.length === 1) return validNames[0].trim();

    // Split each name into words (case-insensitive for comparison, but preserving original case for result)
    const wordArrays = validNames.map((name) => name.trim().split(/\s+/));
    const firstWordArray = wordArrays[0];

    let commonWordCount = 0;
    for (let i = 0; i < firstWordArray.length; i++) {
        const wordToMatch = firstWordArray[i].toLowerCase();
        let allMatch = true;
        for (let j = 1; j < wordArrays.length; j++) {
            if (i >= wordArrays[j].length || wordArrays[j][i].toLowerCase() !== wordToMatch) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) {
            commonWordCount++;
        } else {
            break;
        }
    }

    if (commonWordCount === 0) {
        return null;
    }

    return firstWordArray.slice(0, commonWordCount).join(' ');
}

/**
 * Assigns products in products_ingestion to cohorts based on their SKU prefixes.
 * Creates cohort_batches and cohort_members if they don't exist.
 * Updates cohort_id and product_line in products_ingestion.
 * 
 * @param skus - Array of SKUs to process. If empty, processes all products with null cohort_id.
 */
export async function assignCohortsToProducts(skus?: string[]): Promise<{
    processed: number;
    cohortsCreated: number;
    membersAdded: number;
}> {
    const supabase = await createAdminClient();
    
    // 1. Fetch products that need cohort assignment
    let query = supabase
        .from('products_ingestion')
        .select('sku, product_line, cohort_id, input');
    
    if (skus && skus.length > 0) {
        query = query.in('sku', skus);
    } else {
        query = query.is('cohort_id', null);
    }
    
    const { data: products, error: fetchError } = await query;
    
    if (fetchError || !products) {
        console.error('[Cohorts] Failed to fetch products for assignment:', fetchError);
        return { processed: 0, cohortsCreated: 0, membersAdded: 0 };
    }
    
    if (products.length === 0) {
        return { processed: 0, cohortsCreated: 0, membersAdded: 0 };
    }
    
    const stats = {
        processed: products.length,
        cohortsCreated: 0,
        membersAdded: 0,
    };
    
    // 2. Group products by prefix
    const prefixGroups = new Map<string, { sku: string; name?: string }[]>();
    for (const product of products) {
        const prefix = extractSkuPrefix(product.sku);
        if (!prefix) continue;
        
        if (!prefixGroups.has(prefix)) {
            prefixGroups.set(prefix, []);
        }
        
        let productName = '';
        if (product.input && typeof product.input === 'object' && 'name' in product.input) {
            productName = String((product.input as { name?: string }).name || '');
        }
        
        prefixGroups.get(prefix)!.push({ sku: product.sku, name: productName });
    }
    
    // 3. Process each group
    for (const [prefix, groupProducts] of prefixGroups.entries()) {
        try {
            // Find or create cohort_batch
            const { data: cohort, error: cohortError } = await supabase
                .from('cohort_batches')
                .select('id, name')
                .eq('upc_prefix', prefix)
                .single();
            
            let cohortId: string;
            const groupSkus = groupProducts.map((p) => p.sku);
            const groupNames = groupProducts.map((p) => p.name).filter(Boolean) as string[];
            const interpolatedName = interpolateCohortName(groupNames);
            
            if (cohortError || !cohort) {
                // Create new cohort batch
                const { data: newCohort, error: createError } = await supabase
                    .from('cohort_batches')
                    .insert({
                        upc_prefix: prefix,
                        product_line: prefix,
                        name: interpolatedName,
                        status: 'pending',
                        metadata: {
                            auto_generated: true,
                            generated_at: new Date().toISOString(),
                            source: 'pipeline_auto_assignment'
                        }
                    })
                    .select('id')
                    .single();
                
                if (createError || !newCohort) {
                    console.error(`[Cohorts] Failed to create cohort for prefix ${prefix}:`, createError);
                    continue;
                }
                
                cohortId = newCohort.id;
                stats.cohortsCreated++;
            } else {
                cohortId = cohort.id;
                
                // If it exists but lacks a name, update it if we have one
                if (!cohort.name && interpolatedName) {
                    await supabase
                        .from('cohort_batches')
                        .update({ name: interpolatedName })
                        .eq('id', cohortId);
                }
            }
            
            // Add to cohort_members
            const memberRows = groupSkus.map((sku, index) => ({
                cohort_id: cohortId,
                product_sku: sku,
                upc_prefix: prefix,
                sort_order: index,
            }));
            
            const { error: memberError } = await supabase
                .from('cohort_members')
                .upsert(memberRows, { onConflict: 'cohort_id,product_sku' });
            
            if (memberError) {
                console.error(`[Cohorts] Failed to add members to cohort ${cohortId}:`, memberError);
                continue;
            }
            
            stats.membersAdded += groupSkus.length;
            
            // Update products_ingestion
            const { error: updateError } = await supabase
                .from('products_ingestion')
                .update({
                    cohort_id: cohortId,
                    product_line: prefix,
                })
                .in('sku', groupSkus);
            
            if (updateError) {
                console.error(`[Cohorts] Failed to update products_ingestion for cohort ${cohortId}:`, updateError);
            }
        } catch (err) {
            console.error(`[Cohorts] Unexpected error processing prefix ${prefix}:`, err);
        }
    }
    
    return stats;
}
