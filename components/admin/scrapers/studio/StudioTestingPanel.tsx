'use client';

import { useMemo, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

function parseSkus(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((sku) => sku.trim())
    .filter(Boolean);
}

export function StudioTestingPanel() {
  const [configId, setConfigId] = useState('');
  const [skuInput, setSkuInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentRun, setCurrentRun] = useState<TestRunStatus | null>(null);

  const skuCount = useMemo(() => parseSkus(skuInput).length, [skuInput]);

  const handleRun = async () => {
    const trimmedConfigId = configId.trim();
    if (!trimmedConfigId) {
      toast.error('Config ID is required');
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
          config_id: trimmedConfigId,
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
            <Label htmlFor="studio-config-id">Configuration ID</Label>
            <Input
              id="studio-config-id"
              value={configId}
              onChange={(event) => setConfigId(event.target.value)}
              placeholder="UUID from Studio Configs list"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="studio-skus">Optional SKU override</Label>
            <Input
              id="studio-skus"
              value={skuInput}
              onChange={(event) => setSkuInput(event.target.value)}
              placeholder="Comma/newline separated SKUs. Leave blank to use saved test SKUs."
            />
            <p className="text-xs text-muted-foreground">{skuCount} SKU{skuCount === 1 ? '' : 's'} parsed</p>
          </div>
          <Button onClick={handleRun} disabled={isSubmitting}>
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
