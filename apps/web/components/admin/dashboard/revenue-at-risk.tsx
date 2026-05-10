'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign } from 'lucide-react';
import { useRevenueAtRisk } from '@/hooks/use-revenue-at-risk';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function RevenueAtRisk() {
  const { items, loading, error } = useRevenueAtRisk();

  const totalRisk = items.reduce((sum, i) => sum + i.revenueRisk, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Revenue at Risk</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Price mismatches ranked by financial impact
          </p>
        </div>
        <div className="p-2 rounded-full bg-red-50">
          <DollarSign className="h-4 w-4 text-red-600" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No price mismatches affecting revenue.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left py-2 pr-2 font-medium">SKU</th>
                    <th className="text-left py-2 pr-2 font-medium">Product</th>
                    <th className="text-right py-2 pr-2 font-medium">Website</th>
                    <th className="text-right py-2 pr-2 font-medium">Register</th>
                    <th className="text-right py-2 pr-2 font-medium">Qty</th>
                    <th className="text-right py-2 font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
                        {item.sku}
                      </td>
                      <td className="py-2 pr-2 truncate max-w-[160px]">
                        {item.register_name ?? '—'}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {item.website_price != null ? formatCurrency(item.website_price) : '—'}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {item.register_price != null ? formatCurrency(item.register_price) : '—'}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {item.register_quantity ?? '—'}
                      </td>
                      <td className={cn(
                        'py-2 text-right tabular-nums font-semibold',
                        item.revenueRisk > 50 ? 'text-red-600' : 'text-foreground'
                      )}>
                        {formatCurrency(item.revenueRisk)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalRisk > 0 && (
              <div className="mt-4 pt-3 border-t flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">
                  Total revenue at risk
                </span>
                <span className="text-lg font-bold text-red-600">
                  {formatCurrency(totalRisk)}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
