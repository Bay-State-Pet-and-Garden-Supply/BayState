
import { createClient } from '@supabase/supabase-js';
import { interpolateCohortName } from '../apps/web/lib/pipeline/cohorts';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from apps/web
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Fetching all cohorts...');
    const { data: cohorts, error: cohortError } = await supabase
        .from('cohort_batches')
        .select('id, upc_prefix, name');

    if (cohortError) {
        console.error('Error fetching cohorts:', cohortError);
        return;
    }

    console.log(`Found ${cohorts.length} cohorts. Checking for missing names...`);

    for (const cohort of cohorts) {
        if (cohort.name) {
            console.log(`Cohort ${cohort.upc_prefix} already has name: ${cohort.name}. Skipping.`);
            continue;
        }

        console.log(`Interpolating name for cohort ${cohort.id} (${cohort.upc_prefix})...`);
        
        // Fetch member product names
        const { data: members, error: memberError } = await supabase
            .from('cohort_members')
            .select('product_sku');

        if (memberError) {
            console.error(`Error fetching members for cohort ${cohort.id}:`, memberError);
            continue;
        }

        const skus = members.map(m => m.product_sku);
        if (skus.length === 0) {
            console.log(`No members found for cohort ${cohort.id}. Skipping.`);
            continue;
        }

        const { data: products, error: productError } = await supabase
            .from('products_ingestion')
            .select('input')
            .in('sku', skus);

        if (productError) {
            console.error(`Error fetching products for cohort ${cohort.id}:`, productError);
            continue;
        }

        const names = products
            .map(p => (p.input as any)?.name)
            .filter(Boolean) as string[];

        if (names.length === 0) {
            console.log(`No product names found for cohort ${cohort.id}. Skipping.`);
            continue;
        }

        const interpolatedName = interpolateCohortName(names);
        if (interpolatedName) {
            console.log(`Updating cohort ${cohort.id} name to: ${interpolatedName}`);
            const { error: updateError } = await supabase
                .from('cohort_batches')
                .update({ name: interpolatedName })
                .eq('id', cohort.id);

            if (updateError) {
                console.error(`Error updating cohort ${cohort.id}:`, updateError);
            }
        } else {
            console.log(`Could not interpolate name for cohort ${cohort.id}.`);
        }
    }

    console.log('Done!');
}

run();
