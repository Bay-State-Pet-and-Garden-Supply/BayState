'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Beaker,
  RefreshCw,
  Eye,
  Wifi,
  WifiOff,
  RefreshCcw,
  History,
  BarChart3,
  Zap,
} from 'lucide-react';

import { TestRunManagerProvider, useTestRunManager } from '@/lib/contexts';
import { useSupabaseRealtime, ConnectionStatus } from '@/lib/hooks/useSupabaseRealtime';

// Import test-lab components
import { SkuManager } from './test-lab/SkuManager';
import { TestProgressPanel } from './test-lab/TestProgressPanel';
import { LiveSelectorResults, SelectorEvent } from './test-lab/LiveSelectorResults';
import { LiveLoginStatus, LoginEvent } from './test-lab/LiveLoginStatus';
import { LiveExtractionProgress, ExtractionEvent } from './test-lab/LiveExtractionProgress';
import { HistoricalTestRuns } from './test-lab/HistoricalTestRuns';
import { TestAnalyticsDashboard } from './test-lab/TestAnalyticsDashboard';
import { TestLabErrorBoundary } from './test-lab/TestLabErrorBoundary';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Scraper {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string;
  config: {
    test_skus?: string[];
    fake_skus?: string[];
    edge_case_skus?: string[];
    base_url?: string;
  };
}

interface TestLabClientProps {
  scrapers: Scraper[];
  recentTests: TestRun[];
}

// Type for recent tests (kept for backward compatibility)
interface TestRun {
  id: string;
  scraper_id: string;
  scraper_name: string;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[];
  passed_count: number;
  failed_count: number;
}

