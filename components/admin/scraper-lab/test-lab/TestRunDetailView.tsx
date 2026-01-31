/**
 * TestRunDetailView Component
 *
 * Modal/dialog showing detailed single test run results.
 * Features: Overview, Selectors, Login, Extraction, Errors tabs.
 * Export JSON download and compare functionality (Task 13 placeholder).
 */

'use client';

import { useState, useCallback } from 'react';
import {
  Download,
  GitCompare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
  Activity,
  Target,
  User,
  FileText,
  AlertTriangle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Reusable components
import { LiveSelectorResults, SelectorEvent } from './LiveSelectorResults';
import { LiveLoginStatus, LoginEvent } from './LiveLoginStatus';
import { LiveExtractionProgress, ExtractionEvent } from './LiveExtractionProgress';

// ============================================================================
// Types
// ============================================================================

/** Complete test run data structure */
export interface TestRunDetail {
  id: string;
  scraper_id: string;
  scraper_name: string | null;
  test_type: string;
  status: 'passed' | 'failed' | 'partial' | 'running' | 'pending' | 'cancelled';
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[] | null;
  passed_count: number | null;
  failed_count: number | null;
  error_message?: string | null;

  // Detailed data (for detail view)
  selector_events?: SelectorEvent[];
  login_event?: LoginEvent;
  extraction_events?: ExtractionEvent[];
  errors?: TestRunError[];
}

export interface TestRunError {
  id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack_trace?: string;
  source: 'selector' | 'login' | 'extraction' | 'navigation' | 'unknown';
  sku?: string;
}

/** Props for TestRunDetailView */
export interface TestRunDetailViewProps {
  /** The test run to display */
  testRun: TestRunDetail | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Callback when compare mode is activated */
  onCompare?: (runId: string) => void;
  /** CSS class for styling */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Format duration from milliseconds */
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/** Format date for display */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Calculate health score from test results */
function calculateHealthScore(testRun: TestRunDetail): number {
  const total = (testRun.passed_count || 0) + (testRun.failed_count || 0);
  if (total === 0) return 0;
  return Math.round(((testRun.passed_count || 0) / total) * 100);
}

/** Get status badge configuration */
function getStatusBadge(status: TestRunDetail['status']) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2; label: string; className: string }> = {
    passed: {
      variant: 'default',
      icon: CheckCircle2,
      label: 'Passed',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    failed: {
      variant: 'destructive',
      icon: XCircle,
      label: 'Failed',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
    partial: {
      variant: 'secondary',
      icon: MinusCircle,
      label: 'Partial',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
    },
    running: {
      variant: 'outline',
      icon: Clock,
      label: 'Running',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    pending: {
      variant: 'outline',
      icon: Clock,
      label: 'Pending',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
    cancelled: {
      variant: 'secondary',
      icon: AlertCircle,
      label: 'Cancelled',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
  };
  return config[status] || config.pending;
}

/** Get health score badge color */
function getHealthScoreColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 90) {
    return { bg: 'bg-emerald-500', text: 'text-emerald-700', label: 'Excellent' };
  }
  if (score >= 70) {
    return { bg: 'bg-green-500', text: 'text-green-700', label: 'Good' };
  }
  if (score >= 50) {
    return { bg: 'bg-amber-500', text: 'text-amber-700', label: 'Fair' };
  }
  if (score >= 30) {
    return { bg: 'bg-orange-500', text: 'text-orange-700', label: 'Poor' };
  }
  return { bg: 'bg-red-500', text: 'text-red-700', label: 'Critical' };
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Overview Tab Content */
function OverviewTab({ testRun }: { testRun: TestRunDetail }) {
  const healthScore = calculateHealthScore(testRun);
  const healthColor = getHealthScoreColor(healthScore);
  const statusConfig = getStatusBadge(testRun.status);
  const StatusIcon = statusConfig.icon;
  const totalSkus = testRun.skus_tested?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Health Score</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold">{healthScore}%</span>
                </div>
              </div>
              <div className={cn('h-12 w-12 rounded-full flex items-center justify-center', healthColor.bg)}>
                <Activity className="h-6 w-6 text-white" />
              </div>
            </div>
            <Badge variant="outline" className={cn('mt-2', healthColor.text, healthColor.bg.replace('500', '100'))}>
              {healthColor.label}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="text-3xl font-bold mt-1">{formatDuration(testRun.duration_ms)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SKUs Tested</p>
                <p className="text-3xl font-bold mt-1">{totalSkus}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge
                  variant="outline"
                  className={cn('mt-2 font-medium flex items-center gap-1 w-fit', statusConfig.className)}
                >
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig.label}
                </Badge>
              </div>
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                <StatusIcon className="h-6 w-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Results Breakdown</CardTitle>
          <CardDescription>Test execution summary by result type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span className="font-medium">Passed</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${totalSkus > 0 ? ((testRun.passed_count || 0) / totalSkus) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-mono font-medium w-12 text-right">{testRun.passed_count || 0}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="font-medium">Failed</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${totalSkus > 0 ? ((testRun.failed_count || 0) / totalSkus) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-mono font-medium w-12 text-right">{testRun.failed_count || 0}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SKU List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SKUs Tested</CardTitle>
          <CardDescription>List of SKUs used in this test run</CardDescription>
        </CardHeader>
        <CardContent>
          {testRun.skus_tested && testRun.skus_tested.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {testRun.skus_tested.map((sku, index) => {
                const isFailed = index >= (testRun.passed_count || 0);
                return (
                  <Badge
                    key={sku}
                    variant="outline"
                    className={cn(
                      'font-mono',
                      isFailed
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    )}
                  >
                    {sku}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No SKUs recorded for this test run</p>
          )}
        </CardContent>
      </Card>

      {/* Test Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Test Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Test Run ID</dt>
              <dd className="font-mono">{testRun.id}</dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Scraper</dt>
              <dd>{testRun.scraper_name || testRun.scraper_id || 'Unknown'}</dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Test Type</dt>
              <dd className="capitalize">{testRun.test_type || 'manual'}</dd>
            </div>
            <Separator />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Started</dt>
              <dd>{formatDate(testRun.created_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/** Errors Tab Content */
function ErrorsTab({ errors }: { errors: TestRunError[] }) {
  const [selectedError, setSelectedError] = useState<TestRunError | null>(null);

  const getErrorIcon = (level: TestRunError['level']) => {
    switch (level) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSourceBadge = (source: TestRunError['source']) => {
    const colors: Record<TestRunError['source'], string> = {
      selector: 'bg-purple-100 text-purple-700',
      login: 'bg-blue-100 text-blue-700',
      extraction: 'bg-green-100 text-green-700',
      navigation: 'bg-orange-100 text-orange-700',
      unknown: 'bg-gray-100 text-gray-700',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', colors[source])}>
        {source}
      </Badge>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
      {/* Error List */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Error Log
          </CardTitle>
          <CardDescription>
            {errors.length} error{errors.length !== 1 ? 's' : ''} recorded
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {errors.length > 0 ? (
              <div className="divide-y">
                {errors.map((error) => (
                  <div
                    key={error.id}
                    className={cn(
                      'p-4 cursor-pointer hover:bg-muted/50 transition-colors',
                      selectedError?.id === error.id && 'bg-muted'
                    )}
                    onClick={() => setSelectedError(error)}
                  >
                    <div className="flex items-start gap-3">
                      {getErrorIcon(error.level)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{error.message}</p>
                          {getSourceBadge(error.source)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(error.timestamp)}</span>
                          {error.sku && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{error.sku}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-3" />
                <p className="text-sm font-medium">No errors recorded</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This test run completed without any errors
                </p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Error Details */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Error Details</CardTitle>
          <CardDescription>Stack trace and additional information</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedError ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Message</h4>
                <p className="text-sm p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                  {selectedError.message}
                </p>
              </div>

              {selectedError.stack_trace && (
                <div>
                  <h4 className="font-medium mb-2">Stack Trace</h4>
                  <ScrollArea className="h-48">
                    <pre className="text-xs p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto">
                      {selectedError.stack_trace}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2">Metadata</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Timestamp</dt>
                    <dd className="font-mono">{formatDate(selectedError.timestamp)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>{getSourceBadge(selectedError.source)}</dd>
                  </div>
                  {selectedError.sku && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">SKU</dt>
                      <dd className="font-mono">{selectedError.sku}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center h-full">
              <AlertTriangle className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">Select an error</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click on an error from the list to view details
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TestRunDetailView({
  testRun,
  open,
  onOpenChange,
  onCompare,
}: TestRunDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Handle export as JSON
  const handleExport = useCallback(() => {
    if (!testRun) return;

    const exportData = {
      ...testRun,
      exported_at: new Date().toISOString(),
      export_version: '1.0',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-run-${testRun.id}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [testRun]);

  // Handle compare activation
  const handleCompare = useCallback(() => {
    if (testRun && onCompare) {
      onCompare(testRun.id);
      onOpenChange(false);
    }
  }, [testRun, onCompare, onOpenChange]);

  // Early return if no test run
  if (!testRun) return null;

  const statusConfig = getStatusBadge(testRun.status);
  const StatusIcon = statusConfig.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-600">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  Test Run Details
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {testRun.scraper_name || testRun.scraper_id} • {formatDate(testRun.created_at)}
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn('flex items-center gap-1 px-3 py-1', statusConfig.className)}
            >
              <StatusIcon className="h-3 w-3" />
              {statusConfig.label}
            </Badge>
          </div>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCompare}
            disabled={!onCompare}
            title={!onCompare ? 'Compare feature coming in Task 13' : 'Select another run to compare'}
          >
            <GitCompare className="h-4 w-4 mr-1" />
            Compare
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="selectors" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Selectors
            </TabsTrigger>
            <TabsTrigger value="login" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Login
            </TabsTrigger>
            <TabsTrigger value="extraction" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Extraction
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Errors
              {testRun.errors && testRun.errors.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                  {testRun.errors.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-1">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab testRun={testRun} />
              </TabsContent>

              <TabsContent value="selectors" className="mt-0">
                {testRun.selector_events && testRun.selector_events.length > 0 ? (
                  <LiveSelectorResults selectorEvents={testRun.selector_events} />
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Target className="h-8 w-8 mx-auto text-gray-300 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No selector validation data available for this test run
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="login" className="mt-0">
                {testRun.login_event ? (
                  <LiveLoginStatus loginEvent={testRun.login_event} />
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <User className="h-8 w-8 mx-auto text-gray-300 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No login validation data available for this test run
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="extraction" className="mt-0">
                {testRun.extraction_events && testRun.extraction_events.length > 0 ? (
                  <LiveExtractionProgress
                    extractionEvents={testRun.extraction_events}
                    totalFields={testRun.extraction_events.length}
                  />
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="h-8 w-8 mx-auto text-gray-300 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No extraction data available for this test run
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="errors" className="mt-0">
                <ErrorsTab errors={testRun.errors || []} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default TestRunDetailView;
