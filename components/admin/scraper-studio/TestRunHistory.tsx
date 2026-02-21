'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Clock, CheckCircle2, XCircle, Loader2, ChevronRight, Terminal,
  RotateCcw, Eye, Calendar, Hash, BarChart3, Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StepTrace } from './StepTrace';
import { TestRunStep, useTestRunSubscription } from '@/lib/realtime/useTestRunSubscription';
import { SelectorValidation } from './SelectorValidation';
import { EventLogViewer } from '@/components/admin/scraping/EventLogViewer';

interface ImageCollections {
  current: string[];
  baseline: string[];
}

interface TestRun {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  scraper_id: string;
  config_id?: string;
  test_type: string;
  skus_tested: string[];
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  results: Array<{
    sku: string;
    status: string;
    error?: string;
    error_message?: string;
    data?: Record<string, unknown>;
  }>;
  metadata?: {
    config_id?: string;
    version_id?: string;
    job_id?: string;
  };
}

interface TimelineData {
  test_run_id: string;
  steps: TestRunStep[];
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  running_steps: number;
  pending_steps: number;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString();
  } catch (e) {
    return date;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'running':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'pending':
    default:
      return <Clock className="h-5 w-5 text-gray-400" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-500/10 text-green-600 border-green-200">Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'running':
      return <Badge variant="outline" className="border-blue-500 text-blue-500">Running</Badge>;
    case 'pending':
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function extractImageCollections(resultData: Record<string, unknown> | undefined): ImageCollections {
  if (!resultData) {
    return { current: [], baseline: [] };
  }

  const current = new Set<string>();
  const baseline = new Set<string>();

  const collectCurrent = (obj: Record<string, unknown>) => {
    for (const key of ['images', 'image_urls', 'imageUrls', 'Images', 'Image URLs']) {
      toStringArray(obj[key]).forEach((url) => current.add(url));
    }
  };

  const collectBaseline = (obj: Record<string, unknown>) => {
    for (const key of ['baseline_images', 'expected_images', 'reference_images', 'baselineImageUrls', 'expectedImageUrls']) {
      toStringArray(obj[key]).forEach((url) => baseline.add(url));
    }
  };

  collectCurrent(resultData);
  collectBaseline(resultData);

  for (const value of Object.values(resultData)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const nested = value as Record<string, unknown>;
    collectCurrent(nested);
    collectBaseline(nested);
  }

  return {
    current: Array.from(current),
    baseline: Array.from(baseline),
  };
}

export function TestRunHistory() {
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [retryingStep, setRetryingStep] = useState<string | null>(null);

  // Memoize initialSteps to prevent infinite re-renders in useTestRunSubscription
  const initialSteps = useMemo(() => timelineData?.steps || [], [timelineData?.steps]);

  const realtime = useTestRunSubscription({
    testRunId: selectedRun?.id || '',
    initialSteps,
    autoConnect: !!selectedRun,
  });

  useEffect(() => {
    loadTestRuns();
  }, []);

  useEffect(() => {
    if (selectedRun) {
      loadTimeline(selectedRun.id);
    }
  }, [selectedRun]);

  async function loadTestRuns() {
    try {
      const response = await fetch('/api/admin/scraper-network/test/runs?limit=50');
      if (!response.ok) throw new Error('Failed to load test runs');
      const data = await response.json();
      setTestRuns(data.runs || []);
    } catch (error) {
      console.error('Failed to load test runs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(testRunId: string) {
    setLoadingTimeline(true);
    try {
      const response = await fetch(`/api/admin/scrapers/studio/test/${testRunId}/timeline`);
      if (!response.ok) throw new Error('Failed to load timeline');
      const data = await response.json();
      setTimelineData(data);
    } catch (error) {
      console.error('Failed to load timeline:', error);
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function handleRetryStep(stepId: string) {
    setRetryingStep(stepId);
    try {
      const response = await fetch(`/api/admin/scrapers/studio/test/${selectedRun?.id}/steps/${stepId}/retry`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to retry step');
      }

      await loadTimeline(selectedRun!.id);
    } catch (error) {
      console.error('Failed to retry step:', error);
    } finally {
      setRetryingStep(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[100px]" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (testRuns.length === 0) {
    return (
      <div className="text-center py-12">
        <Terminal className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-2">No test runs found</p>
        <p className="text-sm text-gray-400">Test runs will appear here after you run tests</p>
      </div>
    );
  }

  if (selectedRun) {
    const liveSteps = realtime.steps.length > 0 ? realtime.steps : (timelineData?.steps || []);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setSelectedRun(null)}>
            ← Back to History
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Test Run Details</h2>
            <p className="text-sm text-muted-foreground">ID: {selectedRun.id}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadTimeline(selectedRun.id)}
            disabled={loadingTimeline}
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${loadingTimeline ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Badge variant="outline" className={realtime.isConnected ? 'text-green-600' : 'text-muted-foreground'}>
            {realtime.isConnected ? 'Live Connected' : 'Live Offline'}
          </Badge>
        </div>

        <Tabs defaultValue="trace" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trace">Step Trace</TabsTrigger>
            <TabsTrigger value="selectors">Selectors</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="results">SKU Results</TabsTrigger>
          </TabsList>

          <TabsContent value="trace">
            {loadingTimeline ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : timelineData ? (
              <StepTrace
                steps={liveSteps}
                testRunId={selectedRun.id}
                configId={selectedRun.metadata?.config_id || selectedRun.config_id}
                onRetryStep={handleRetryStep}
                isRetrying={!!retryingStep}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Failed to load step trace</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="selectors">
            <SelectorValidation
              testRunId={selectedRun.id}
              configId={selectedRun.metadata?.config_id || selectedRun.config_id}
              configSelectors={[]}
            />
          </TabsContent>

          <TabsContent value="logs">
            {selectedRun.metadata?.job_id ? (
              <EventLogViewer jobId={selectedRun.metadata.job_id} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No job id found for this test run.
              </div>
            )}
          </TabsContent>

          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Run Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Started</p>
                      <p className="font-medium">{formatDate(selectedRun.started_at)}</p>
                    </div>
                  </div>
                  {selectedRun.completed_at && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Completed</p>
                        <p className="font-medium">{formatDate(selectedRun.completed_at)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500">Duration</p>
                      <p className="font-medium">{formatDuration(selectedRun.duration_ms)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    {getStatusBadge(selectedRun.status)}
                  </div>
                  {timelineData && (
                    <>
                      <div className="flex items-center justify-between">
                        <span>Total Steps</span>
                        <span className="font-medium">{timelineData.total_steps}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Completed</span>
                        <span className="font-medium text-green-600">{timelineData.completed_steps}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Failed</span>
                        <span className="font-medium text-red-600">{timelineData.failed_steps}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SKU Test Results</CardTitle>
                <CardDescription>
                  Results for {selectedRun.skus_tested?.length || 0} tested SKUs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedRun.results?.map((result, idx) => (
                    (() => {
                      const imageCollections = extractImageCollections(result.data);
                      const currentImages = imageCollections.current;
                      const baselineImages = imageCollections.baseline;
                      const compareSlots = Math.min(Math.max(currentImages.length, baselineImages.length), 4);

                      return (
                    <div 
                      key={idx}
                      className="p-3 rounded-lg border space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Hash className="h-4 w-4 text-gray-500" />
                          <span className="font-mono text-sm">{result.sku}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.status === 'success' || result.status === 'completed' ? (
                            <Badge variant="outline" className="border-green-500 text-green-600">
                              Passed
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Failed</Badge>
                          )}
                          {(result.error || result.error_message) && (
                            <span className="text-sm text-red-600">{result.error || result.error_message}</span>
                          )}
                        </div>
                      </div>

                      {compareSlots > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Image Comparison</p>
                          <div className="grid gap-2 md:grid-cols-2">
                            {Array.from({ length: compareSlots }).map((_, imageIndex) => {
                              const currentImage = currentImages[imageIndex];
                              const baselineImage = baselineImages[imageIndex];
                              return (
                                <div key={`${result.sku}-img-${imageIndex}`} className="rounded border p-2 space-y-2">
                                  <p className="text-[11px] text-muted-foreground">Pair {imageIndex + 1}</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <p className="text-[10px] text-muted-foreground mb-1">Current</p>
                                      {currentImage ? (
                                        <a href={currentImage} target="_blank" rel="noreferrer" className="block">
                                          <img
                                            src={currentImage}
                                            alt={`Current image ${imageIndex + 1} for ${result.sku}`}
                                            className="h-20 w-full rounded object-cover border"
                                            loading="lazy"
                                          />
                                        </a>
                                      ) : (
                                        <div className="h-20 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">
                                          Missing
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground mb-1">Baseline</p>
                                      {baselineImage ? (
                                        <a href={baselineImage} target="_blank" rel="noreferrer" className="block">
                                          <img
                                            src={baselineImage}
                                            alt={`Baseline image ${imageIndex + 1} for ${result.sku}`}
                                            className="h-20 w-full rounded object-cover border"
                                            loading="lazy"
                                          />
                                        </a>
                                      ) : (
                                        <div className="h-20 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">
                                          No baseline
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {result.data && (
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      )}
                    </div>
                      );
                    })()
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Test Run History</h3>
        <Button variant="outline" size="sm" onClick={loadTestRuns}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {testRuns.map((run) => (
          <Card 
            key={run.id} 
            className="cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => setSelectedRun(run)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getStatusIcon(run.status)}
                  <div>
                    <p className="font-medium">
                      Test Run {run.id.slice(0, 8)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDate(run.started_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">SKUs</p>
                    <p className="font-medium">{run.skus_tested?.length || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="font-medium">{formatDuration(run.duration_ms)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Passed</p>
                    <p className="font-medium text-green-600">
                      {run.results?.filter(r => r.status === 'success' || r.status === 'completed').length || 0}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
