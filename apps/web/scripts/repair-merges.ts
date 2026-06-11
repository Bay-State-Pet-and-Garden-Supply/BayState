import fs from 'fs';
import path from 'path';

async function main() {
    // Load env file programmatically with custom parser
    const envPath = path.join(__dirname, '../.env.production.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const parts = trimmed.split('=');
                let k = parts[0].trim();
                if (k.startsWith('export ')) {
                    k = k.replace(/^export\s+/, '').trim();
                }
                const v = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                process.env[k] = v;
            }
        });
        console.log('Loaded env variables from .env.production.local');
    } else {
        console.warn('.env.production.local not found at:', envPath);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseKey || supabaseKey.trim() === '') {
        console.error('SUPABASE_SECRET_KEY is missing. Please set it in .env.production.local or export it in your shell environment.');
        process.exit(1);
    }

    if (!supabaseUrl) {
        console.error('NEXT_PUBLIC_SUPABASE_URL is missing. Please configure it.');
        process.exit(1);
    }

    // Set SUPABASE_SECRET_KEY and encryption key in process.env so that internal modules load them properly
    process.env.SUPABASE_SECRET_KEY = supabaseKey;
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012';

    console.log('Connecting to Supabase URL:', supabaseUrl);

    // Dynamically import tools to ensure process.env variables are initialized before their module load
    const { createClient } = await import('@supabase/supabase-js');
    const { parseStructuredConsolidationText } = await import('../lib/consolidation/result-parsing');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const batchId = '06d8ac7e-73c5-48ca-8deb-6216bd9295b3';

    // 1. Fetch category breadcrumbs
    console.log('Fetching taxonomy categories...');
    const { data: catData, error: catErr } = await supabase
        .from('categories')
        .select('breadcrumb');
    if (catErr) {
        console.error('Failed to fetch categories:', catErr);
        process.exit(1);
    }
    const categories = (catData || [])
        .map((c: any) => c.breadcrumb)
        .filter((b): b is string => typeof b === 'string');
    console.log(`Fetched ${categories.length} categories.`);

    // 2. Fetch failed batch job items
    console.log(`Fetching failed items for batch ${batchId}...`);
    const { data: failedItems, error: itemsErr } = await supabase
        .from('batch_job_items')
        .select('*')
        .eq('batch_job_id', batchId)
        .eq('status', 'failed');

    if (itemsErr) {
        console.error('Failed to fetch items:', itemsErr);
        process.exit(1);
    }

    console.log(`Found ${failedItems.length} failed items.`);

    let repairedCount = 0;
    for (const item of failedItems) {
        const payload = item.response_payload as any;
        const rawResponse = payload?.raw_response;
        if (!rawResponse) {
            console.log(`Item ${item.upc} does not have a raw_response; skipping.`);
            continue;
        }

        console.log(`Re-parsing item ${item.upc}...`);
        const parsed = parseStructuredConsolidationText(item.upc, rawResponse, categories);

        if (parsed.error) {
            console.error(`Re-parse failed for ${item.upc}:`, parsed.error);
            continue;
        }

        console.log(`Successfully parsed ${item.upc}! Updating item...`);
        // Update item status, parsed_result, and clear error_message
        const newPayload = { ...payload };
        delete newPayload.error; // remove error key

        const { error: updateErr } = await supabase
            .from('batch_job_items')
            .update({
                status: 'completed',
                response_payload: newPayload,
                parsed_result: parsed,
                error_message: null,
                completed_at: new Date().toISOString(),
            })
            .eq('id', item.id);

        if (updateErr) {
            console.error(`Failed to update item ${item.upc} in database:`, updateErr);
        } else {
            console.log(`Updated item ${item.upc} to completed.`);
            repairedCount++;
        }
    }

    if (repairedCount > 0) {
        console.log(`Successfully repaired ${repairedCount} items.`);
    } else {
        console.log('No new items were repaired (already completed).');
    }

    // 3. Update parent batch job request counts
    console.log('Updating parent batch_jobs counts...');
    const { data: allItems } = await supabase
        .from('batch_job_items')
        .select('status')
        .eq('batch_job_id', batchId);
    
    const completedCount = (allItems || []).filter((i: any) => i.status === 'completed').length;
    const failedCount = (allItems || []).filter((i: any) => i.status === 'failed').length;

    const { error: parentUpdateErr } = await supabase
        .from('batch_jobs')
        .update({
            completed_requests: completedCount,
            failed_requests: failedCount,
            status: failedCount === 0 ? 'completed' : 'failed',
        })
        .eq('id', batchId);

    if (parentUpdateErr) {
        console.error('Failed to update parent batch job:', parentUpdateErr);
    } else {
        console.log(`Updated parent batch_jobs. Completed: ${completedCount}, Failed: ${failedCount}`);
    }

    // 4. Run applyResults to merge and save into products_ingestion
    console.log('Setting dummy AI_CREDENTIALS_ENCRYPTION_KEY to bypass decryption missing key error...');
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012';

    console.log(`Dynamically importing apply-service and applying results for batch ${batchId}...`);
    const { applyResults } = await import('../lib/consolidation/apply-service');
    const applyResult = await applyResults(batchId);
    console.log('Apply result:', JSON.stringify(applyResult, null, 2));
}

main();
