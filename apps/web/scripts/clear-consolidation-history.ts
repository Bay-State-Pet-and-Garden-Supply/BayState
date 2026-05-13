/**
 * Clear all past consolidation runs.
 * Usage: cd apps/web && npx tsx scripts/clear-consolidation-history.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    process.exit(1);
}

const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
    // 1. Reset stranded products
    const { data: stranded } = await supabase
        .from('products_ingestion')
        .select('sku')
        .eq('pipeline_status', 'consolidating');

    const strandedSkus = (stranded || []).map((r: { sku: string }) => r.sku);

    if (strandedSkus.length > 0) {
        const { error: resetErr } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: 'scraped',
                error_message: 'Reset after consolidation history cleared',
                updated_at: new Date().toISOString(),
            })
            .in('sku', strandedSkus);
        if (resetErr) {
            console.error('Failed to reset stranded products:', resetErr.message);
        } else {
            console.log(`✓ Reset ${strandedSkus.length} stranded products consolidating → scraped`);
        }
    } else {
        console.log('✓ No stranded products');
    }

    // 2. Delete batch_job_items
    const { count: itemsCount, error: itemsErr } = await supabase
        .from('batch_job_items')
        .delete({ count: 'exact' })
        .not('id', 'is', null);

    if (itemsErr) {
        if (itemsErr.code === '42P01') {
            console.log('  (batch_job_items table not found)');
        } else {
            console.error('Failed to delete batch_job_items:', itemsErr.message);
        }
    } else {
        console.log(`✓ Deleted ${itemsCount ?? 0} batch_job_items rows`);
    }

    // 3. Delete batch_jobs
    const { count: jobsCount, error: jobsErr } = await supabase
        .from('batch_jobs')
        .delete({ count: 'exact' })
        .not('id', 'is', null);

    if (jobsErr) {
        if (jobsErr.code === '42P01') {
            console.log('  (batch_jobs table not found)');
        } else {
            console.error('Failed to delete batch_jobs:', jobsErr.message);
        }
    } else {
        console.log(`✓ Deleted ${jobsCount ?? 0} batch_jobs rows`);
    }

    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
