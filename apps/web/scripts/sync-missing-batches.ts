import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://fapnuczapctelxxmrail.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

if (!SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    throw new Error('Missing required environment variables: SUPABASE_SERVICE_ROLE_KEY and/or OPENAI_API_KEY');
}

const batchIds = [
    'batch_69974dc1ec64819088d1cbab3cc1cbf5',
    'batch_69974eeeb91c8190a79698b0f40d7cf4',
    'batch_69beca964dec81908a7493e494618d17',
    'batch_69becb278c7c8190995ba77c4600466b',
    'batch_69becbbda8148190905e14dd437c6703',
    'batch_69becd50ad7081908986fc40ff31b505'
];

async function syncAll() {
    console.log(`Standalone Sync: Processing ${batchIds.length} batches...`);
    
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    for (const batchId of batchIds) {
        try {
            console.log(`Fetching ${batchId} from OpenAI...`);
            const batch = await openai.batches.retrieve(batchId);
            const requestCounts = batch.request_counts || { total: 0, completed: 0, failed: 0 };
            
            const updateData = {
                status: batch.status,
                total_requests: requestCounts.total || 0,
                completed_requests: requestCounts.completed || 0,
                failed_requests: requestCounts.failed || 0,
                prompt_tokens: (batch as any).usage?.prompt_tokens || 0,
                completion_tokens: (batch as any).usage?.completion_tokens || 0,
                total_tokens: (batch as any).usage?.total_tokens || 0,
                output_file_id: batch.output_file_id,
                error_file_id: batch.error_file_id,
                input_file_id: batch.input_file_id,
                completed_at: batch.completed_at ? new Date(batch.completed_at * 1000).toISOString() : null
            };

            const { error } = await supabase
                .from('batch_jobs')
                .update(updateData)
                .eq('openai_batch_id', batchId);

            if (error) {
                console.error(`  DB Error for ${batchId}:`, error.message);
            } else {
                console.log(`  Synced ${batchId}: ${batch.status} (${updateData.completed_requests}/${updateData.total_requests})`);
            }
        } catch (error) {
            console.error(`  OpenAI Error for ${batchId}:`, error instanceof Error ? error.message : error);
        }
    }
    
    console.log('Sync complete.');
}

syncAll().catch(console.error);
