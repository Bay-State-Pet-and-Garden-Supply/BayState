import type { LLMProvider } from '@/lib/ai-scraping/credentials';
import { createAdminClient } from '@/lib/supabase/server';
import {
    compareConsolidationResults,
    summarizeComparisons,
} from './evaluation';
import type {
    ConsolidationResult,
    ParallelRunRecord,
} from './types';

type ParallelRunSummary = Record<string, unknown>;

interface RegisterParallelRunParams {
    subjectKey: string;
    primaryProvider: LLMProvider;
    primaryBatchId: string;
    shadowProvider: LLMProvider;
    shadowBatchId: string | null;
    samplePercent: number;
    status?: ParallelRunRecord['status'];
    metadata?: Record<string, unknown>;
    comparison?: Record<string, unknown>;
}

function normalizeProvider(value: unknown): LLMProvider {
    if (value === 'gemini' || value === 'openai_compatible') {
        return value;
    }

    return 'openai';
}

function normalizeRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return {};
}

function normalizeParallelRunRow(row: Record<string, unknown>): ParallelRunRecord {
    return {
        id: String(row.id),
        workflow: 'consolidation',
        subject_key: typeof row.subject_key === 'string' ? row.subject_key : '',
        primary_provider: normalizeProvider(row.primary_provider),
        primary_batch_id: typeof row.primary_batch_id === 'string' ? row.primary_batch_id : '',
        shadow_provider: normalizeProvider(row.shadow_provider),
        shadow_batch_id: typeof row.shadow_batch_id === 'string' ? row.shadow_batch_id : null,
        sample_percent: typeof row.sample_percent === 'number' ? row.sample_percent : 0,
        status:
            row.status === 'running' || row.status === 'completed' || row.status === 'failed'
                ? row.status
                : 'pending',
        primary_summary: normalizeRecord(row.primary_summary),
        shadow_summary: normalizeRecord(row.shadow_summary),
        comparison: normalizeRecord(row.comparison),
        metadata: normalizeRecord(row.metadata),
        created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
        completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    };
}

function summarizeBatchResults(results: ConsolidationResult[]): ParallelRunSummary {
    const successfulResults = results.filter((result) => !result.error);
    const failedResults = results.filter((result) => !!result.error);

    return {
        total_results: results.length,
        successful_results: successfulResults.length,
        failed_results: failedResults.length,
        skus: results.map((result) => result.sku),
        error_skus: failedResults.map((result) => result.sku),
    };
}

function buildFailureComparison(error: string): Record<string, unknown> {
    return {
        accuracy: 0,
        completeness: 0,
        taxonomy_correctness: 0,
        mismatch_count: 0,
        compared_count: 0,
        mismatched_fields: [],
        error,
    };
}

async function updateParallelRun(
    id: string,
    updates: Record<string, unknown>
): Promise<ParallelRunRecord | null> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('llm_parallel_runs')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

    if (error || !data) {
        return null;
    }

    return normalizeParallelRunRow(data as Record<string, unknown>);
}

export async function registerParallelRun(
    params: RegisterParallelRunParams
): Promise<ParallelRunRecord | null> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('llm_parallel_runs')
        .insert({
            workflow: 'consolidation',
            subject_key: params.subjectKey,
            primary_provider: params.primaryProvider,
            primary_batch_id: params.primaryBatchId,
            shadow_provider: params.shadowProvider,
            shadow_batch_id: params.shadowBatchId,
            sample_percent: params.samplePercent,
            status: params.status ?? 'pending',
            metadata: params.metadata ?? {},
            comparison: params.comparison ?? {},
        })
        .select('*')
        .single();

    if (error || !data) {
        console.error('[ParallelRuns] Failed to register parallel run:', error?.message ?? 'Unknown error');
        return null;
    }

    return normalizeParallelRunRow(data as Record<string, unknown>);
}

export async function listParallelRuns(limit = 20): Promise<ParallelRunRecord[]> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('llm_parallel_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error || !data) {
        console.error('[ParallelRuns] Failed to list parallel runs:', error?.message ?? 'Unknown error');
        return [];
    }

    return data.map((row) => normalizeParallelRunRow(row as Record<string, unknown>));
}

export async function syncParallelRunComparison(parallelRunId: string): Promise<ParallelRunRecord | null> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('llm_parallel_runs')
        .select('*')
        .eq('id', parallelRunId)
        .single();

    if (error || !data) {
        return null;
    }

    const run = normalizeParallelRunRow(data as Record<string, unknown>);
    if (!run.shadow_batch_id) {
        return updateParallelRun(run.id, {
            status: 'failed',
            comparison: buildFailureComparison('Shadow batch ID is missing'),
        });
    }

    const { getBatchStatus, retrieveResults } = await import('./batch-service');
    const [primaryStatus, shadowStatus] = await Promise.all([
        getBatchStatus(run.primary_batch_id),
        getBatchStatus(run.shadow_batch_id),
    ]);

    if ('success' in primaryStatus) {
        return updateParallelRun(run.id, {
            status: 'failed',
            comparison: buildFailureComparison(primaryStatus.error),
        });
    }

    if ('success' in shadowStatus) {
        return updateParallelRun(run.id, {
            status: 'failed',
            comparison: buildFailureComparison(shadowStatus.error),
        });
    }

    if (!primaryStatus.is_complete || !shadowStatus.is_complete) {
        return updateParallelRun(run.id, {
            status: primaryStatus.is_processing || shadowStatus.is_processing ? 'running' : 'pending',
        });
    }

    const [primaryResultsRaw, shadowResultsRaw] = await Promise.all([
        retrieveResults(run.primary_batch_id),
        retrieveResults(run.shadow_batch_id),
    ]);

    if (!Array.isArray(primaryResultsRaw)) {
        return updateParallelRun(run.id, {
            status: 'failed',
            comparison: buildFailureComparison(primaryResultsRaw.error),
        });
    }

    if (!Array.isArray(shadowResultsRaw)) {
        return updateParallelRun(run.id, {
            status: 'failed',
            comparison: buildFailureComparison(shadowResultsRaw.error),
        });
    }

    const primaryBySku = new Map(primaryResultsRaw.map((result) => [result.sku, result]));
    const shadowBySku = new Map(shadowResultsRaw.map((result) => [result.sku, result]));
    const comparisonSkus = Array.from(
        new Set([...primaryBySku.keys(), ...shadowBySku.keys()])
    ).sort();

    const comparisons = comparisonSkus.map((sku) =>
        compareConsolidationResults(
            primaryBySku.get(sku) ?? { sku, error: 'Missing primary result' },
            shadowBySku.get(sku) ?? { sku, error: 'Missing shadow result' }
        )
    );

    const comparison = summarizeComparisons(comparisons);
    return updateParallelRun(run.id, {
        status: 'completed',
        primary_summary: summarizeBatchResults(primaryResultsRaw),
        shadow_summary: summarizeBatchResults(shadowResultsRaw),
        comparison,
        completed_at: new Date().toISOString(),
    });
}

export async function syncPendingParallelRuns(limit = 20): Promise<ParallelRunRecord[]> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('llm_parallel_runs')
        .select('id')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error || !data) {
        console.error('[ParallelRuns] Failed to load pending runs:', error?.message ?? 'Unknown error');
        return [];
    }

    const synced: ParallelRunRecord[] = [];
    for (const row of data) {
        const result = await syncParallelRunComparison(String(row.id));
        if (result) {
            synced.push(result);
        }
    }

    return synced;
}
