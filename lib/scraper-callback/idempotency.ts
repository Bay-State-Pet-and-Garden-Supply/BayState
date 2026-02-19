import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

/**
 * Idempotency key types for different callback scenarios
 */
export type IdempotencyKeyType = 'admin' | 'chunk';

/**
 * Generate a deterministic idempotency key for callback deduplication
 * 
 * Strategy:
 * - Admin callback: job_id only (one result per job)
 * - Chunk callback: job_id + payload hash (aggregated results)
 * 
 * @param jobId The scrape job ID
 * @param type The type of callback ('admin' | 'chunk')
 * @param payload Optional payload to include in hash for chunks
 * @returns Deterministic idempotency key
 */
export function generateIdempotencyKey(
  jobId: string,
  type: IdempotencyKeyType,
  payload?: unknown
): string {
  if (type === 'admin') {
    // Admin callback: one result per job completion
    return `admin:${jobId}`;
  }
  
  // Chunk callback: include payload hash to detect different aggregation results
  const payloadHash = payload 
    ? createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
    : 'no-payload';
  return `chunk:${jobId}:${payloadHash}`;
}

/**
 * Check if a callback has already been processed (idempotency check)
 * 
 * Looks for existing scrape_results record with matching idempotency key
 * stored in the data JSONB field.
 * 
 * @param supabase Supabase client
 * @param idempotencyKey The idempotency key to check
 * @returns Object with processed status and existing record if found
 */
export async function checkCallbackIdempotency(
  supabase: SupabaseClient,
  idempotencyKey: string
): Promise<{
  processed: boolean;
  existingRecord?: { id: string; created_at: string };
}> {
  // Check for existing scrape_results with this idempotency key
  // The key is stored in data._idempotency_key
  const { data, error } = await supabase
    .from('scrape_results')
    .select('id, created_at, data')
    .filter('data->_idempotency_key', 'eq', idempotencyKey)
    .maybeSingle();

  if (error) {
    // Log but don't throw - we'll proceed with caution
    console.warn(`[Idempotency] Error checking for duplicate: ${error.message}`);
    return { processed: false };
  }

  if (data) {
    return {
      processed: true,
      existingRecord: {
        id: data.id,
        created_at: data.created_at,
      },
    };
  }

  return { processed: false };
}

/**
 * Record that a callback has been processed by inserting scrape_results
 * with idempotency metadata.
 * 
 * This should be called AFTER all persistence side effects succeed.
 * 
 * @param supabase Supabase client
 * @param jobId The scrape job ID
 * @param runnerName The runner that processed the job
 * @param idempotencyKey The idempotency key for this callback
 * @param resultsData The scrape results data
 * @returns The inserted record or error
 */
export async function recordCallbackProcessed(
  supabase: SupabaseClient,
  jobId: string,
  runnerName: string,
  idempotencyKey: string,
  resultsData: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('scrape_results').insert({
    job_id: jobId,
    runner_name: runnerName,
    data: {
      ...resultsData,
      _idempotency_key: idempotencyKey,
      _processed_at: new Date().toISOString(),
    },
  });

  if (error) {
    // Check if this is a unique constraint violation (race condition)
    if (error.message?.includes('unique constraint') || error.code === '23505') {
      console.log(`[Idempotency] Race condition detected for key ${idempotencyKey}`);
      return { success: true }; // Already recorded by another request
    }
    
    console.error(`[Idempotency] Failed to record callback: ${error.message}`);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Idempotency check result type
 */
export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingRecordId?: string;
  existingRecordCreatedAt?: string;
}

/**
 * Comprehensive idempotency guard for callback handlers.
 * 
 * Usage pattern in route handlers:
 * 1. Generate idempotency key
 * 2. Check if already processed
 * 3. If duplicate, return early success (no side effects)
 * 4. If new, execute all persistence operations
 * 5. Record callback as processed
 * 
 * @param supabase Supabase client
 * @param jobId The scrape job ID
 * @param type The callback type
 * @param payload Optional payload for hash generation
 * @returns Idempotency check result
 */
export async function checkIdempotency(
  supabase: SupabaseClient,
  jobId: string,
  type: IdempotencyKeyType,
  payload?: unknown
): Promise<{
  key: string;
  isDuplicate: boolean;
  existingRecordId?: string;
  existingRecordCreatedAt?: string;
}> {
  const key = generateIdempotencyKey(jobId, type, payload);
  const check = await checkCallbackIdempotency(supabase, key);

  return {
    key,
    isDuplicate: check.processed,
    existingRecordId: check.existingRecord?.id,
    existingRecordCreatedAt: check.existingRecord?.created_at,
  };
}
