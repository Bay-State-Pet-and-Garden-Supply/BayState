
import { createClient } from './apps/web/lib/supabase/server';

async function checkExtracting() {
    const supabase = await createClient();
    const { data, error, count } = await supabase
        .from('products_ingestion')
        .select('sku, cohort_id, updated_at', { count: 'exact' })
        .eq('pipeline_status', 'extracting');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${count} products in 'extracting' state.`);
    if (data && data.length > 0) {
        console.log('Sample SKUs:', data.slice(0, 5).map(d => d.sku));
        const cohortIds = [...new Set(data.map(d => d.cohort_id))];
        console.log('Cohort IDs involved:', cohortIds);
    }
}

checkExtracting();
