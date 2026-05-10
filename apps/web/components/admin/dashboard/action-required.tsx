'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useActionRequired } from '@/hooks/use-action-required';

const labelMap: Record<string, { title: string; button: string }> = {
  unpaid_pickup: { title: 'Unpaid pickup orders over 24 hours', button: 'Review Orders' },
  register_only: { title: 'Products in-store but not online', button: 'Push Products' },
  price_mismatch: { title: 'Website prices lower than register', button: 'Fix Prices' },
  failed_sync: { title: 'Failed syncs in last 7 days', button: 'View Syncs' },
  aging_pickup: { title: 'Orders ready for pickup over 2 days', button: 'Review Orders' },
};

const severityIcon = {
  error: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

export function ActionRequired() {
  const { items, loading, error } = useActionRequired();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Action Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null;
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <p className="text-sm font-medium">Nothing needs attention</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Action Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const config = labelMap[item.label];
          if (!config) return null;

          const Icon = severityIcon[item.severity as keyof typeof severityIcon] ?? Info;

          return (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${
                  item.severity === 'error' ? 'text-red-500' :
                  item.severity === 'warning' ? 'text-amber-500' :
                  'text-blue-500'
                }`} />
                <div>
                  <p className="text-sm font-medium">{config.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {item.count}
                </Badge>
                <Button variant="outline" size="sm" asChild>
                  <Link href={item.href}>{config.button}</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