// Connection status indicator component
function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    connected: {
      icon: Wifi,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      label: 'Live',
    },
    connecting: {
      icon: Loader2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      label: 'Connecting...',
    },
    polling: {
      icon: RefreshCcw,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      label: 'Polling',
    },
    error: {
      icon: WifiOff,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      label: 'Offline',
    },
  };

  const { icon: Icon, color, bgColor, label } = config[status];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor}`}>
      <Icon className={`h-4 w-4 ${color} ${status === 'connecting' ? 'animate-spin' : ''}`} />
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </div>
  );
}

// Polling fallback banner
function PollingBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <RefreshCcw className="h-5 w-5 text-amber-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-amber-900">Real-time updates unavailable</h4>
          <p className="text-sm text-amber-700 mt-1">
            WebSocket connection failed. Falling back to polling mode (5s intervals). 
            Updates may be delayed. The system will automatically retry the connection.
          </p>
        </div>
      </div>
    </div>
  );
}

// Inner component that uses the context
function TestLabClientInner({ scrapers, recentTests }: TestLabClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Context integration
  const {
    currentRun,
    testSkus: contextSkus,
    selectedScraper: contextSelectedScraper,
    isLoading: contextIsLoading,
    error: contextError,
    maxSkuError,
    startTest: contextStartTest,
    addSku: contextAddSku,
    removeSku: contextRemoveSku,
    updateTestStatus: contextUpdateTestStatus,
    selectScraper: contextSelectScraper,
    clearMaxSkuError,
  } = useTestRunManager();

  // WebSocket integration
  const {
    connectionStatus,
    isPolling,
    subscribeToTest,
    lastSelectorEvent,
    lastLoginEvent,
    lastExtractionEvent,
  } = useSupabaseRealtime();

  // Local state
  const [selectedScraper, setSelectedScraper] = useState<Scraper | null>(null);
  const [selectedTest, setSelectedTest] = useState<TestRun | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [activeTestRunId, setActiveTestRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('live');

  // Real-time events state for live components
  const [selectorEvents, setSelectorEvents] = useState<SelectorEvent[]>([]);
  const [loginEvent, setLoginEvent] = useState<LoginEvent | undefined>(undefined);
  const [extractionEvents, setExtractionEvents] = useState<ExtractionEvent[]>([]);

  // Refs for event accumulation
  const selectorEventsRef = useRef<SelectorEvent[]>([]);
  const extractionEventsRef = useRef<ExtractionEvent[]>([]);

  // Show context errors as toasts
  useEffect(() => {
    if (contextError) {
      toast.error(contextError);
    }
  }, [contextError]);

  // Show max SKU error as toast
  useEffect(() => {
    if (maxSkuError) {
      toast.error(maxSkuError);
      clearMaxSkuError();
    }
  }, [maxSkuError, clearMaxSkuError]);

  // Handle WebSocket selector events
  useEffect(() => {
    if (lastSelectorEvent) {
      const newEvent: SelectorEvent = {
        selector_name: lastSelectorEvent.selector_name,
        selector_value: lastSelectorEvent.selector_value,
        status: lastSelectorEvent.status as 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED',
        duration_ms: lastSelectorEvent.duration_ms,
        error_message: lastSelectorEvent.error_message,
        sample_text: lastSelectorEvent.sample_text,
        timestamp: lastSelectorEvent.timestamp || new Date().toISOString(),
      };
      selectorEventsRef.current = [...selectorEventsRef.current, newEvent];
      setSelectorEvents([...selectorEventsRef.current]);
    }
  }, [lastSelectorEvent]);

  // Handle WebSocket login events
  useEffect(() => {
    if (lastLoginEvent) {
      setLoginEvent({
        username_field_status: lastLoginEvent.username_field_status as 'FOUND' | 'MISSING' | 'ERROR' | 'PENDING',
        username_field_duration_ms: lastLoginEvent.username_field_duration_ms,
        password_field_status: lastLoginEvent.password_field_status as 'FOUND' | 'MISSING' | 'ERROR' | 'PENDING',
        password_field_duration_ms: lastLoginEvent.password_field_duration_ms,
        submit_button_status: lastLoginEvent.submit_button_status as 'FOUND' | 'MISSING' | 'ERROR' | 'PENDING',
        submit_button_duration_ms: lastLoginEvent.submit_button_duration_ms,
        success_indicator_status: lastLoginEvent.success_indicator_status as 'FOUND' | 'MISSING' | 'ERROR' | 'PENDING',
        success_indicator_duration_ms: lastLoginEvent.success_indicator_duration_ms,
        overall_status: lastLoginEvent.overall_status as 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ERROR',
        duration_ms: lastLoginEvent.duration_ms,
        error_message: lastLoginEvent.error_message,
        timestamp: lastLoginEvent.timestamp || new Date().toISOString(),
      });
    }
  }, [lastLoginEvent]);

  // Handle WebSocket extraction events
  useEffect(() => {
    if (lastExtractionEvent) {
      const newEvent: ExtractionEvent = {
        field_name: lastExtractionEvent.field_name,
        field_value: lastExtractionEvent.field_value,
        status: lastExtractionEvent.status as 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND',
        duration_ms: lastExtractionEvent.duration_ms,
        error_message: lastExtractionEvent.error_message,
        timestamp: lastExtractionEvent.timestamp || new Date().toISOString(),
      };
      extractionEventsRef.current = [...extractionEventsRef.current, newEvent];
      setExtractionEvents([...extractionEventsRef.current]);
    }
  }, [lastExtractionEvent]);

  // Clear events when new test starts
  useEffect(() => {
    if (currentRun?.id && currentRun.id !== activeTestRunId) {
      selectorEventsRef.current = [];
      extractionEventsRef.current = [];
      setSelectorEvents([]);
      setExtractionEvents([]);
      setLoginEvent(undefined);
      setActiveTestRunId(currentRun.id);
      subscribeToTest(currentRun.id);
    }
  }, [currentRun?.id, activeTestRunId, subscribeToTest]);

  const handleSelectScraper = (scraperId: string) => {
    const scraper = scrapers.find(s => s.id === scraperId);
    if (scraper) {
      setSelectedScraper(scraper);
      // Clear events when changing scraper
      selectorEventsRef.current = [];
      extractionEventsRef.current = [];
      setSelectorEvents([]);
      setExtractionEvents([]);
      setLoginEvent(undefined);
      // Update context
      contextSelectScraper(scraper.id, scraper.slug, scraper.display_name);
    }
  };

  const runAllTests = useCallback(async () => {
    if (!selectedScraper || contextSkus.length === 0) return;

    // Clear previous events
    selectorEventsRef.current = [];
    extractionEventsRef.current = [];
    setSelectorEvents([]);
    setExtractionEvents([]);
    setLoginEvent(undefined);

    // Use context to start test (handles API call and WebSocket subscription)
    try {
      await contextStartTest(
        selectedScraper.id,
        selectedScraper.slug,
        selectedScraper.display_name
      );

      toast.success(`Test job submitted with ${contextSkus.length} SKUs. Results will appear when runners complete.`);
    } catch (error) {
      toast.error(`Failed to submit test job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      router.refresh();
    }
  }, [selectedScraper, contextSkus, contextStartTest, router]);

  // Calculate test stats from context
  const testStats = {
    total: contextSkus.length,
    passed: contextSkus.filter(s => s.status === 'success').length,
    failed: contextSkus.filter(s => s.status === 'error').length,
    noResults: contextSkus.filter(s => s.status === 'no_results').length,
    pending: contextSkus.filter(s => !s.status || s.status === 'pending').length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Beaker className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Test Lab</h1>
            <p className="text-sm text-gray-600">Test and validate scraper configurations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatusIndicator status={connectionStatus} />
          <Button variant="outline" asChild>
            <Link href="/admin/scrapers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Scrapers
            </Link>
          </Button>
        </div>
      </div>

      {/* Polling Fallback Banner */}
      {isPolling && <PollingBanner />}

      {/* Scraper Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Scraper</CardTitle>
          <CardDescription>
            Choose a scraper configuration to test
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select onValueChange={handleSelectScraper} value={selectedScraper?.id}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a scraper..." />
            </SelectTrigger>
            <SelectContent>
              {scrapers.map((scraper) => (
                <SelectItem key={scraper.id} value={scraper.id}>
                  {scraper.display_name || scraper.slug} ({scraper.config.base_url || `https://${scraper.domain}`})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedScraper && (
        <>
          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="live" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Live Test
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Historical Runs
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>

            {/* Live Test Tab */}
            <TabsContent value="live" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* SKU Management */}
                <div className="lg:col-span-2">
                  <TestLabErrorBoundary componentName="SKU Manager" fallback={
                    <Card className="mt-6">
                      <CardContent className="py-8">
                        <div className="text-center">
                          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-lg font-medium text-gray-900">SKU Manager unavailable</p>
                          <p className="text-sm text-gray-500 mt-1">There was an error loading the SKU manager.</p>
                          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                            Refresh Page
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  }>
                    <SkuManager
                      scraperId={selectedScraper.id}
                      initialSkus={{
                        test_skus: selectedScraper.config.test_skus,
                        fake_skus: selectedScraper.config.fake_skus,
                        edge_case_skus: selectedScraper.config.edge_case_skus,
                      }}
                    />
                  </TestLabErrorBoundary>
                </div>

                {/* Progress & Stats Column */}
                <div className="space-y-6">
                  {/* Test Progress Panel */}
                  <TestLabErrorBoundary componentName="Test Progress" fallback={
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center">
                          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-lg font-medium text-gray-900">Test Progress unavailable</p>
                          <p className="text-sm text-gray-500 mt-1">There was an error loading test progress.</p>
                          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                            Refresh Page
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  }>
                    <TestProgressPanel />
                  </TestLabErrorBoundary>

                  {/* Quick Stats Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Test Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                          <p className="text-2xl font-bold">{testStats.total}</p>
                          <p className="text-xs text-gray-600">Total SKUs</p>
                        </div>
                        <div className="rounded-lg bg-green-50 p-3 text-center">
                          <p className="text-2xl font-bold text-green-700">{testStats.passed}</p>
                          <p className="text-xs text-green-600">Passed</p>
                        </div>
                        <div className="rounded-lg bg-red-50 p-3 text-center">
                          <p className="text-2xl font-bold text-red-700">{testStats.failed}</p>
                          <p className="text-xs text-red-600">Failed</p>
                        </div>
                        <div className="rounded-lg bg-yellow-50 p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-700">{testStats.pending}</p>
                          <p className="text-xs text-yellow-600">Pending</p>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        onClick={runAllTests}
                        disabled={contextIsLoading || contextSkus.length === 0 || currentRun?.status === 'running'}
                      >
                        {contextIsLoading || currentRun?.status === 'running' ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Test Running...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Run All Tests
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Real-time Results */}
              {(currentRun || selectorEvents.length > 0 || loginEvent || extractionEvents.length > 0) && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold">Real-time Results</h2>

                  {/* Nested tabs for different result types */}
                  <Tabs defaultValue="selectors" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="selectors">
                        Selectors ({selectorEvents.length})
                      </TabsTrigger>
                      <TabsTrigger value="login">
                        Login Flow
                      </TabsTrigger>
                      <TabsTrigger value="extraction">
                        Extraction ({extractionEvents.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="selectors">
                      <LiveSelectorResults
                        selectorEvents={selectorEvents}
                        maxItems={100}
                      />
                    </TabsContent>

                    <TabsContent value="login">
                      <LiveLoginStatus
                        loginEvent={loginEvent}
                      />
                    </TabsContent>

                    <TabsContent value="extraction">
                      <LiveExtractionProgress
                        extractionEvents={extractionEvents}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </TabsContent>

            {/* Historical Runs Tab */}
            <TabsContent value="history">
              <TestLabErrorBoundary componentName="Historical Test Runs" fallback={
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-lg font-medium text-gray-900">Historical Runs unavailable</p>
                      <p className="text-sm text-gray-500 mt-1">There was an error loading historical test runs.</p>
                      <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                        Refresh Page
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              }>
                <HistoricalTestRuns
                  onRunSelect={(runId) => {
                    // Could open a detail modal here
                    console.log('Selected run:', runId);
                  }}
                />
              </TestLabErrorBoundary>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <TestLabErrorBoundary componentName="Analytics Dashboard" fallback={
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-lg font-medium text-gray-900">Analytics unavailable</p>
                      <p className="text-sm text-gray-500 mt-1">There was an error loading the analytics dashboard.</p>
                      <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                        Refresh Page
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              }>
                <TestAnalyticsDashboard />
              </TestLabErrorBoundary>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Recent Tests - Shown when no scraper selected */}
      {!selectedScraper && recentTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Test Runs</CardTitle>
            <CardDescription>
              Select a scraper above to run new tests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Scraper</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SKUs</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTests.slice(0, 10).map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="text-sm">
                      {format(new Date(test.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {test.scraper_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{test.test_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          test.status === 'passed' ? 'default' :
                          test.status === 'failed' ? 'destructive' :
                          'secondary'
                        }
                      >
                        {test.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{test.skus_tested?.length || 0}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {test.duration_ms ? `${(test.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Test Result Dialog - Kept for backward compatibility */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Test Result Details</DialogTitle>
            <DialogDescription>
              Detailed results for test SKU
            </DialogDescription>
          </DialogHeader>
          {selectedTest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Scraper:</span>{' '}
                  <span className="font-medium">{selectedTest.scraper_name}</span>
                </div>
                <div>
                  <span className="text-gray-600">Type:</span>{' '}
                  <Badge variant="outline">{selectedTest.test_type}</Badge>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>{' '}
                  <Badge
                    variant={
                      selectedTest.status === 'passed' ? 'default' :
                      selectedTest.status === 'failed' ? 'destructive' :
                      'secondary'
                    }
                  >
                    {selectedTest.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-gray-600">Duration:</span>{' '}
                  {selectedTest.duration_ms ? `${(selectedTest.duration_ms / 1000).toFixed(2)}s` : '-'}
                </div>
              </div>
              <div className="rounded-lg bg-gray-900 p-4 max-h-96 overflow-auto">
                <pre className="text-green-400 text-sm">
                  {JSON.stringify(selectedTest, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Export wrapped with TestRunManagerProvider
export function TestLabClient(props: TestLabClientProps) {
  return (
    <TestRunManagerProvider>
      <TestLabClientInner {...props} />
    </TestRunManagerProvider>
  );
}
