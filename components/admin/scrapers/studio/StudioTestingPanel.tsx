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

interface TestRunStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  skus_tested?: string[];
  summary?: {
    passed: number;
    failed: number;
    total: number;
  };
  duration_ms?: number;
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
            </div>
          )}
        </CardContent>
      </Card>

      <TestRunHistory />
    </div>
  );
}

export default StudioTestingPanel;
