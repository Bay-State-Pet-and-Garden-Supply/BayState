'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ScraperTestSku, TestRunRecord } from '@/lib/admin/scrapers/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { useJobBroadcasts } from '@/lib/realtime/useJobBroadcasts';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';

interface TestRunViewerProps {
  configId: string;
  versionId: string | null;
  testRuns: TestRunRecord[];
  testSkus: ScraperTestSku[];
  disabled?: boolean;
}

export function TestRunViewer({ configId, versionId, testRuns, testSkus, disabled }: TestRunViewerProps) {
  const router = useRouter();
  
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(testRuns[0]?.id || null);
  const [activeRunDetails, setActiveRunDetails] = useState<any | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [realtimeLogs, setRealtimeLogs] = useState<any[]>([]);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const selectedRun = testRuns.find(r => r.id === selectedRunId);
  const activeSkus = testSkus.filter(s => s.sku_type !== 'fake');

  // Real-time logs hook (useJobBroadcasts)
  const { logs, isConnected: isBroadcastConnected } = useJobBroadcasts({
    autoConnect: true,
    onLog: (log) => {
      if (jobId && log.job_id === jobId) {
        setRealtimeLogs((prev) => [...prev, log]);
      }
    }
  });

  // Real-time status hook (useJobSubscription)
  const { isConnected: isSubscriptionConnected } = useJobSubscription({
    autoConnect: true,
    onJobUpdated: (updatedJob) => {
      if (jobId && updatedJob.id === jobId) {
        // Update activeRunDetails with new job status
        setActiveRunDetails((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            job_status: updatedJob.status,
            status: updatedJob.status === 'completed' ? 'completed' : 
                    updatedJob.status === 'failed' ? 'failed' : prev.status
          };
        });
      }
    }
  });

  // Update connection status when either hook connects
  useEffect(() => {
    setIsRealtimeConnected(isBroadcastConnected || isSubscriptionConnected);
  }, [isBroadcastConnected, isSubscriptionConnected]);

  // Fetch run details when selected run changes or when polling
  useEffect(() => {
    if (!selectedRunId) return;

    const fetchRunDetails = async () => {
      try {
        const res = await fetch(`/api/admin/scrapers/studio/test/${selectedRunId}`);
        if (!res.ok) throw new Error('Failed to fetch test run details');
        const data = await res.json();
        setActiveRunDetails(data);
        
        // Stop polling if completed or failed (check both test run status AND job status)
        const isTestRunTerminal = data.status === 'completed' || data.status === 'failed' || data.status === 'error';
        const isJobTerminal = data.job_status === 'completed' || data.job_status === 'failed' || data.job_status === 'error';
        const isJobRunning = data.job_status === 'running';
        
        if (isTestRunTerminal || isJobTerminal) {
          setIsPolling(false);
          router.refresh();
        } else if (isJobRunning || data.job_status) {
          // Job is actively running, continue polling
        }
        
        // Capture job_id from response if not already set
        if (data.job_id && !jobId) {
          setJobId(data.job_id);
        }
      } catch (error) {
        console.error('Error fetching run details:', error);
        setIsPolling(false);
      }
    };

    fetchRunDetails();

    // Setup polling if needed
    let interval: NodeJS.Timeout;
    if (isPolling) {
      interval = setInterval(fetchRunDetails, 3000); // Poll every 3 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedRunId, isPolling, router, jobId]);

  // Handle starting a new test run
  const handleRunTest = async () => {
    if (!versionId) return;
    if (activeSkus.length === 0) {
      toast.error('No SKUs', { description: 'Add at least one test or edge case SKU to run tests.' });
      return;
    }

    setIsRunning(true);
    try {
      const res = await fetch('/api/admin/scrapers/studio/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: configId,
          version_id: versionId,
          skus: activeSkus.map(s => s.sku),
          options: { priority: 'high' }
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start test run');
      }

      const data = await res.json();
      
      toast.success('Test Started', { description: `Started test run with ${activeSkus.length} SKUs.` });
      
      // Update local state to show the new run immediately
      router.refresh();
      setSelectedRunId(data.test_run_id);
      setJobId(data.job_id || null);
      setIsPolling(true);
    } catch (error: any) {
      toast.error('Error', { description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(dateString));
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Card className="h-full flex flex-col" data-testid="test-run-viewer">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle>Test Runs</CardTitle>
          <CardDescription>
            Execute and view results for this scraper configuration.
          </CardDescription>
        </div>
        <Button 
          onClick={handleRunTest} 
          disabled={disabled || isRunning || isPolling || activeSkus.length === 0}
          data-testid="run-tests-button"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run Tests ({activeSkus.length} SKUs)
        </Button>
      </CardHeader>
      
      <CardContent className="flex-1 min-h-0 flex flex-col gap-4">
        {testRuns.length === 0 && !activeRunDetails ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-lg bg-muted/30">
            <div className="bg-primary/10 p-3 rounded-full mb-4">
              <Play className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No test runs yet</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Click "Run Tests" to verify your configuration against the selected SKUs. The runner will execute your workflow and display the results here.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-[400px]">
            {/* History Sidebar */}
            <div className="w-full lg:w-1/3 flex flex-col gap-2 overflow-y-auto pr-2">
              <h4 className="text-sm font-medium mb-1">Recent Runs</h4>
              {testRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => {
                    setSelectedRunId(run.id);
                    if (run.status === 'pending' || run.status === 'running') {
                      setIsPolling(true);
                    } else {
                      setIsPolling(false);
                    }
                  }}
                  className={`flex flex-col gap-2 p-3 text-left rounded-md border transition-colors ${
                    selectedRunId === run.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <StatusBadge status={run.status as any} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(run.started_at || run.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {(run as any).metadata?.version_id && (
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {(run as any).metadata.version_id.split('-')[0]}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Run Details Area */}
            <div className="flex-1 flex flex-col rounded-md border bg-card overflow-hidden">
              {activeRunDetails ? (
                <>
                  {/* Header */}
                  <div className="bg-muted/30 border-b p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(activeRunDetails.status)}
                        <div>
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                            Run Details
                            {activeRunDetails.status === 'running' || activeRunDetails.status === 'pending' ? (
                              <Badge variant="outline" className="text-xs font-normal animate-pulse">
                                {activeRunDetails.status === 'running' ? 'Running' : 'Queued'}
                              </Badge>
                            ) : null}
                            {/* Connection status indicator */}
                            {jobId && (activeRunDetails.status === 'running' || activeRunDetails.status === 'pending') && (
                              isRealtimeConnected ? (
                                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px] h-5 px-1.5 gap-1">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                  </span>
                                  Live
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px] h-5 px-1.5">
                                  Polling
                                </Badge>
                              )
                            )}
                          </h3>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {activeRunDetails.duration_ms ? formatDuration(activeRunDetails.duration_ms) : 'Running...'}
                            </span>
                            <span>•</span>
                            <span>{formatDate(activeRunDetails.started_at)}</span>
                            {activeRunDetails.job_status && (
                              <>
                                <span>•</span>
                                <span className="text-blue-600 dark:text-blue-400">Job: {activeRunDetails.job_status}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {activeRunDetails.status !== 'pending' && activeRunDetails.status !== 'running' && (
                        <div className="flex gap-2">
                          <div className="flex flex-col items-center bg-card border rounded-md px-3 py-1">
                            <span className="text-xs text-muted-foreground">Passed</span>
                            <span className="font-semibold text-green-600 dark:text-green-500">
                              {activeRunDetails.summary?.passed || 0}
                            </span>
                          </div>
                          <div className="flex flex-col items-center bg-card border rounded-md px-3 py-1">
                            <span className="text-xs text-muted-foreground">Failed</span>
                            <span className="font-semibold text-red-600 dark:text-red-500">
                              {activeRunDetails.summary?.failed || 0}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Results List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeRunDetails.status === 'pending' || activeRunDetails.status === 'running' ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p>Waiting for results from scraper network...</p>
                        {activeRunDetails.job_id && (
                          <p className="text-xs font-mono">Job: {activeRunDetails.job_id}</p>
                        )}
                        {activeRunDetails.job_status && (
                          <Badge variant="outline" className="text-xs">
                            Job Status: {activeRunDetails.job_status}
                          </Badge>
                        )}
                      </div>
                    ) : activeRunDetails.sku_results?.length > 0 ? (
                      activeRunDetails.sku_results.map((result: any, i: number) => (
                        <div key={i} className="border rounded-md p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(result.status)}
                              <span className="font-mono font-medium">{result.sku}</span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {result.duration_ms ? formatDuration(result.duration_ms) : ''}
                            </span>
                          </div>
                          
                          {result.error && (
                            <div className="mt-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 p-2 rounded border border-red-100 dark:border-red-900">
                              {result.error}
                            </div>
                          )}
                          
                          {result.data && Object.keys(result.data).length > 0 && (
                            <div className="mt-2">
                              <details className="text-sm">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                  View Extracted Data ({Object.keys(result.data).length} fields)
                                </summary>
                                <pre className="mt-2 p-3 bg-muted rounded-md overflow-x-auto text-xs font-mono border">
                                  {JSON.stringify(result.data, null, 2)}
                                </pre>
                              </details>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground py-12">
                        No individual SKU results available for this run.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
