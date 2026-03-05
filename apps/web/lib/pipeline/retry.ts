/**
 * Manual Retry Logic for Pipeline
 * 
 * Handles retry queue management for failed products.
 */

import { createClient } from '@/lib/supabase/server';

export interface RetryRequest {
    jobType: string;
    originalJobId: string;
    retryReason: string;
    requestedBy: string;
    priority?: number;
    maxAttempts?: number;
}

export interface RetryQueueItem {
    id: string;
    job_type: string;
    original_job_id: string;
    retry_reason: string;
    requested_by: string;
    priority: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    attempt_count: number;
    max_attempts: number;
    error_log: string[];
    created_at: string;
}

/**
 * Create a retry request for a failed job
 */
export async function createRetryRequest(request: RetryRequest): Promise<{ success: boolean; retryId?: string; error?: string }> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('pipeline_retry_queue')
        .insert({
            job_type: request.jobType,
            original_job_id: request.originalJobId,
            retry_reason: request.retryReason,
            requested_by: request.requestedBy,
            priority: request.priority ?? 5,
            max_attempts: request.maxAttempts ?? 3,
            status: 'pending',
        })
        .select('id')
        .single();

    if (error) {
        console.error('[Retry] Failed to create retry request:', error);
        return { success: false, error: error.message };
    }

    return { success: true, retryId: data.id };
}

/**
 * Get pending retries for processing
 */
export async function getPendingRetries(limit: number = 10): Promise<RetryQueueItem[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .rpc('get_pending_retries', { p_limit: limit });

    if (error) {
        console.error('[Retry] Failed to get pending retries:', error);
        return [];
    }

    return data as RetryQueueItem[];
}

/**
 * Mark retry as processing
 */
export async function markRetryProcessing(retryId: string): Promise<boolean> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('pipeline_retry_queue')
        .update({
            status: 'processing',
            attempt_count: supabase.rpc('increment', { row_id: retryId }),
            last_attempt_at: new Date().toISOString(),
        })
        .eq('id', retryId);

    return !error;
}

/**
 * Mark retry as completed
 */
export async function markRetryCompleted(retryId: string): Promise<boolean> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('pipeline_retry_queue')
        .update({ status: 'completed' })
        .eq('id', retryId);

    return !error;
}

/**
 * Mark retry as failed and log error
 */
export async function markRetryFailed(retryId: string, errorMessage: string): Promise<boolean> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('pipeline_retry_queue')
        .update({
            status: 'failed',
            error_log: supabase.rpc('array_append', { 
                row_id: retryId, 
                element: `${new Date().toISOString()}: ${errorMessage}` 
            }),
        })
        .eq('id', retryId);

    return !error;
}

/**
 * Get retry history for a job
 */
export async function getJobRetryHistory(jobType: string, jobId: string): Promise<RetryQueueItem[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .rpc('get_job_retry_history', { p_job_type: jobType, p_job_id: jobId });

    if (error) {
        console.error('[Retry] Failed to get retry history:', error);
        return [];
    }

    return data as RetryQueueItem[];
}
