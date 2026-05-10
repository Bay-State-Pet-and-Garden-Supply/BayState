'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Check, X, Upload, RefreshCw } from 'lucide-react';
import type { IntegrationSyncRun } from '@/lib/orders';
import type { InventorySyncRunSummary } from '@/lib/admin/inventory/types';
import type { InventoryReconciliationItemRow } from '@/lib/admin/integrations/reconciliation-types';
import { IssueTypeBadge } from './issue-type-badge';
import { IssueStatusBadge } from './issue-status-badge';
import { markInventoryIssueStatusAction, pushInventoryIssueToPipelineAction } from '@/app/admin/inventory/actions';

type FilterTab =
  | { value: string; label: string; param: 'issue_type' | 'status' }
  | { divider: true };

const issueTypeTabs: FilterTab[] = [
  { value: '', label: 'All Issues', param: 'issue_type' },
  { value: 'register_only', label: 'Register-only', param: 'issue_type' },
  { value: 'price_mismatch', label: 'Price Mismatches', param: 'issue_type' },
  { value: 'quantity_mismatch', label: 'Quantity Mismatches', param: 'issue_type' },
  { value: 'stock_status_mismatch', label: 'Stock Mismatches', param: 'issue_type' },
];

const statusTabs: FilterTab[] = [
  { value: '', label: 'All Statuses', param: 'status' },
  { value: 'resolved', label: 'Resolved', param: 'status' },
  { value: 'ignored', label: 'Ignored', param: 'status' },
  { value: 'pushed_to_pipeline', label: 'In Pipeline', param: 'status' },
];

const filterTabs: FilterTab[] = [
  { value: '', label: 'All Issues', param: 'issue_type' },
  ...issueTypeTabs.filter((t): t is { value: string; label: string; param: 'issue_type' | 'status' } => 'value' in t && t.value !== ''),
  { divider: true as const },
  ...statusTabs.filter((t): t is { value: string; label: string; param: 'issue_type' | 'status' } => 'value' in t && t.value !== ''),
];

function fmtCurrency(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return '$' + v.toFixed(2);
}

function fmtQty(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

export function SyncRunDetail({
  run,
  summary,
  items,
}: {
  run: IntegrationSyncRun;
  summary: InventorySyncRunSummary;
  items: InventoryReconciliationItemRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeIssueType = searchParams.get('issue_type') ?? '';
  const activeStatus = searchParams.get('status') ?? '';
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        router.refresh();
      } catch {
        toast.error('Action failed');
      } finally {
        setActionLoading(null);
      }
    },
    [router]
  );

  const setFilter = useCallback(
    (value: string, param: 'issue_type' | 'status') => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value) {
        // "All" — clear both params
        params.delete('issue_type');
        params.delete('status');
      } else if (param === 'status') {
        params.delete('issue_type');
        params.set('status', value);
      } else {
        params.delete('status');
        params.set('issue_type', value);
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const runStatusColor: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className={runStatusColor[run.status] ?? ''}>
              {run.status}
            </Badge>
            {run.file_name && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{run.file_name}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Rows</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{run.row_count}</p>
            <p className="text-xs text-muted-foreground">
              {run.inserted_count} inserted, {run.updated_count} updated
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{summary.totalIssues}</p>
            <p className="text-xs text-muted-foreground">
              {summary.openIssues} open, {summary.resolvedIssues} resolved
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${run.error_count > 0 ? 'text-red-600' : ''}`}>
              {run.error_count}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab, idx) => {
          if ('divider' in tab) {
            return <div key={`divider-${idx}`} className="w-px bg-border mx-1" />;
          }
          const isActive = tab.value === ''
            ? !activeIssueType && !activeStatus
            : tab.param === 'status'
              ? activeStatus === tab.value
              : activeIssueType === tab.value;
          return (
            <Button
              key={`${tab.param}-${tab.value}`}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(tab.value, tab.param)}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Issues Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issue Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Register</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Website</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No issues found
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{item.sku}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.register_name ?? item.website_name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <IssueTypeBadge type={item.issue_type} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {item.register_price !== null && <div>Price: {fmtCurrency(item.register_price)}</div>}
                    {item.register_quantity !== null && <div>Qty: {fmtQty(item.register_quantity)}</div>}
                    {item.register_price === null && item.register_quantity === null && '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {item.website_price !== null && <div>Price: {fmtCurrency(item.website_price)}</div>}
                    {item.website_quantity !== null && <div>Qty: {fmtQty(item.website_quantity)}</div>}
                    {item.website_price === null && item.website_quantity === null && '—'}
                  </td>
                  <td className="px-4 py-3">
                    <IssueStatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {item.status === 'open' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading === item.id}
                            onClick={() => {
                              setActionLoading(item.id);
                              handleAction(() => markInventoryIssueStatusAction(item.id, 'resolved'));
                            }}
                            title="Resolve"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading === item.id}
                            onClick={() => {
                              setActionLoading(item.id);
                              handleAction(() => markInventoryIssueStatusAction(item.id, 'ignored'));
                            }}
                            title="Ignore"
                          >
                            <X className="h-4 w-4 text-gray-500" />
                          </Button>
                          {item.issue_type === 'register_only' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={actionLoading === item.id}
                              onClick={() => {
                                setActionLoading(item.id);
                                handleAction(() => pushInventoryIssueToPipelineAction(item.id));
                              }}
                              title="Push to Pipeline"
                            >
                              <Upload className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                        </>
                      )}
                      {(item.status === 'resolved' || item.status === 'ignored' || item.status === 'pushed_to_pipeline') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionLoading === item.id}
                          onClick={() => {
                            setActionLoading(item.id);
                            handleAction(() => markInventoryIssueStatusAction(item.id, 'open'));
                          }}
                          title="Reopen"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
