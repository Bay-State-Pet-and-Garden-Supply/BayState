import { createClient } from '@supabase/supabase-js';
import { canonicalizeBrandName } from '../lib/facets/normalization';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase environment variables. Looking for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    console.log('Available env keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const dryRun = process.argv.includes('--dry-run');

async function normalizeBrands() {
    console.log(`Starting brand normalization${dryRun ? ' (DRY RUN)' : ''}...`);

    // 1. Fetch all brands
    const { data: brands, error: fetchError } = await supabase
        .from('brands')
        .select('*')
        .order('created_at', { ascending: true });

    if (fetchError || !brands) {
        console.error('Failed to fetch brands:', fetchError?.message);
        return;
    }

    console.log(`Fetched ${brands.length} brands.`);

    // 2. Group by canonical name
    const groups = new Map<string, any[]>();

    // First pass to map product counts
    const { data: counts, error: countError } = await supabase.from('products').select('brand_id');
    
    const countMap = new Map<string, number>();
    if (counts && Array.isArray(counts)) {
        counts.forEach((c: any) => {
            if (c.brand_id) {
                countMap.set(c.brand_id, (countMap.get(c.brand_id) || 0) + 1);
            }
        });
    }

    for (const brand of brands) {
        const key = canonicalizeBrandName(brand.name);
        if (!key) continue;
        
        const group = groups.get(key) || [];
        group.push({ ...brand, product_count: countMap.get(brand.id) || 0 });
        groups.set(key, group);
    }

    const duplicates = Array.from(groups.values()).filter(g => g.length > 1);
    console.log(`Found ${duplicates.length} brand groups with duplicates.`);

    let totalMerged = 0;
    let totalUpdatedProducts = 0;

    for (const group of duplicates) {
        // Sort by product count DESC, then created_at ASC (oldest)
        group.sort((a, b) => {
            if (b.product_count !== a.product_count) {
                return b.product_count - a.product_count;
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        const canonicalBrand = group[0]; 
        const otherBrands = group.slice(1);
        const otherIds = otherBrands.map(b => b.id);

        console.log(`\nMerging into "${canonicalBrand.name}" (${canonicalBrand.id}) [Products: ${canonicalBrand.product_count}]:`);
        for (const other of otherBrands) {
            console.log(`  - "${other.name}" (${other.id}) [Products: ${other.product_count}]`);
        }

        if (!dryRun) {
            // Update products
            const { count, error: updateError } = await supabase
                .from('products')
                .update({ brand_id: canonicalBrand.id })
                .in('brand_id', otherIds);

            if (updateError) {
                console.error(`  FAILED to update products: ${updateError.message}`);
                continue;
            }

            console.log(`  Updated ${count || 0} products.`);
            totalUpdatedProducts += (count || 0);

            // Update products_ingestion (consolidated JSONB brand_id)
            for (const otherId of otherIds) {
                const { count: ingestionCount, error: ingestionError } = await supabase
                    .from('products_ingestion')
                    .update({
                        consolidated: supabase.rpc('jsonb_set', {
                            target: 'consolidated',
                            path: '{brand_id}',
                            new_value: `"${canonicalBrand.id}"`
                        } as any)
                    } as any)
                    .filter('consolidated->>brand_id', 'eq', otherId);

                // Wait, rpc for jsonb_set might not be available or tricky via JS client.
                // Alternative: Use raw SQL for the update
                const { error: sqlError } = await supabase.rpc('execute_sql', {
                    sql: `UPDATE products_ingestion SET consolidated = jsonb_set(consolidated, '{brand_id}', '"${canonicalBrand.id}"') WHERE consolidated->>'brand_id' = '${otherId}'`
                });

                if (sqlError) {
                    // Fallback to fetching and updating if RPC fails
                    const { data: rows } = await supabase
                        .from('products_ingestion')
                        .select('sku, consolidated')
                        .filter('consolidated->>brand_id', 'eq', otherId);

                    if (rows && rows.length > 0) {
                        for (const row of rows) {
                            const nextConsolidated = { ...(row.consolidated as any), brand_id: canonicalBrand.id };
                            await supabase.from('products_ingestion').update({ consolidated: nextConsolidated }).eq('sku', row.sku);
                        }
                        console.log(`  Updated ${rows.length} ingestion records.`);
                    }
                } else {
                    console.log(`  Updated ingestion records via SQL.`);
                }
            }
            
            // Delete duplicate brands
            const { error: deleteError } = await supabase
                .from('brands')
                .delete()
                .in('id', otherIds);

            if (deleteError) {
                console.error(`  FAILED to delete duplicates: ${deleteError.message}`);
            } else {
                console.log(`  Deleted ${otherIds.length} duplicate brands.`);
                totalMerged += otherIds.length;
            }
        } else {
            console.log(`  [Dry Run] Would update products and delete ${otherIds.length} brands.`);
        }
    }

    console.log(`\nNormalization complete.`);
    console.log(`Total brands merged: ${totalMerged}`);
    console.log(`Total products updated: ${totalUpdatedProducts}`);
}

normalizeBrands().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
