'use client';

import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMigrationProgress } from '@/hooks/use-migration-progress';

const channelConfig = {
  web: { label: 'New Website', color: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
  shopsite: { label: 'Legacy (ShopSite)', color: 'bg-amber-400', hover: 'hover:bg-amber-500' },
  integra: { label: 'Register (Integra)', color: 'bg-blue-500', hover: 'hover:bg-blue-600' },
  manual: { label: 'Manual', color: 'bg-gray-400', hover: 'hover:bg-gray-500' },
  import: { label: 'Import', color: 'bg-gray-400', hover: 'hover:bg-gray-500' },
};

const channels = ['web', 'shopsite', 'integra'] as const;

type Trend = 'up' | 'down' | 'stable';

function computeTrend(values: number[]): Trend {
  if (values.length < 3) return 'stable';
  const recent = values.slice(-3);
  const firstHalf = recent.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
  const secondHalf = recent.slice(1).reduce((a, b) => a + b, 0) / 2;
  const diff = secondHalf - firstHalf;
  if (diff > 0.5) return 'up';
  if (diff < -0.5) return 'down';
  return 'stable';
}

const trendIcon: Record<Trend, React.ReactNode> = {
  up: <TrendingUp className="h-4 w-4 text-emerald-600" />,
  down: <TrendingDown className="h-4 w-4 text-red-500" />,
  stable: <Minus className="h-4 w-4 text-gray-400" />,
};

const trendLabel: Record<Trend, string> = {
  up: 'trending up ↑',
  down: 'declining ↓',
  stable: 'stable →',
};

export function MigrationProgress() {
  const { data, loading, error } = useMigrationProgress();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Migration Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load migration data.</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || channels.every((ch) => !data[ch] || data[ch].length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Migration Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough order history to show trends. Migration progress will appear as orders accumulate.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build unified month set across all channels
  const monthSet = new Set<string>();
  for (const ch of channels) {
    for (const d of data[ch] ?? []) {
      monthSet.add(d.month);
    }
  }
  const months = Array.from(monthSet).sort();
  const recentMonths = months.slice(-6);

  // Compute per-month max for bar scaling
  const monthMax: Record<string, number> = {};
  for (const m of recentMonths) {
    let total = 0;
    for (const ch of channels) {
      const entry = data[ch]?.find((d) => d.month === m);
      total += entry?.order_count ?? 0;
    }
    monthMax[m] = total || 1;
  }

  // Compute trends
  const webValues = (data.web ?? []).map((d) => d.order_count);
  const shopsiteValues = (data.shopsite ?? []).map((d) => d.order_count);
  const integraValues = (data.integra ?? []).map((d) => d.order_count);

  const webTrend = computeTrend(webValues);
  const shopsiteTrend = computeTrend(shopsiteValues);
  const integraTrend = computeTrend(integraValues);

  const formatMonth = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Migration Progress
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Monthly orders by channel (last 6 months)
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bar chart rows */}
        <div className="space-y-3">
          {recentMonths.map((month) => (
            <div key={month} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{formatMonth(month)}</p>
              {channels.map((ch) => {
                const entry = data[ch]?.find((d) => d.month === month);
                const count = entry?.order_count ?? 0;
                const cfg = channelConfig[ch];
                return (
                  <div key={ch} className="flex items-center gap-2">
                    <span className="w-28 text-xs text-right text-muted-foreground truncate shrink-0">
                      {cfg.label}
                    </span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                      <div
                        className={cn('h-full rounded-sm transition-all', cfg.color)}
                        style={{ width: `${(count / monthMax[month]) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-xs font-mono text-right shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Channel legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {channels.map((ch) => (
            <span key={ch} className="flex items-center gap-1.5">
              <span className={cn('inline-block w-3 h-3 rounded', channelConfig[ch].color)} />
              {channelConfig[ch].label}
            </span>
          ))}
        </div>

        {/* Trend summary */}
        <div className="space-y-1.5 border-t pt-3 text-sm">
          <p className="flex items-center gap-2">
            {trendIcon[webTrend]}
            <span>New website orders <strong>{trendLabel[webTrend]}</strong></span>
          </p>
          <p className="flex items-center gap-2">
            {trendIcon[shopsiteTrend]}
            <span>Legacy orders <strong>{trendLabel[shopsiteTrend]}</strong></span>
          </p>
          <p className="flex items-center gap-2">
            {trendIcon[integraTrend]}
            <span>Register sales <strong>{trendLabel[integraTrend]}</strong></span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
