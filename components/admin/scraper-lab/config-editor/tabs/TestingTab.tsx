'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Badge } from '@/components/ui/badge';
import { Database, FileCode, Loader2, PlayCircle, RotateCcw } from 'lucide-react';
import { TestSkuManager } from '@/components/admin/scraper-studio/TestSkuManager';
import { stringify } from 'yaml';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface TestingTabProps {
  configId?: string;
}

interface TestRunStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  summary?: {
    passed: number;
    failed: number;
    total: number;
  };
  skus_tested?: string[];
  job_status?: string;
}

function parseSkus(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((sku) => sku.trim())
    .filter(Boolean);
}

export function TestingTab({ configId }: TestingTabProps) {
  const { watch } = useFormContext<ScraperConfig>();
  const [activeTab, setActiveTab] = useState('database');
  const [manualSkus, setManualSkus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<TestRunStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const config = watch();
  const configYaml = React.useMemo(() => {
    try {
      return stringify(config, { indent: 2, lineWidth: 0 });
    } catch {
      return '';
    }
  }, [config]);

  const loadRunStatus = useCallback(async (testRunId: string) => {
    const response = await fetch(`/api/admin/scrapers/studio/test/${testRunId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to load test run status');
    }

    const data = await response.json();
    const normalizedStatus: TestRunStatus['status'] =
      data.status === 'completed' || data.status === 'failed' || data.status === 'running'
        ? data.status
        : 'pending';

    setCurrentRun({
      id: data.id,
      status: normalizedStatus,
      started_at: data.started_at,
      completed_at: data.completed_at,
      duration_ms: data.duration_ms,
      summary: data.summary,
      skus_tested: data.skus_tested,
      job_status: data.job_status,
    });
  }, []);

  useEffect(() => {
    if (!currentRun || (currentRun.status !== 'pending' && currentRun.status !== 'running')) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        await loadRunStatus(currentRun.id);
        setPollError(null);
      } catch (error) {
        console.error(error);
        setPollError('Failed to refresh test run status');
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [currentRun, loadRunStatus]);

  const handleRunTest = async () => {
    if (!configId) {
      toast.error('Save the config before running tests');
      return;
    }

    setIsRunning(true);
    setPollError(null);

    try {
      const parsedSkus = parseSkus(manualSkus);
      const response = await fetch('/api/admin/scrapers/studio/test', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config_id: configId,
          ...(parsedSkus.length > 0 ? { skus: parsedSkus } : {}),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create test run');
      }

      toast.success(`Test run started (${payload.skus_count} SKU${payload.skus_count === 1 ? '' : 's'})`);
      await loadRunStatus(payload.test_run_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run tests';
      toast.error(message);
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  };

  const statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
    currentRun?.status === 'completed'
      ? 'default'
      : currentRun?.status === 'failed'
        ? 'destructive'
        : currentRun?.status === 'running'
          ? 'secondary'
          : 'outline';

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="database" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Test SKU Database
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Config YAML
          </TabsTrigger>
          <TabsTrigger value="runner" className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Test Runner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="space-y-4">
          {configId ? (
            <TestSkuManager configId={configId} configYaml={configYaml} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Database className="h-8 w-8 mb-2" />
                <p className="text-sm">Save the config to enable test SKU management</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Config-Based Test SKUs</CardTitle>
              <CardDescription>
                SKUs defined directly in the configuration YAML file.
                These are legacy and can be imported into the database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={undefined as never}
                name="test_skus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Golden SKUs (Known Good)</FormLabel>
                    <FormControl>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder="SKU1, SKU2, SKU3"
                        value={Array.isArray(field.value) ? field.value.join(', ') : ''}
                        onChange={(e) => {
                          const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          field.onChange(val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={undefined as never}
                name="fake_skus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fake SKUs (Expect 404)</FormLabel>
                    <FormControl>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder="INVALID1, INVALID2"
                        value={Array.isArray(field.value) ? field.value.join(', ') : ''}
                        onChange={(e) => {
                          const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          field.onChange(val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runner" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Runner</CardTitle>
              <CardDescription>
                Execute a studio test run for this configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <FormLabel>Optional SKU Override</FormLabel>
                <Input
                  value={manualSkus}
                  onChange={(event) => setManualSkus(event.target.value)}
                  placeholder="Comma or newline separated SKUs. Leave empty to use saved test SKUs."
                />
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleRunTest} disabled={isRunning || !configId}>
                  {isRunning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-2 h-4 w-4" />
                  )}
                  Run Studio Test
                </Button>

                {currentRun && (
                  <Button
                    variant="outline"
                    onClick={() => loadRunStatus(currentRun.id)}
                    disabled={isRunning}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Refresh Status
                  </Button>
                )}
              </div>

              {!configId && (
                <p className="text-sm text-muted-foreground">
                  Save the configuration first to enable test execution.
                </p>
              )}

              {pollError && (
                <p className="text-sm text-destructive">{pollError}</p>
              )}

              {currentRun && (
                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Current Run</p>
                    <Badge variant={statusVariant}>{currentRun.status.toUpperCase()}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Run ID</p>
                      <p className="font-mono">{currentRun.id.slice(0, 8)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">SKUs</p>
                      <p>{currentRun.skus_tested?.length || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Duration</p>
                      <p>{currentRun.duration_ms ? `${(currentRun.duration_ms / 1000).toFixed(2)}s` : '-'}</p>
                    </div>
                  </div>
                  {currentRun.summary && (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Passed</p>
                        <p className="font-medium text-green-600">{currentRun.summary.passed}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Failed</p>
                        <p className="font-medium text-red-600">{currentRun.summary.failed}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-medium">{currentRun.summary.total}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
