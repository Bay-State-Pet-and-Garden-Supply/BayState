'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, ArrowRight, BarChart3, AlertCircle, Database } from 'lucide-react';
import type { InventoryDashboardStats } from '@/lib/admin/inventory/types';

const statusBadgeColor: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
};

export function InventoryDashboard({ stats }: { stats: InventoryDashboardStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Last Sync */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Last Integra Sync</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {stats.lastSyncRun ? (
            <div className="space-y-2">
              <p className="text-sm font-medium truncate">
                {stats.lastSyncRun.file_name ?? `Sync ${stats.lastSyncRun.id.slice(0, 8)}`}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(stats.lastSyncRun.started_at).toLocaleDateString()}</span>
                <Badge variant="outline" className={statusBadgeColor[stats.lastSyncRun.status] ?? ''}>
                  {stats.lastSyncRun.status}
                </Badge>
              </div>
              <Link href={`/admin/inventory/sync-runs/${stats.lastSyncRun.id}`}>
                <Button variant="link" size="sm" className="p-0 h-auto text-xs">
                  View details <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No syncs yet</p>
          )}
        </CardContent>
      </Card>

      {/* Open Discrepancies */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Open Discrepancies</CardTitle>
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.openIssues}</p>
          <p className="text-xs text-muted-foreground mt-1">Items needing review</p>
        </CardContent>
      </Card>

      {/* Register-only Products */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Register-only Products</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold ${stats.registerOnlyProducts > 0 ? 'text-amber-600' : ''}`}>
            {stats.registerOnlyProducts}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Not on website yet</p>
        </CardContent>
      </Card>

      {/* Price Mismatches */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Price Mismatches</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.priceMismatches}</p>
          <p className="text-xs text-muted-foreground mt-1">Register vs website price</p>
        </CardContent>
      </Card>

      {/* Quantity Mismatches */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Quantity Mismatches</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.quantityMismatches}</p>
          <p className="text-xs text-muted-foreground mt-1">Register vs website qty</p>
        </CardContent>
      </Card>

      {/* Pushed to Pipeline */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pushed to Pipeline</CardTitle>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">{stats.pushedToPipeline}</p>
          <p className="text-xs text-muted-foreground mt-1">Products sent to onboarding</p>
        </CardContent>
      </Card>
    </div>
  );
}
