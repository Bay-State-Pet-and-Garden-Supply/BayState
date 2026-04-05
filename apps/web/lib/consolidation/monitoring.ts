import { createAdminClient } from '@/lib/supabase/server';
import {
    getGeminiFeatureFlagAuditLog,
    getGeminiFeatureFlagsSafe,
} from '@/lib/config/gemini-feature-flags';
import { syncPendingParallelRuns } from './parallel-runs';

type ProviderKey = 'openai' | 'openai_compatible' | 'gemini';

interface ProviderSummary {
    jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    total_cost: number;
    avg_cost_per_job: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

function createProviderSummary(): ProviderSummary {
    return {
        jobs: 0,
        completed_jobs: 0,
        failed_jobs: 0,
        total_cost: 0,
        avg_cost_per_job: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
    };
}

function isMissingSchemaResource(error: { code?: string; message?: string } | null): boolean {
    if (!error) {
        return false;
    }

    return error.code === 'PGRST204'
        || error.code === '42P01'
        || error.message?.toLowerCase().includes('does not exist') === true
        || error.message?.toLowerCase().includes('could not find the') === true;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function normalizeProvider(value: unknown): ProviderKey {
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

function buildAlerts(input: {
    trafficPercent: number;
    averageAccuracy: number | null;
    recentParallelFailures: number;
    geminiCompletedJobs: number;
}): string[] {
    const alerts: string[] = [];

    if (input.trafficPercent > 0 && input.geminiCompletedJobs === 0) {
        alerts.push('Gemini traffic is enabled but no Gemini batch jobs completed in the selected window.');
    }

    if (input.averageAccuracy !== null && input.averageAccuracy < 0.9) {
        alerts.push('Parallel run accuracy fell below the 0.90 migration threshold.');
    }

    if (input.recentParallelFailures > 0) {
        alerts.push('One or more recent parallel runs failed and need investigation.');
    }

    return alerts;
}

export async function getGeminiMigrationMonitoring(days = 30): Promise<Record<string, unknown>> {
    const flags = await getGeminiFeatureFlagsSafe();
    await syncPendingParallelRuns(10);

    const [auditLog, supabase] = await Promise.all([
        getGeminiFeatureFlagAuditLog(10),
        createAdminClient(),
    ]);

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const batchQuery = async () => {
        const response = await supabase
            .from('batch_jobs')
            .select(
                'provider, status, estimated_cost, prompt_tokens, completion_tokens, total_tokens, created_at, completed_at, description, provider_batch_id, metadata'
            )
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(50);

        if (!isMissingSchemaResource(response.error)) {
            return response;
        }

        const legacyResponse = await supabase
            .from('batch_jobs')
            .select('status, estimated_cost, total_tokens, created_at, completed_at, description, openai_batch_id, metadata')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(50);

        return {
            data: (legacyResponse.data ?? []).map((row) => ({
                ...row,
                provider: 'openai',
                provider_batch_id: row.openai_batch_id,
                prompt_tokens: null,
                completion_tokens: null,
            })),
            error: legacyResponse.error,
        };
    };

    const parallelRunsQuery = async () => {
        const response = await supabase
            .from('llm_parallel_runs')
            .select('*')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(25);

        if (isMissingSchemaResource(response.error)) {
            return { data: [], error: null };
        }

        return response;
    };

    const [{ data: batchJobs, error: batchError }, { data: parallelRuns, error: parallelError }] =
        await Promise.all([batchQuery(), parallelRunsQuery()]);

    if (batchError) {
        throw new Error(`Failed to fetch batch jobs: ${batchError.message}`);
    }

    if (parallelError) {
        throw new Error(`Failed to fetch parallel runs: ${parallelError.message}`);
    }

    const providerSummary: Record<ProviderKey, ProviderSummary> = {
        openai: createProviderSummary(),
        openai_compatible: createProviderSummary(),
        gemini: createProviderSummary(),
    };

    for (const row of batchJobs ?? []) {
        const provider = normalizeProvider(row.provider);
        const summary = providerSummary[provider];
        summary.jobs += 1;
        summary.total_cost += toNumber(row.estimated_cost);
        summary.prompt_tokens += toNumber(row.prompt_tokens);
        summary.completion_tokens += toNumber(row.completion_tokens);
        summary.total_tokens += toNumber(row.total_tokens);

        if (row.status === 'completed') {
            summary.completed_jobs += 1;
        }

        if (row.status === 'failed' || row.status === 'expired' || row.status === 'cancelled') {
            summary.failed_jobs += 1;
        }
    }

    for (const provider of Object.keys(providerSummary) as ProviderKey[]) {
        const summary = providerSummary[provider];
        summary.avg_cost_per_job = summary.jobs > 0 ? summary.total_cost / summary.jobs : 0;
    }

    const normalizedParallelRuns = (parallelRuns ?? []).map((row) => {
        const comparison = normalizeRecord(row.comparison);
        return {
            id: row.id,
            subject_key: row.subject_key,
            status: row.status,
            primary_provider: row.primary_provider,
            primary_batch_id: row.primary_batch_id,
            shadow_provider: row.shadow_provider,
            shadow_batch_id: row.shadow_batch_id,
            sample_percent: row.sample_percent,
            comparison,
            primary_summary: normalizeRecord(row.primary_summary),
            shadow_summary: normalizeRecord(row.shadow_summary),
            created_at: row.created_at,
            completed_at: row.completed_at,
            metadata: normalizeRecord(row.metadata),
        };
    });

    const completedComparisons = normalizedParallelRuns
        .filter((run) => run.status === 'completed')
        .map((run) => run.comparison)
        .filter((comparison) => typeof comparison.accuracy === 'number');

    const averageAccuracy = completedComparisons.length > 0
        ? completedComparisons.reduce((sum, comparison) => sum + toNumber(comparison.accuracy), 0)
            / completedComparisons.length
        : null;
    const averageCompleteness = completedComparisons.length > 0
        ? completedComparisons.reduce((sum, comparison) => sum + toNumber(comparison.completeness), 0)
            / completedComparisons.length
        : null;
    const averageTaxonomy = completedComparisons.length > 0
        ? completedComparisons.reduce((sum, comparison) => sum + toNumber(comparison.taxonomy_correctness), 0)
            / completedComparisons.length
        : null;

    const openAiAverageCost =
        providerSummary.openai.jobs > 0 ? providerSummary.openai.avg_cost_per_job : null;
    const geminiAverageCost =
        providerSummary.gemini.jobs > 0 ? providerSummary.gemini.avg_cost_per_job : null;
    const estimatedSavingsPercent =
        openAiAverageCost && geminiAverageCost && openAiAverageCost > 0
            ? ((openAiAverageCost - geminiAverageCost) / openAiAverageCost) * 100
            : null;

    return {
        dateRange: {
            days,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
        },
        flags,
        auditLog,
        rollout: {
            traffic_percent: flags.GEMINI_TRAFFIC_PERCENT,
            parallel_enabled: flags.GEMINI_PARALLEL_RUN_ENABLED,
            sample_percent: flags.GEMINI_PARALLEL_SAMPLE_PERCENT,
            batch_enabled: flags.GEMINI_BATCH_ENABLED,
            stage:
                flags.GEMINI_TRAFFIC_PERCENT >= 100
                    ? '100%'
                    : flags.GEMINI_TRAFFIC_PERCENT >= 50
                        ? '50%'
                        : flags.GEMINI_TRAFFIC_PERCENT >= 10
                            ? '10%'
                            : 'disabled',
        },
        providers: providerSummary,
        parallel_runs: {
            total: normalizedParallelRuns.length,
            completed: normalizedParallelRuns.filter((run) => run.status === 'completed').length,
            failed: normalizedParallelRuns.filter((run) => run.status === 'failed').length,
            average_accuracy: averageAccuracy,
            average_completeness: averageCompleteness,
            average_taxonomy_correctness: averageTaxonomy,
            recent: normalizedParallelRuns,
        },
        estimated_savings_percent: estimatedSavingsPercent,
        alerts: buildAlerts({
            trafficPercent: flags.GEMINI_TRAFFIC_PERCENT,
            averageAccuracy,
            recentParallelFailures: normalizedParallelRuns.filter((run) => run.status === 'failed').length,
            geminiCompletedJobs: providerSummary.gemini.completed_jobs,
        }),
        recent_jobs: batchJobs ?? [],
    };
}
