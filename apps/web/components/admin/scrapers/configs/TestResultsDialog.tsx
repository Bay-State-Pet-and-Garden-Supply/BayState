'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Play,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import type { TestResult } from '@/lib/admin/scraper-configs/actions';

interface TestResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId: string;
  configSlug: string;
}

export function TestResultsDialog({
  open,
  onOpenChange,
  configId,
  configSlug,
}: TestResultsDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTest = () => {
    startTransition(async () => {
      setIsRunning(true);
      try {
        const formData = new FormData();
        formData.set('configId', configId);

        const response = await fetch('/api/admin/scraper-configs/test', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (result.success && result.testResult) {
          setTestResult(result.testResult);
        } else {
          alert(result.error || 'Failed to run test');
        }
      } catch (error) {
        console.error('Test failed:', error);
        alert('Failed to run test');
      } finally {
        setIsRunning(false);
      }
    });
  };

  const getStatusBadge = (status: string, isPassing: boolean) => {
    const variant = isPassing
      ? 'default'
      : status === 'no_results'
      ? 'secondary'
      : 'destructive';

    const icon = isPassing ? (
      <CheckCircle2 className="mr-1 h-3 w-3" />
    ) : status === 'no_results' ? (
      <AlertTriangle className="mr-1 h-3 w-3" />
    ) : (
      <XCircle className="mr-1 h-3 w-3" />
    );

    return (
      <Badge variant={variant as 'default' | 'secondary' | 'destructive'}>
        {icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getSelectorStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default">Pass</Badge>;
      case 'failed':
        return <Badge variant="destructive">Fail</Badge>;
      case 'mixed':
        return <Badge variant="secondary">Mixed</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Skipped</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Test Scraper: {configSlug}
          </DialogTitle>
          <DialogDescription>
            Run tests against the scraper configuration to verify selectors and data extraction.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {testResult ? (
            <div className="space-y-6 h-full overflow-y-auto">
              {/* Summary Section */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="text-2xl font-bold">{testResult.summary.total}</div>
                  <div className="text-sm text-muted-foreground">Total SKUs</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{testResult.summary.success}</div>
                  <div className="text-sm text-green-600">Passed</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-700">{testResult.summary.no_results}</div>
                  <div className="text-sm text-yellow-600">No Results</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-700">{testResult.summary.failed}</div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
              </div>

              {/* Execution Info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {testResult.execution_time_seconds.toFixed(2)}s
                </div>
                <div className="flex items-center gap-1">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  {testResult.success ? 'All tests passed' : 'Some tests failed'}
                </div>
                <div>
                  {new Date(testResult.timestamp).toLocaleString()}
                </div>
              </div>

              <Separator />

              {/* Selector Results */}
              {Object.keys(testResult.selectors).length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Selector Results</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(testResult.selectors).map(([name, selector]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div>
                          <div className="font-medium">{name}</div>
                          <div className="text-xs text-muted-foreground">
                            {selector.success_count} pass, {selector.fail_count} fail
                          </div>
                        </div>
                        {getSelectorStatusBadge(selector.status)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* SKU Results */}
              <div>
                <h3 className="font-semibold mb-3">SKU Results</h3>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {testResult.skus.map((sku) => (
                      <div
                        key={sku.sku}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-muted px-2 py-0.5 rounded">
                              {sku.sku}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {sku.sku_type}
                            </Badge>
                          </div>
                          {sku.error && (
                            <div className="text-xs text-red-600 mt-1">{sku.error}</div>
                          )}
                          {sku.data && Object.keys(sku.data).length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {Object.entries(sku.data)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(', ')}
                            </div>
                          )}
                        </div>
                        {getStatusBadge(sku.status, sku.is_passing)}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Errors */}
              {testResult.errors.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3 text-red-600">Errors</h3>
                    <ScrollArea className="h-32">
                      <div className="space-y-1">
                        {testResult.errors.map((error, i) => (
                          <div
                            key={i}
                            className="text-sm text-red-600 bg-red-50 p-2 rounded"
                          >
                            {error}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-muted/50 p-4 rounded-full mb-4">
                <Terminal className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Test Results</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                Run a test to verify that the scraper configuration is working correctly.
                The test will execute against configured test SKUs.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setTestResult(null)}
            disabled={isRunning || isPending}
          >
            Clear Results
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRunTest}
              disabled={isRunning || isPending}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Test
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
