'use client';

import { useMemo, useState, useEffect } from 'react';
import { PlayCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { TestRunHistory } from '@/components/admin/scraper-studio/TestRunHistory';
import { useTestRunRecordSubscription } from '@/lib/realtime/useTestRunRecordSubscription';

interface TestRunStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'passed' | 'partial';
  skus_tested?: string[];
  summary?: {
    passed: number;
    failed: number;
    total: number;
  };
  duration_ms?: number;
  job_status?: string;
}

interface ScraperConfig {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  test_skus: string[];
  fake_skus: string[];
}

function parseSkus(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((sku) => sku.trim())
    .filter(Boolean);
}

export function StudioTestingPanel() {
  const [configs, setConfigs] = useState<ScraperConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [skuInput, setSkuInput] = useState('');
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentRun, setCurrentRun] = useState<TestRunStatus | null>(null);
  const runRealtime = useTestRunRecordSubscription({
    testRunId: currentRun?.id || '',
    autoConnect: !!currentRun,
  });

  // Debug logging
  useEffect(() => {
    console.log('[Studio] currentRun:', currentRun?.id, 'status:', currentRun?.status);
  }, [currentRun]);

  useEffect(() => {
    console.log('[Studio] runRealtime:', { isConnected: runRealtime.isConnected, runId: runRealtime.run?.id, status: runRealtime.run?.status });
  }, [runRealtime]);

  useEffect(() => {
    if (!currentRun?.id) {
      return;
    }

    const hydrateRun = async () => {
      try {
        const response = await fetch(`/api/admin/scrapers/studio/test/${currentRun.id}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setCurrentRun((prev) => {
          if (!prev || prev.id !== data.id) {
            return prev;
          }

          return {
            ...prev,
            status: data.status,
            summary: data.summary,
            duration_ms: data.duration_ms,
            job_status: data.job_status,
          };
        });
      } catch {
        // best effort initial hydration
      }
    };

    hydrateRun();
  }, [currentRun?.id]);

  // Poll for step progress while job is running (results only populated at end)
  useEffect(() => {
    if (!currentRun?.id || (currentRun.status !== 'pending' && currentRun.status !== 'running')) {
      return;
    }

    const fetchProgress = async () => {
      try {
        const response = await fetch(`/api/admin/scrapers/studio/test/${currentRun.id}/timeline`);
        if (!response.ok) return;
        
        const data = await response.json();
        const steps = data.steps || [];
        const completedSteps = steps.filter((s: { status: string }) => s.status === 'completed').length;
        const failedSteps = steps.filter((s: { status: string }) => s.status === 'failed').length;
        
        setCurrentRun((prev) => {
          if (!prev || prev.id !== currentRun.id) return prev;
          
          // If we have actual results from callback, use those; otherwise use step progress
          const runResults = Array.isArray(runRealtime.run?.results) ? runRealtime.run.results : [];
          if (runResults.length > 0) {
            const passed = runResults.filter((r) => {
              const status = typeof r.status === 'string' ? r.status : '';
              return status === 'success' || status === 'completed' || status === 'no_results';
            }).length;
            return {
              ...prev,
              summary: { passed, failed: runResults.length - passed, total: runResults.length },
            };
          }
          
          // Show step progress while running
          return {
            ...prev,
            summary: { 
              passed: completedSteps, 
              failed: failedSteps, 
              total: steps.length 
            },
          };
        });
      } catch {
        // Best effort
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
  }, [currentRun?.id, currentRun?.status]);

  // Update from realtime subscription when results arrive
  useEffect(() => {
    if (!runRealtime.run || !currentRun || runRealtime.run.id !== currentRun.id) {
      return;
    }

    const nextStatus = runRealtime.run.status;
    const runResults = Array.isArray(runRealtime.run.results) ? runRealtime.run.results : [];
    
    // Only update summary if we have actual results
    if (runResults.length > 0) {
      const passed = runResults.filter((r) => {
        const status = typeof r.status === 'string' ? r.status : '';
        return status === 'success' || status === 'completed' || status === 'no_results';
      }).length;

      setCurrentRun((prev) => {
        if (!prev || prev.id !== runRealtime.run?.id) {
          return prev;
        }

        return {
          ...prev,
          status: nextStatus,
          summary: {
            passed,
            failed: Math.max(runResults.length - passed, 0),
            total: runResults.length,
          },
          duration_ms: runRealtime.run.duration_ms ?? prev.duration_ms,
        };
      });
    } else {
      // Just update status and duration
      setCurrentRun((prev) => {
        if (!prev || prev.id !== runRealtime.run?.id) {
          return prev;
        }
        return {
          ...prev,
          status: nextStatus,
          duration_ms: runRealtime.run.duration_ms ?? prev.duration_ms,
        };
      });
    }
  }, [runRealtime.run, currentRun]);

  // Fetch scraper configs with test_skus on mount
  useEffect(() => {
    async function fetchConfigs() {
      try {
        const response = await fetch('/api/admin/scraper-configs?include_test_skus=true&status=published&limit=100');
        if (!response.ok) {
          throw new Error('Failed to fetch configs');
        }
        const data = await response.json();
        setConfigs(data.data || []);
      } catch (error) {
        console.error('Error fetching configs:', error);
        toast.error('Failed to load scraper configs');
      } finally {
        setIsLoadingConfigs(false);
      }
    }
    fetchConfigs();
  }, []);

  const skuCount = useMemo(() => parseSkus(skuInput).length, [skuInput]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === selectedConfigId),
    [configs, selectedConfigId]
  );

  // Handle config selection - auto-fill test SKUs
  const handleConfigSelect = (configId: string) => {
    setSelectedConfigId(configId);
    const config = configs.find((c) => c.id === configId);
    if (config && config.test_skus && config.test_skus.length > 0) {
      setSkuInput(config.test_skus.join(', '));
    }
  };

  const handleRun = async () => {
    if (!selectedConfigId) {
      toast.error('Please select a scraper config');
      return;
    }

    setIsSubmitting(true);
    try {
      const skus = parseSkus(skuInput);
      const response = await fetch('/api/admin/scrapers/studio/test', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config_id: selectedConfigId,
          ...(skus.length > 0 ? { skus } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start studio test');
      }

      setCurrentRun({
        id: data.test_run_id,
        status: 'pending',
        skus_tested: skus,
      });
      toast.success('Studio test run started');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run test';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run Studio Test</CardTitle>
          <CardDescription>
            Trigger a test run for a specific configuration and inspect results below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="studio-config">Scraper Configuration</Label>
            {isLoadingConfigs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading configurations...
              </div>
            ) : (
              <Select value={selectedConfigId} onValueChange={handleConfigSelect}>
                <SelectTrigger id="studio-config">
                  <SelectValue placeholder="Select a scraper configuration" />
                </SelectTrigger>
                <SelectContent>
                  {configs.length === 0 ? (
                    <SelectItem value="empty" disabled>
                      No published configs found
                    </SelectItem>
                  ) : (
                    configs.map((config) => (
                      <SelectItem key={config.id} value={config.id}>
                        {config.display_name || config.slug}
                        {config.test_skus && config.test_skus.length > 0 && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            ({config.test_skus.length} test SKUs)
                          </span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedConfig && selectedConfig.test_skus && selectedConfig.test_skus.length > 0 && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">Test SKUs from config:</p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedConfig.test_skus.join(', ')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="studio-skus">SKUs to test</Label>
            <Input
              id="studio-skus"
              value={skuInput}
              onChange={(event) => setSkuInput(event.target.value)}
              placeholder="Comma/newline separated SKUs. Leave blank to use saved test SKUs."
            />
            <p className="text-xs text-muted-foreground">
              {skuCount} SKU{skuCount === 1 ? '' : 's'} parsed
              {selectedConfigId && selectedConfig && selectedConfig.test_skus && selectedConfig.test_skus.length > 0 && skuCount === selectedConfig.test_skus.length && (
                <span className="ml-2 text-green-600">✓ Using config test SKUs</span>
              )}
            </p>
          </div>
          <Button 
            onClick={handleRun} 
            disabled={isSubmitting || !selectedConfigId || isLoadingConfigs}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Starting...' : 'Run Studio Test'}
          </Button>

          {currentRun && (
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Latest run</p>
                <Badge variant="outline">{currentRun.status.toUpperCase()}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 font-mono">{currentRun.id}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Live status: {runRealtime.isConnected ? 'connected' : 'offline'}
              </p>
              {currentRun.job_status && (
                <p className="text-xs text-muted-foreground mt-1">
                  Job status: {currentRun.job_status}
                </p>
              )}
              {currentRun.summary && (
                <p className="text-xs text-muted-foreground mt-1">
                  Passed {currentRun.summary.passed} / {currentRun.summary.total}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <TestRunHistory />
    </div>
  );
}

export default StudioTestingPanel;
