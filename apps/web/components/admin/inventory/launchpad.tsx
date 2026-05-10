'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Upload, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import type { InventoryReconciliationItemRow } from '@/lib/admin/integrations/reconciliation-types';
import { pushInventoryIssueToPipelineAction } from '@/app/admin/inventory/actions';

const pipelineStatusConfig: Record<string, { label: string; color: string }> = {
  imported: { label: 'Imported', color: 'bg-yellow-100 text-yellow-800' },
  searching: { label: 'Searching', color: 'bg-blue-100 text-blue-800' },
  url_review: { label: 'URL Review', color: 'bg-blue-100 text-blue-800' },
  scraping: { label: 'Scraping', color: 'bg-purple-100 text-purple-800' },
  extracting: { label: 'Extracting', color: 'bg-purple-100 text-purple-800' },
  scraped: { label: 'Scraped', color: 'bg-green-100 text-green-800' },
  consolidating: { label: 'Consolidating', color: 'bg-purple-100 text-purple-800' },
  finalizing: { label: 'Finalizing', color: 'bg-green-100 text-green-800' },
  exporting: { label: 'Exporting', color: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
  registered: { label: 'Registered', color: 'bg-yellow-100 text-yellow-800' },
  enriched: { label: 'Enriched', color: 'bg-blue-100 text-blue-800' },
  finalized: { label: 'Finalized', color: 'bg-green-100 text-green-800' },
};

function PipelineBadge({ status }: { status: string | null }) {
  if (!status) {
    return <Badge variant="outline" className="text-gray-500">Not Started</Badge>;
  }
  const cfg = pipelineStatusConfig[status];
  if (!cfg) {
    return <Badge variant="outline">{status}</Badge>;
  }
  return <Badge className={cfg.color + ' border-none'}>{cfg.label}</Badge>;
}

function extractDepartment(item: InventoryReconciliationItemRow): string {
  if (item.metadata && typeof item.metadata === 'object' && 'department' in item.metadata) {
    return String(item.metadata.department);
  }
  return '—';
}

function fmtCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return '$' + v.toFixed(2);
}

function fmtQty(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

interface LaunchpadProps {
  items: InventoryReconciliationItemRow[];
  pipelineBySku: Record<string, { id: string; pipeline_status: string }>;
}

export function Launchpad({ items, pipelineBySku }: LaunchpadProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState<Set<string>>(new Set());
  const [bulkPushing, setBulkPushing] = useState(false);

  const handleToggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  };

  const handlePush = async (issueId: string) => {
    setPushing(prev => new Set(prev).add(issueId));
    try {
      const result = await pushInventoryIssueToPipelineAction(issueId);
      if (result.success) {
        toast.success('Pushed to pipeline');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to push');
      }
    } catch {
      toast.error('Failed to push to pipeline');
    } finally {
      setPushing(prev => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    }
  };

  const handleBulkPush = async () => {
    if (selected.size === 0) return;
    setBulkPushing(true);
    let successCount = 0;
    let failCount = 0;
    for (const id of selected) {
      try {
        const result = await pushInventoryIssueToPipelineAction(id);
        if (result.success) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    if (failCount === 0) {
      toast.success(`${successCount} product(s) pushed to pipeline`);
    } else {
      toast.warning(`${successCount} pushed, ${failCount} failed`);
    }
    setSelected(new Set());
    setBulkPushing(false);
    router.refresh();
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Rocket className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No register-only products to launch</p>
          <p className="text-sm text-muted-foreground mt-1">
            Run an Integra sync to find products that exist in-store but are not online yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + Bulk Action Bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} register-only product{items.length !== 1 ? 's' : ''} found
          {selected.size > 0 && (
            <span className="ml-2 font-medium text-foreground">
              ({selected.size} selected)
            </span>
          )}
        </p>
        {selected.size > 0 && (
          <Button
            onClick={handleBulkPush}
            disabled={bulkPushing}
            size="sm"
          >
            <Upload className="mr-2 h-4 w-4" />
            {bulkPushing ? 'Pushing...' : `Push Selected (${selected.size})`}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 px-3 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === items.length && items.length > 0}
                  onChange={handleToggleAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Department</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => {
              const pipelineInfo = pipelineBySku[item.sku];
              const pipelineStatus = pipelineInfo?.pipeline_status ?? null;
              const isPushing = pushing.has(item.id);
              const isPushed = item.status === 'pushed_to_pipeline' || !!pipelineInfo;

              return (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => handleToggle(item.id)}
                      className="h-4 w-4 rounded border-gray-300"
                      disabled={isPushed && !pipelineInfo}
                    />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-medium">{item.sku}</td>
                  <td className="px-3 py-3 text-sm font-medium">{item.register_name || '—'}</td>
                  <td className="px-3 py-3 text-right text-sm font-semibold">{fmtCurrency(item.register_price)}</td>
                  <td className="px-3 py-3 text-right text-sm">{fmtQty(item.register_quantity)}</td>
                  <td className="px-3 py-3 text-sm text-muted-foreground">{extractDepartment(item)}</td>
                  <td className="px-3 py-3"><PipelineBadge status={pipelineStatus} /></td>
                  <td className="px-3 py-3 text-center">
                    {item.status === 'pushed_to_pipeline' && pipelineInfo ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/admin/pipeline">
                          <Check className="mr-1 h-4 w-4 text-green-600" />
                          In Pipeline
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePush(item.id)}
                        disabled={isPushing}
                      >
                        <Upload className="mr-1 h-4 w-4" />
                        {isPushing ? 'Pushing...' : 'Push'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
