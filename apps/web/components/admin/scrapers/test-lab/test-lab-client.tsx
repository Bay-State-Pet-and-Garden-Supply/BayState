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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock3, 
  Loader2, 
  Play, 
  History,
  Activity
} from 'lucide-react';
import { SkuSidebar } from '@/components/admin/scrapers/test-lab/sku-sidebar';
import { ResultsTable } from '@/components/admin/scrapers/test-lab/results-table';
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
  onRunSelect: (runId: string) => void;
  testRuns: TestRunRecord[];
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
  onRunSelect,
  testRuns,
  activeRunDetails,
  totalSkus,
}: TestRunControlsProps) {
  const statusLabel = activeRunDetails?.status ?? (isPolling ? 'running' : 'idle');

  return (
    <div className="flex items-center justify-between gap-4 p-2 bg-muted/30 border rounded-lg" data-testid="test-run-controls">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-background border shadow-sm">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedRunId ?? undefined} onValueChange={onRunSelect}>
            <SelectTrigger className="h-7 w-[220px] text-xs border-none shadow-none focus:ring-0">
              <SelectValue placeholder="Select a previous run" />
            </SelectTrigger>
            <SelectContent>
              {testRuns.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground italic">No previous runs</div>
              ) : (
                testRuns.map((run) => (
                  <SelectItem key={run.id} value={run.id} className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono">{run.id.slice(0, 8)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <Separator orientation="vertical" className="h-8" />

        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <div className="flex items-center gap-1.5">
              <Activity className={`h-3 w-3 ${isPolling ? 'text-blue-500 animate-pulse' : 'text-muted-foreground'}`} />
              <span className="text-xs font-medium capitalize">{statusLabel}</span>
            </div>
          </div>
          <div className="flex flex-col border-l pl-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Queue</span>
            <span className="text-xs font-medium">{totalSkus} SKUs</span>
          </div>
        </div>
      </div>

      <Button
        size="sm"
        className="h-8 gap-2 px-4"
        onClick={() => {
          void onRunAllTests();
        }}
        disabled={disabled || isRunning || isPolling || totalSkus === 0}
      >
        {isPolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Run All Tests
      </Button>
    </div>
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
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(true);

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
      // Auto-expand on new logs if collapsed
      setIsTerminalCollapsed(false);
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
      <div data-testid="test-lab-client" className="h-[calc(100vh-200px)] min-h-[700px]">
        <ResizablePanelGroup orientation="horizontal" className="h-full border rounded-lg overflow-hidden">
          {/* Left Sidebar: SKU Management */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30} collapsible>
            <SkuSidebar configId={configId} testSkus={testSkus} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Content: Results and Terminal */}
          <ResizablePanel defaultSize={80}>
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize={70} minSize={30}>
                <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden">
                  <TestRunControls
                    onRunAllTests={handleRunAllTests}
                    disabled={disabled}
                    isRunning={isRunning}
                    isPolling={isPolling}
                    selectedRunId={selectedRunId}
                    onRunSelect={(id) => setSelectedRunId(id)}
                    testRuns={testRuns}
                    activeRunDetails={activeRunDetails}
                    totalSkus={testSkusForRun.length}
                  />
                  
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <ResultsTable
                      results={activeRunDetails?.sku_results ?? []}
                      isLoading={Boolean(selectedRunId) && activeRunDetails === null}
                    />
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={30} minSize={10} collapsible onCollapse={() => setIsTerminalCollapsed(true)} onExpand={() => setIsTerminalCollapsed(false)}>
                <LogTerminal 
                  logs={logs} 
                  isConnected={Boolean(jobId)} 
                  onClearLogs={() => setLogs([])}
                  isCollapsed={isTerminalCollapsed}
                  onCollapse={() => setIsTerminalCollapsed(true)}
                  onExpand={() => setIsTerminalCollapsed(false)}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TestLabErrorBoundary>
  );
}
