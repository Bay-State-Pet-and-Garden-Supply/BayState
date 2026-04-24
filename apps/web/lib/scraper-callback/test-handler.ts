import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  checkIdempotency,
  recordCallbackProcessedWithRetry,
} from './idempotency';

const AssertionResultSchema = z.object({
  field: z.string(),
  expected: z.string().nullable(),
  actual: z.string().nullable(),
  passed: z.boolean(),
});

const SkuAssertionResultSchema = z.object({
  sku: z.string(),
  assertions: z.array(AssertionResultSchema),
  passed: z.boolean(),
  summary: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
  }),
});

const TestResultsSummarySchema = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  failed: z.number().int(),
});

export const TestResultCallbackSchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  config_id: z.string().min(1, 'config_id is required'),
  status: z.enum(['completed', 'failed']),
  runner_name: z.string().min(1).optional(),
  assertion_results: z.array(SkuAssertionResultSchema),
  summary: TestResultsSummarySchema,
  duration_ms: z.number().int().min(0).optional(),
  error_message: z.string().optional(),
});

export type TestResultCallbackPayload = z.infer<typeof TestResultCallbackSchema>;
export type SkuAssertionResult = z.infer<typeof SkuAssertionResultSchema>;
export type AssertionResult = z.infer<typeof AssertionResultSchema>;
export type TestResultsSummary = z.infer<typeof TestResultsSummarySchema>;

export interface TestCallbackResult {
  success: boolean;
  idempotent?: boolean;
  message?: string;
  error?: string;
  testRunId?: string;
}

export function calculateHealthScore(summary: TestResultsSummary): number {
  if (summary.total === 0) {
    return 0;
  }
  return Math.round((summary.passed / summary.total) * 100);
}

export function determineHealthStatus(score: number): 'healthy' | 'degraded' | 'broken' {
  if (score > 80) {
    return 'healthy';
  } else if (score >= 50) {
    return 'degraded';
  }
  return 'broken';
}

export async function writeTestResults(
  supabase: SupabaseClient,
  payload: TestResultCallbackPayload,
  healthScore: number
): Promise<{ success: boolean; testRunId?: string; error?: string }> {
  const now = new Date().toISOString();
  const passed = payload.status === 'completed' && payload.summary.failed === 0;

  const { data, error } = await supabase
    .from('scraper_test_runs')
    .insert({
      scraper_id: payload.config_id,
      job_id: payload.job_id,
      test_type: 'assertion',
      status: passed ? 'success' : payload.status === 'failed' ? 'failed' : 'partial',
      skus_tested: payload.assertion_results.length,
      results: payload.summary,
      assertion_results: payload.assertion_results,
      result_data: {
        summary: payload.summary,
        assertions: payload.assertion_results,
        health_score: healthScore,
      },
      duration_ms: payload.duration_ms || 0,
      runner_name: payload.runner_name || 'unknown',
      error_message: payload.error_message || null,
      started_at: now,
      completed_at: now,
      created_at: now,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[TestCallback] Failed to write test results:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, testRunId: data.id };
}

export async function updateScraperHealth(
  supabase: SupabaseClient,
  configId: string,
  healthScore: number,
  healthStatus: 'healthy' | 'degraded' | 'broken',
  testStatus: 'completed' | 'failed'
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('scraper_configs')
    .update({
      health_score: healthScore,
      health_status: healthStatus,
      last_test_at: now,
      last_test_result: testStatus === 'completed' && healthScore > 80 ? 'passed' : 'failed',
      updated_at: now,
    })
    .eq('id', configId);

  if (error) {
    console.error('[TestCallback] Failed to update scraper health:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateHealthViaDbFunction(
  supabase: SupabaseClient,
  configId: string,
  status: string,
  resultData: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('update_scraper_health_from_test', {
      p_scraper_id: configId,
      p_status: status,
      p_result_data: resultData,
    });

    if (error) {
      console.warn('[TestCallback] DB function failed, falling back to manual update:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[TestCallback] DB function error:', message);
    return { success: false, error: message };
  }
}

export async function processTestResultCallback(
  supabase: SupabaseClient,
  payload: TestResultCallbackPayload
): Promise<TestCallbackResult> {
  const idempotencyCheck = await checkIdempotency(
    supabase,
    payload.job_id,
    'admin',
    payload.assertion_results
  );

  if (idempotencyCheck.isDuplicate) {
    console.log(`[TestCallback] Duplicate callback detected for job ${payload.job_id}`);
    return {
      success: true,
      idempotent: true,
      message: 'Callback already processed',
    };
  }

  const idempotencyKey = idempotencyCheck.key;

  const healthScore = calculateHealthScore(payload.summary);
  const healthStatus = determineHealthStatus(healthScore);

  const writeResult = await writeTestResults(supabase, payload, healthScore);
  if (!writeResult.success) {
    return {
      success: false,
      error: writeResult.error || 'Failed to write test results',
    };
  }

  const resultData = {
    summary: payload.summary,
    assertions: payload.assertion_results,
  };

  const dbFunctionResult = await updateHealthViaDbFunction(
    supabase,
    payload.config_id,
    payload.status,
    resultData
  );

  if (!dbFunctionResult.success) {
    const manualUpdateResult = await updateScraperHealth(
      supabase,
      payload.config_id,
      healthScore,
      healthStatus,
      payload.status
    );

    if (!manualUpdateResult.success) {
      return {
        success: false,
        error: manualUpdateResult.error || 'Failed to update scraper health',
      };
    }
  }

  const recordResult = await recordCallbackProcessedWithRetry(
    supabase,
    payload.job_id,
    payload.runner_name || 'unknown',
    idempotencyKey,
    {
      config_id: payload.config_id,
      status: payload.status,
      summary: payload.summary,
      health_score: healthScore,
      health_status: healthStatus,
    }
  );

  if (!recordResult.success) {
    console.error(`[TestCallback] Failed to record idempotency marker: ${recordResult.error}`);
  }

  console.log(
    `[TestCallback] Processed test results for job ${payload.job_id}: ` +
    `score=${healthScore}%, status=${healthStatus}, assertions=${payload.summary.total}`
  );

  return {
    success: true,
    testRunId: writeResult.testRunId,
    message: `Test results processed: ${payload.summary.passed}/${payload.summary.total} passed`,
  };
}

export function validateTestCallbackPayload(
  bodyText: string
): { success: true; payload: TestResultCallbackPayload } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(bodyText);
    const result = TestResultCallbackSchema.safeParse(parsed);

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return { success: false, error: `Invalid payload: ${issues}` };
    }

    return { success: true, payload: result.data };
  } catch {
    return { success: false, error: 'Invalid JSON payload' };
  }
}