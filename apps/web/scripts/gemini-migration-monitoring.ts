import {
  getGeminiFeatureFlagAuditLog,
  getGeminiFeatureFlagsSafe,
} from '@/lib/config/gemini-feature-flags';
import { requireServiceRoleClient, parseIntegerOption } from './gemini-migration-utils';

type ProviderKey = 'openai' | 'openai_compatible' | 'gemini';

interface ProviderSummary {
  jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  total_cost: number;
  avg_cost_per_job: number;
  total_tokens: number;
}

function createProviderSummary(): ProviderSummary {
  return {
    jobs: 0,
    completed_jobs: 0,
    failed_jobs: 0,
    total_cost: 0,
    avg_cost_per_job: 0,
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
  if (value === 'openai_compatible' || value === 'gemini') {
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

function parseArgs(argv: string[]): { days: number } {
  const options = { days: 30 };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--days':
        options.days = parseIntegerOption(arg, argv[index + 1], 30);
        index += 1;
        break;
      case '--help':
      case '-h':
        console.log('Usage: bun scripts/gemini-migration-monitoring.ts [--days <number>]');
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const supabase = requireServiceRoleClient();
  const [flags, auditLog] = await Promise.all([
    getGeminiFeatureFlagsSafe(),
    getGeminiFeatureFlagAuditLog(10),
  ]);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - options.days * 24 * 60 * 60 * 1000);

  const batchQuery = async () => {
    const response = await supabase
      .from('batch_jobs')
      .select('provider, status, estimated_cost, total_tokens, created_at, description')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (!isMissingSchemaResource(response.error)) {
      return response;
    }

    const legacyResponse = await supabase
      .from('batch_jobs')
      .select('status, estimated_cost, total_tokens, created_at, description')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    return {
      data: (legacyResponse.data ?? []).map((row) => ({
        ...row,
        provider: 'openai',
      })),
      error: legacyResponse.error,
    };
  };

  const parallelRunQuery = async () => {
    const response = await supabase
      .from('llm_parallel_runs')
      .select('id, subject_key, status, primary_provider, shadow_provider, comparison, created_at')
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
    await Promise.all([batchQuery(), parallelRunQuery()]);

  if (batchError) {
    throw new Error(batchError.message);
  }

  if (parallelError) {
    throw new Error(parallelError.message);
  }

  const providers: Record<ProviderKey, ProviderSummary> = {
    openai: createProviderSummary(),
    openai_compatible: createProviderSummary(),
    gemini: createProviderSummary(),
  };

  for (const job of batchJobs ?? []) {
    const summary = providers[normalizeProvider(job.provider)];
    summary.jobs += 1;
    summary.total_cost += toNumber(job.estimated_cost);
    summary.total_tokens += toNumber(job.total_tokens);

    if (job.status === 'completed') {
      summary.completed_jobs += 1;
    }

    if (job.status === 'failed' || job.status === 'expired' || job.status === 'cancelled') {
      summary.failed_jobs += 1;
    }
  }

  for (const provider of Object.keys(providers) as ProviderKey[]) {
    const summary = providers[provider];
    summary.avg_cost_per_job = summary.jobs > 0 ? summary.total_cost / summary.jobs : 0;
  }

  const completedComparisons = (parallelRuns ?? [])
    .map((run) => normalizeRecord(run.comparison))
    .filter((comparison) => typeof comparison.accuracy === 'number');

  const averageAccuracy = completedComparisons.length > 0
    ? completedComparisons.reduce((sum, comparison) => sum + toNumber(comparison.accuracy), 0) / completedComparisons.length
    : null;

  console.log(JSON.stringify({
    date_range: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      days: options.days,
    },
    flags,
    audit_log: auditLog,
    providers,
    parallel_runs: {
      total: (parallelRuns ?? []).length,
      completed: (parallelRuns ?? []).filter((run) => run.status === 'completed').length,
      failed: (parallelRuns ?? []).filter((run) => run.status === 'failed').length,
      average_accuracy: averageAccuracy,
      recent: parallelRuns ?? [],
    },
    recent_jobs: batchJobs ?? [],
  }, null, 2));
}

main().catch((error) => {
  console.error('[Gemini Migration Monitoring] Failed:', error);
  process.exit(1);
});
