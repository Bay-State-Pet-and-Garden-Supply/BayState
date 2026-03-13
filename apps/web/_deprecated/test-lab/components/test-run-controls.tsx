'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import type { ScraperTestSku, ScrapeJobTestRecord } from '@/lib/admin/scrapers/types';
import { Beaker, CheckCircle2, Clock, Loader2, Play, XCircle, AlertCircle } from 'lucide-react';

interface RunSummary {
  passed?: number;
  failed?: number;
}

export type TestRunHistoryItem = ScrapeJobTestRecord & {
  summary?: RunSummary | null;
  metadata?: Record<string, unknown> | null;
};

interface TestRunControlsProps {
  versionId: string | null;
  testSkus: ScraperTestSku[];
  testRuns: TestRunHistoryItem[];
  onRunTests: () => void;
  onSelectRun: (runId: string) => void;
  selectedRunId?: string | null;
  isRunning?: boolean;
  disabled?: boolean;
  className?: string;
}

const PASS_RESULT_STATUSES = new Set(['success', 'no_results']);
const FAIL_RESULT_STATUSES = new Set(['error', 'timeout']);

function getRunLabel(status: string): string {
  switch (status) {
    case 'success':
    case 'passed':
    case 'completed':
      return 'Passed';
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'pending':
      return 'Pending';
    case 'partial':
      return 'Partial';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
    case 'passed':
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />;
    case 'failed':
    case 'error':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case 'partial':
      return <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Unknown date';
  }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) {
    return '-';
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getRunCounts(run: TestRunHistoryItem): { passed: number; failed: number } {
  const summary = run.test_metadata?.summary || run.summary;
  const hasSummaryCounts =
    typeof summary?.passed === 'number' && Number.isFinite(summary.passed) &&
    typeof summary?.failed === 'number' && Number.isFinite(summary.failed);

  if (hasSummaryCounts) {
    return {
      passed: summary.passed as number,
      failed: summary.failed as number,
    };
  }

  let passed = 0;
  let failed = 0;

  const results = run.test_metadata?.sku_results || (run as any).results || [];
  for (const result of results) {
    if (PASS_RESULT_STATUSES.has(result.status)) {
      passed += 1;
      continue;
    }

    if (FAIL_RESULT_STATUSES.has(result.status)) {
      failed += 1;
    }
  }

  return { passed, failed };
}

export function TestRunControls({
  versionId,
  testSkus,
  testRuns,
  onRunTests,
  onSelectRun,
  selectedRunId,
  isRunning = false,
  disabled = false,
  className,
}: TestRunControlsProps) {
  const totalSkuCount = testSkus.filter((sku) =>
    sku.sku_type === 'test' || sku.sku_type === 'fake' || sku.sku_type === 'edge_case'
  ).length;

  const runButtonDisabled = disabled || !versionId || totalSkuCount === 0 || isRunning;
  const recentRuns = testRuns.slice(0, 10);

  return (
    <Card data-testid="test-run-controls" className={cn('h-full', className)}>
      <CardHeader>
        <CardTitle>Test Run Controls</CardTitle>
        <CardDescription>Run test batches and inspect the most recent execution history.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <section className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Run Controls</h3>
            <Badge variant="secondary">{totalSkuCount} SKUs</Badge>
          </div>

          <Button
            type="button"
            onClick={onRunTests}
            disabled={runButtonDisabled}
            className="w-full sm:w-auto"
            data-testid="run-tests-button"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Run Tests ({totalSkuCount} SKUs)
          </Button>
        </section>

        <section className="rounded-md border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Run History</h3>
            {recentRuns.length > 0 ? (
              <Badge variant="outline">{Math.min(recentRuns.length, 10)} recent</Badge>
            ) : null}
          </div>

          {recentRuns.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/20 py-8 px-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Beaker className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">No test runs yet</p>
            </div>
          ) : (
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1" aria-label="Run history list">
              {recentRuns.map((run) => {
                const status = run.status;
                const isActive = selectedRunId === run.id;
                const isPendingOrRunning = status === 'pending' || status === 'running';
                const counts = getRunCounts(run);

                return (
                  <button
                    key={run.id}
                    type="button"
                    data-testid={`run-history-item-${run.id}`}
                    onClick={() => onSelectRun(run.id)}
                    aria-pressed={isActive}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      'hover:bg-muted/50',
                      isActive ? 'border-primary bg-primary/5' : 'border-border',
                      isPendingOrRunning ? 'animate-pulse' : undefined
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(status)}
                        <StatusBadge status={status} className="py-0.5" />
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(run.started_at || run.created_at)}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {getRunLabel(status)} • {counts.passed} passed / {counts.failed} failed
                      </span>
                      <span>{formatDuration(run.test_metadata?.duration_ms ?? run.duration_ms ?? null)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
