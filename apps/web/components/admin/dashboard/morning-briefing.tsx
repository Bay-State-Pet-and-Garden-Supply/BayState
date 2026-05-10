'use client';

import React from 'react';
import { Sun } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useActionRequired } from '@/hooks/use-action-required';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

function generateBriefing(
  orderStats: NonNullable<ReturnType<typeof useDashboardStats>['orderStats']>,
  inventoryStats: NonNullable<ReturnType<typeof useDashboardStats>['inventoryStats']>,
  actionItems: ReturnType<typeof useActionRequired>['items']
): string[] {
  const lines: string[] = [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (orderStats.today_sales > 0) {
    lines.push(
      `${greeting}. Yesterday you had ${formatCurrency(orderStats.today_sales)} in sales across ${orderStats.today_order_count} orders.`
    );
  } else {
    lines.push(`${greeting}. No sales recorded yet today.`);
  }

  const parts: string[] = [];
  if (orderStats.today_web_orders > 0) parts.push(`${orderStats.today_web_orders} online`);
  if (orderStats.today_register_orders > 0) parts.push(`${orderStats.today_register_orders} in-store`);
  if (parts.length > 0) {
    lines.push(`${parts.join(' and ')} orders.`);
  }

  if (inventoryStats.open_issues > 0) {
    const topIssue = actionItems?.[0];
    if (topIssue?.label === 'register_only') {
      lines.push(
        `${inventoryStats.register_only_products} products exist in-store but are not online yet.`
      );
    } else if (topIssue?.label === 'price_mismatch') {
      lines.push(
        `${inventoryStats.price_mismatches} products have price discrepancies between register and website.`
      );
    } else {
      lines.push(`${inventoryStats.open_issues} inventory discrepancies found.`);
    }
  }

  if (orderStats.ready_for_pickup > 0) {
    lines.push(`${orderStats.ready_for_pickup} orders are ready for pickup.`);
  }
  if (orderStats.unpaid_orders > 0) {
    lines.push(`${orderStats.unpaid_orders} orders have unpaid balances.`);
  }

  return lines;
}

export function MorningBriefing() {
  const { orderStats, inventoryStats, loading: statsLoading } = useDashboardStats();
  const { items: actionItems, loading: actionsLoading } = useActionRequired();

  const isLoading = statsLoading || actionsLoading;

  const briefingLines =
    orderStats && inventoryStats
      ? generateBriefing(orderStats, inventoryStats, actionItems)
      : [];

  const needsAttention = actionItems.filter((item) => item.severity === 'error');
  const warnings = actionItems.filter((item) => item.severity === 'warning');
  const infoItems = actionItems.filter((item) => item.severity !== 'error' && item.severity !== 'warning');

  return (
    <Card className="border-t-4 border-t-amber-400 py-4">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
            <Sun className="h-5 w-5 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            Store Briefing
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : briefingLines.length > 0 ? (
          <div className="space-y-1">
            {briefingLines.map((line, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No operational data available yet today.
          </p>
        )}

        {!isLoading && actionItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recommended actions:</p>
            <ol className="space-y-1.5">
              {[...needsAttention, ...warnings, ...infoItems].slice(0, 5).map((item, i) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    {item.count} {item.label.replace(/_/g, ' ')}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={item.href}>
                      {item.category === 'unpaid_pickup' ? 'Review Orders' :
                       item.category === 'register_only' ? 'Push Products' :
                       item.category === 'price_mismatch' ? 'Fix Prices' :
                       item.category === 'failed_syncs' ? 'View Failed Sync' :
                       'View'}
                    </Link>
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {!isLoading && actionItems.length === 0 && (
          <p className="text-sm text-green-600 font-medium">
            Everything looks good today.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
