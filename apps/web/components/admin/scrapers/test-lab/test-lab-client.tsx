'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { TestSkuPanel } from '@/components/admin/scrapers/test-lab/test-sku-panel';
import { ResultsPanel, type SkuResult } from '@/components/admin/scrapers/test-lab/results-panel';
import { LogTerminal } from '@/components/admin/scrapers/test-lab/log-terminal';
import { TestLabErrorBoundary } from '@/components/admin/scrapers/test-lab/TestLabErrorBoundary';
import { useJobBroadcasts } from '@/lib/realtime/useJobBroadcasts';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';
import type { ScraperTestSku, TestRunRecord } from '@/lib/admin/scrapers/types';
import type { ScrapeJobLog } from '@/lib/realtime/types';

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'error';

interface ActiveRunDetails {
  id: string;
  status: RunStatus;
  job_id?: string;
  job_status?: string;
  sku_results: SkuResult[];
  summary?: {
    passed: number;
    failed: number;
    total: number;
  };
}

interface TestLabClientProps {
  configId: string;
  versionId: string | null;
  testRuns: TestRunRecord[];
  testSkus: ScraperTestSku[];
  scraperName: string;
  disabled?: boolean;
}

interface TestRunControlsProps {
  onRunAllTests: () => Promise<void>;
  disabled?: boolean;
  isRunning: boolean;
  isPolling: boolean;
  selectedRunId: string | null;
  activeRunDetails: ActiveRunDetails | null;
  totalSkus: number;
}

function isTerminalStatus(status?: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'error';
}

function TestRunControls({
  onRunAllTests,
  disabled,
  isRunning,
  isPolling,
  selectedRunId,
  activeRunDetails,
  totalSkus,
}: TestRunControlsProps) {
  const statusLabel = activeRunDetails?.status ?? (isPolling ? 'running' : 'idle');

  return (
    <Card data-testid="test-run-controls">
      <CardHeader>
        <CardTitle>Run Controls</CardTitle>
        <CardDescription>Launch test runs and monitor current execution status.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full"
          onClick={() => {
            void onRunAllTests();
          }}
          disabled={disabled || isRunning || isPolling || totalSkus === 0}
        >
          Run All Tests
        </Button>

        <div className="rounded-md border p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Current run:</span>{' '}
            <span className="font-mono">{selectedRunId ?? 'None'}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Status:</span>{' '}
            <span className="capitalize">{statusLabel}</span>
          </p>
          <p>
            <span className="text-muted-foreground">SKUs queued:</span> {totalSkus}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function TestLabClient({
  configId,
  versionId,
  testRuns,
  testSkus,
  scraperName,
  disabled = false,
}: TestLabClientProps) {
  const router = useRouter();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(testRuns[0]?.id ?? null);
  const [activeRunDetails, setActiveRunDetails] = useState<ActiveRunDetails | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ScrapeJobLog[]>([]);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const jobIdRef = useRef<string | null>(jobId);
  const runIdRef = useRef<string | null>(selectedRunId);

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    runIdRef.current = selectedRunId;
  }, [selectedRunId]);

  const testSkusForRun = useMemo(() => testSkus.map((item) => item.sku), [testSkus]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const fetchRunDetails = useCallback(
    async (runId: string): Promise<ActiveRunDetails | null> => {
      try {
        const response = await fetch(`/api/admin/scrapers/studio/test/${runId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch run ${runId}`);
        }

        const details = (await response.json()) as ActiveRunDetails;
        setActiveRunDetails(details);

        if (isTerminalStatus(details.status)) {
          stopPolling();
          setIsRunning(false);
          router.refresh();
        }

        return details;
      } catch {
        stopPolling();
        return null;
      }
    },
    [router, stopPolling]
  );

  const startPolling = useCallback(
    (runId: string) => {
      stopPolling();
      setIsPolling(true);
      pollingRef.current = setInterval(() => {
        void fetchRunDetails(runId);
      }, 3000);
    },
    [fetchRunDetails, stopPolling]
  );

  const handleRunAllTests = useCallback(async () => {
    if (!versionId || disabled || testSkusForRun.length === 0) {
      return;
    }

    setIsRunning(true);
    setLogs([]);

    try {
      const response = await fetch('/api/admin/scrapers/studio/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: configId,
          version_id: versionId,
          skus: testSkusForRun,
          options: { priority: 'high' },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start test run');
      }

      const data = (await response.json()) as { test_run_id: string; job_id?: string };
      const nextRunId = data.test_run_id;
      const nextJobId = data.job_id ?? null;

      setSelectedRunId(nextRunId);
      setJobId(nextJobId);
      runIdRef.current = nextRunId;
      jobIdRef.current = nextJobId;

      await fetchRunDetails(nextRunId);
      startPolling(nextRunId);
    } finally {
      setIsRunning(false);
    }
  }, [configId, disabled, fetchRunDetails, startPolling, testSkusForRun, versionId]);

  useJobBroadcasts({
    autoConnect: true,
    onLog: (incomingLog) => {
      const activeJobId = jobIdRef.current;
      if (!activeJobId || incomingLog.job_id !== activeJobId) {
        return;
      }
      setLogs((previousLogs) => [...previousLogs, incomingLog].slice(-500));
    },
  });

  useJobSubscription({
    autoConnect: true,
    onJobUpdated: (job) => {
      if (job.id !== jobIdRef.current) {
        return;
      }

      if (isTerminalStatus(job.status)) {
        const activeRunId = runIdRef.current;
        if (activeRunId) {
          void fetchRunDetails(activeRunId);
        }
        stopPolling();
      }
    },
  });

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      const details = await fetchRunDetails(selectedRunId);
      if (!details || cancelled) {
        return;
      }

      if (!isTerminalStatus(details.status)) {
        setJobId(details.job_id ?? jobIdRef.current);
        startPolling(selectedRunId);
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [fetchRunDetails, selectedRunId, startPolling]);

  useEffect(
    () => () => {
      stopPolling();
    },
    [stopPolling]
  );

  return (
    <TestLabErrorBoundary componentName={`Test Lab: ${scraperName}`}>
      <div data-testid="test-lab-client" className="h-full">
        <ResizablePanelGroup orientation="vertical" className="h-full min-h-[700px] flex flex-col">
          <ResizablePanel defaultSize={70} minSize={40}>
            <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-3">
              <TestSkuPanel configId={configId} testSkus={testSkus} />
              <ResultsPanel
                results={activeRunDetails?.sku_results ?? []}
                isLoading={Boolean(selectedRunId) && activeRunDetails === null}
                isStreaming={isPolling}
              />
              <TestRunControls
                onRunAllTests={handleRunAllTests}
                disabled={disabled}
                isRunning={isRunning}
                isPolling={isPolling}
                selectedRunId={selectedRunId}
                activeRunDetails={activeRunDetails}
                totalSkus={testSkusForRun.length}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={30} minSize={15} collapsible>
            <LogTerminal logs={logs} isConnected={Boolean(jobId)} onClearLogs={() => setLogs([])} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TestLabErrorBoundary>
  );
}
