
import { createClient } from '@supabase/supabase-js';
import { assignCohortsToProducts } from '../apps/web/lib/pipeline/cohorts';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from apps/web
const envPath = path.resolve(process.cwd(), 'apps/web/.supabase_env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .supabase_env:', result.error);
}

// Explicitly set vars if they are in different names in .supabase_env
process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'PRESENT' : 'MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'PRESENT' : 'MISSING');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in apps/web/.supabase_env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    console.log('--- Starting Cohort Re-assignment ---');
    console.log('Using prefix length: 6');

    // 1. Reset cohort_id in products_ingestion to force re-assignment
    console.log('Resetting cohort_id for all products in products_ingestion...');
    const { error: resetError } = await supabase
        .from('products_ingestion')
        .update({ cohort_id: null })
        .not('sku', 'is', null);

    if (resetError) {
        console.error('Error resetting cohort_id:', resetError);
        process.exit(1);
    }
    console.log('Successfully reset cohort_id for all products.');

    // 2. Clear existing cohort_members to prevent duplicates or orphaned records
    console.log('Clearing existing cohort_members...');
    const { error: clearMembersError } = await supabase
        .from('cohort_members')
        .delete()
        .not('cohort_id', 'is', null);

    if (clearMembersError) {
        console.error('Error clearing cohort_members:', clearMembersError);
        // Not exiting, as we can still attempt assignment
    } else {
        console.log('Successfully cleared cohort_members.');
    }

    // 3. Clear existing cohort_batches (optional, but cleaner for a fresh start)
    // We only clear cohorts that were auto-generated to avoid deleting manual ones
    console.log('Clearing auto-generated cohort_batches...');
    const { error: clearBatchesError } = await supabase
        .from('cohort_batches')
        .delete()
        .contains('metadata', { auto_generated: true });

    if (clearBatchesError) {
        console.error('Error clearing cohort_batches:', clearBatchesError);
    } else {
        console.log('Successfully cleared auto-generated cohort_batches.');
    }

    // 4. Run the assignment logic
    console.log('Running assignCohortsToProducts...');
    const stats = await assignCohortsToProducts();

    console.log('--- Re-assignment Complete ---');
    console.log(`Processed: ${stats.processed} products`);
    console.log(`Cohorts Created: ${stats.cohortsCreated}`);
    console.log(`Members Added: ${stats.membersAdded}`);
    
    process.exit(0);
}

run();
