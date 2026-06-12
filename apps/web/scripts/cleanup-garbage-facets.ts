/**
 * Cleanup Garbage Facets Script
 * 
 * Retroactively identifies and cleans up duplicate or garbage facet values
 * (such as "AdultAdult" and "Harvest Chicken") in the database, merging
 * product links and deleting the invalid facet values.
 */

import { createAdminClient } from '../lib/supabase/server';
import { 
    getCanonicalFacetValues, 
    validateFacetValue,
    normalizeSlug
} from '../lib/consolidation/facet-vocabulary';

async function main() {
    console.log('[Cleanup] Starting retroactive database facet cleanup...');
    const supabase = await createAdminClient();

    // 1. Get current active vocabulary mapping
    const vocabulary = await getCanonicalFacetValues();

    // 2. Fetch all facet definitions
    const { data: defs, error: defError } = await supabase
        .from('facet_definitions')
        .select('id, name, slug')
        .eq('is_deprecated', false);

    if (defError || !defs) {
        console.error('[Cleanup] Failed to fetch facet definitions:', defError);
        process.exit(1);
    }

    let totalMerged = 0;
    let totalDeleted = 0;

    for (const def of defs) {
        const normSlug = normalizeSlug(def.slug);
        
        // Fetch all values for this definition
        const { data: vals, error: valError } = await supabase
            .from('facet_values')
            .select('id, value, normalized_value, slug')
            .eq('facet_definition_id', def.id);

        if (valError || !vals) {
            console.error(`[Cleanup] Failed to fetch values for definition ${def.name}:`, valError);
            continue;
        }

        console.log(`[Cleanup] Checking ${vals.length} values for "${def.name}"...`);

        // We build a temporary vocabulary map scoped to this definition's current values
        // to help resolve duplicates to existing canonical values.
        // E.g. if both "Chicken" and "Harvest Chicken" exist, we want "Harvest Chicken" to resolve to "Chicken".
        const tempVocab = new Map<string, string[]>();
        tempVocab.set(normSlug, vals.map(v => v.value));

        for (const val of vals) {
            // Run our validation/normalization on this value
            const resolvedValue = validateFacetValue(normSlug, val.value, tempVocab);
            
            // If it resolves to a different (canonical/shorter) existing value
            if (resolvedValue && resolvedValue !== val.value) {
                const canonicalValRow = vals.find(v => v.value === resolvedValue);
                if (!canonicalValRow) continue;

                console.log(`[Cleanup] Mapping duplicate "${val.value}" (ID: ${val.id}) -> canonical "${resolvedValue}" (ID: ${canonicalValRow.id})`);

                // 1. Update product links
                // Find all product links using the duplicate value
                const { data: links, error: linkError } = await supabase
                    .from('product_facets')
                    .select('product_id')
                    .eq('facet_value_id', val.id);

                if (linkError) {
                    console.error(`[Cleanup] Failed to fetch product links for "${val.value}":`, linkError);
                    continue;
                }

                if (links && links.length > 0) {
                    console.log(`[Cleanup] Merging links for ${links.length} products...`);
                    for (const link of links) {
                        try {
                            // Try to point the product to the canonical facet value
                            const { error: insertError } = await supabase
                                .from('product_facets')
                                .insert({
                                    product_id: link.product_id,
                                    facet_value_id: canonicalValRow.id
                                });

                            if (insertError) {
                                // If unique constraint fails (product already has the canonical facet value),
                                // it's fine, we can just proceed.
                                if (!insertError.message.includes('unique') && !insertError.code?.includes('23505')) {
                                    console.error(`[Cleanup] Error linking product ${link.product_id}:`, insertError);
                                }
                            }
                        } catch (e) {
                            // Ignored (unique constraint block)
                        }
                    }
                    totalMerged += links.length;
                }

                // 2. Delete the duplicate product links (clean up links pointing to old value)
                const { error: deleteLinksError } = await supabase
                    .from('product_facets')
                    .delete()
                    .eq('facet_value_id', val.id);

                if (deleteLinksError) {
                    console.error(`[Cleanup] Failed to delete duplicate product links for "${val.value}":`, deleteLinksError);
                    continue;
                }

                // 3. Delete the duplicate facet value row
                const { error: deleteValError } = await supabase
                    .from('facet_values')
                    .delete()
                    .eq('id', val.id);

                if (deleteValError) {
                    console.error(`[Cleanup] Failed to delete duplicate facet value "${val.value}":`, deleteValError);
                } else {
                    console.log(`[Cleanup] Successfully deleted duplicate facet value "${val.value}"`);
                    totalDeleted++;
                }
            }
        }
    }

    console.log(`[Cleanup] Cleanup completed successfully.`);
    console.log(`[Cleanup] Total product links merged: ${totalMerged}`);
    console.log(`[Cleanup] Total duplicate facet values deleted: ${totalDeleted}`);
}

main().catch((err) => {
    console.error('[Cleanup] Fatal error during cleanup:', err);
    process.exit(1);
});
