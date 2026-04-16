import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Load environment variables from .supabase_env if not present
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fapnuczapctelxxmrail.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcG51Y3phcGN0ZWx4eG1yYWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc0MzcxOCwiZXhwIjoyMDgxMzE5NzE4fQ.-X_NU9wDFA5RwfQQ7oWrrorW_b9h_TSfGldtnrmqG2g';

const supabase = createClient(supabaseUrl, supabaseKey);
const API_BASE_URL = 'http://localhost:3000';

async function verifyScrapingRevert() {
    console.log('--- Starting Verification: Scraping Status Revert ---');

    // 1. Setup: Create a test runner and API key
    const apiKeyRaw = `bsr_${crypto.randomBytes(32).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(apiKeyRaw).digest('hex');
    const runnerName = `verify-runner-${Date.now()}`;

    console.log(`[Setup] Creating runner: ${runnerName}`);
    await supabase.from('scraper_runners').insert({ name: runnerName, status: 'online' });
    await supabase.from('runner_api_keys').insert({
        runner_name: runnerName,
        key_hash: keyHash,
        key_prefix: apiKeyRaw.substring(0, 8)
    });

    // 2. Setup: Create test SKUs in products_ingestion
    const timestamp = Date.now();
    const skuA = `VERIFY-A-${timestamp}`;
    const skuB = `VERIFY-B-${timestamp}`;
    const skuC = `VERIFY-C-${timestamp}`;
    const testSkus = [skuA, skuB, skuC];

    console.log(`[Setup] Creating test SKUs: ${testSkus.join(', ')}`);
    for (const sku of testSkus) {
        const { error } = await supabase.from('products_ingestion').upsert({
            sku,
            pipeline_status: 'scraping',
            updated_at: new Date().toISOString()
        });
        if (error) throw new Error(`Failed to create SKU ${sku}: ${error.message}`);
    }

    // 3. Setup: Create a test job in scrape_jobs
    const jobId = crypto.randomUUID();
    console.log(`[Setup] Creating job: ${jobId}`);
    const { error: jobError } = await supabase.from('scrape_jobs').insert({
        id: jobId,
        status: 'running',
        skus: testSkus,
        type: 'standard',
        test_mode: false
    });
    if (jobError) throw new Error(`Failed to create job: ${jobError.message}`);

    // --- TEST 1: Admin Callback Revert ---
    console.log('\n--- Test 1: Admin Callback Revert ---');
    const callbackPayload = {
        job_id: jobId,
        status: 'completed',
        results: {
            data: {
                [skuA]: {
                    sources: {
                        test: {
                            price: 10.99,
                            timestamp: new Date().toISOString()
                        }
                    }
                }
            }
        }
    };

    console.log(`[Test 1] Sending callback for ${skuA} only...`);
    const response = await fetch(`${API_BASE_URL}/api/admin/scraping/callback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKeyRaw
        },
        body: JSON.stringify(callbackPayload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Callback failed with status ${response.status}: ${errorText}`);
    }
    console.log(`[Test 1] Callback successful`);

    // Verify statuses
    console.log(`[Test 1] Verifying statuses in database...`);
    const { data: products, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status')
        .in('sku', testSkus);

    if (fetchError) throw fetchError;

    const statusMap = Object.fromEntries(products.map(p => [p.sku, p.pipeline_status]));
    console.log('[Test 1] Current statuses:', statusMap);

    if (statusMap[skuA] !== 'scraped') {
        throw new Error(`Expected ${skuA} to be 'scraped', but got '${statusMap[skuA]}'`);
    }
    if (statusMap[skuB] !== 'imported') {
        throw new Error(`Expected ${skuB} to be 'imported' (reverted), but got '${statusMap[skuB]}'`);
    }
    if (statusMap[skuC] !== 'imported') {
        throw new Error(`Expected ${skuC} to be 'imported' (reverted), but got '${statusMap[skuC]}'`);
    }
    console.log('✅ Test 1 Passed: SKUs correctly moved to scraped/imported');

    // --- TEST 2: Chunk Callback Revert ---
    console.log('\n--- Test 2: Chunk Callback Revert ---');
    const skuD = `VERIFY-D-${timestamp}`;
    const skuE = `VERIFY-E-${timestamp}`;
    const chunkSkus = [skuD, skuE];

    console.log(`[Setup] Creating chunk test SKUs: ${chunkSkus.join(', ')}`);
    for (const sku of chunkSkus) {
        await supabase.from('products_ingestion').upsert({
            sku,
            pipeline_status: 'scraping',
            updated_at: new Date().toISOString()
        });
    }

    const chunkJobId = crypto.randomUUID();
    console.log(`[Setup] Creating chunk job: ${chunkJobId}`);
    await supabase.from('scrape_jobs').insert({
        id: chunkJobId,
        status: 'running',
        skus: chunkSkus,
        type: 'standard',
        test_mode: false
    });

    const chunkId = crypto.randomUUID();
    await supabase.from('scrape_job_chunks').insert({
        id: chunkId,
        job_id: chunkJobId,
        chunk_index: 0,
        status: 'running',
        skus: chunkSkus
    });

    console.log(`[Test 2] Sending chunk callback for ${skuD} only...`);
    const chunkPayload = {
        chunk_id: chunkId,
        status: 'completed',
        results: {
            data: {
                [skuD]: {
                    sources: {
                        test: {
                            price: 20.99,
                            timestamp: new Date().toISOString()
                        }
                    }
                }
            },
            skus_processed: 1,
            skus_successful: 1,
            skus_failed: 0
        }
    };

    const chunkResponse = await fetch(`${API_BASE_URL}/api/scraper/v1/chunk-callback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKeyRaw
        },
        body: JSON.stringify(chunkPayload)
    });

    if (!chunkResponse.ok) {
        const errorText = await chunkResponse.text();
        throw new Error(`Chunk callback failed with status ${chunkResponse.status}: ${errorText}`);
    }
    console.log(`[Test 2] Chunk callback successful`);

    // Verify statuses
    console.log(`[Test 2] Verifying statuses in database...`);
    const { data: chunkProducts } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status')
        .in('sku', chunkSkus);

    const chunkStatusMap = Object.fromEntries(chunkProducts!.map(p => [p.sku, p.pipeline_status]));
    console.log('[Test 2] Current statuses:', chunkStatusMap);

    if (chunkStatusMap[skuD] !== 'scraped') {
        throw new Error(`Expected ${skuD} to be 'scraped', but got '${chunkStatusMap[skuD]}'`);
    }
    if (chunkStatusMap[skuE] !== 'imported') {
        throw new Error(`Expected ${skuE} to be 'imported' (reverted), but got '${chunkStatusMap[skuE]}'`);
    }
    console.log('✅ Test 2 Passed: Chunk SKUs correctly moved to scraped/imported');

    // --- TEST 3: Test Mode Job (No Status Change) ---
    console.log('\n--- Test 3: Test Mode Job (No Status Change) ---');
    const skuF = `VERIFY-F-${timestamp}`;
    console.log(`[Setup] Creating test-mode SKU: ${skuF}`);
    await supabase.from('products_ingestion').upsert({
        sku: skuF,
        pipeline_status: 'imported', // Should stay imported
        updated_at: new Date().toISOString()
    });

    const testJobId = crypto.randomUUID();
    console.log(`[Setup] Creating test-mode job: ${testJobId}`);
    await supabase.from('scrape_jobs').insert({
        id: testJobId,
        status: 'running',
        skus: [skuF],
        type: 'standard',
        test_mode: true
    });

    const testCallbackPayload = {
        job_id: testJobId,
        status: 'completed',
        results: {
            data: {
                [skuF]: {
                    sources: {
                        test: {
                            price: 30.99,
                            timestamp: new Date().toISOString()
                        }
                    }
                }
            }
        }
    };

    console.log(`[Test 3] Sending callback for test-mode job...`);
    await fetch(`${API_BASE_URL}/api/admin/scraping/callback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKeyRaw
        },
        body: JSON.stringify(testCallbackPayload)
    });

    const { data: testProduct } = await supabase
        .from('products_ingestion')
        .select('pipeline_status')
        .eq('sku', skuF)
        .single();

    console.log(`[Test 3] SKU ${skuF} status: ${testProduct?.pipeline_status}`);
    if (testProduct?.pipeline_status !== 'imported') {
        throw new Error(`Expected ${skuF} to stay 'imported', but got '${testProduct?.pipeline_status}'`);
    }
    console.log('✅ Test 3 Passed: Test mode job did not change status');

    console.log('\n--- All Verification Tests Passed! ---');

    // Cleanup
    console.log('[Cleanup] Removing test data...');
    await supabase.from('runner_api_keys').delete().eq('runner_name', runnerName);
    await supabase.from('scraper_runners').delete().eq('name', runnerName);
    await supabase.from('scrape_jobs').delete().in('id', [jobId, chunkJobId, testJobId]);
    await supabase.from('scrape_job_chunks').delete().eq('job_id', chunkJobId);
    await supabase.from('products_ingestion').delete().in('sku', [...testSkus, ...chunkSkus, skuF]);
}

verifyScrapingRevert().catch(err => {
    console.error('❌ Verification Failed:', err);
    process.exit(1);
});
