import React from 'react';
import { Database, Activity, AlertCircle, ListOrdered } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HealthMetric {
  label: string;
  value: string;
  icon: React.ElementType;
  isHealthy: boolean;
}

const metrics: HealthMetric[] = [
  {
    label: 'Database Latency',
    value: 'Healthy',
    icon: Database,
    isHealthy: true,
  },
  {
    label: 'Event Stream',
    value: 'Connected',
    icon: Activity,
    isHealthy: true,
  },
  {
    label: 'Error Rate',
    value: '0%',
    icon: AlertCircle,
    isHealthy: true,
  },
  {
    label: 'Queue Depth',
    value: 'N/A',
    icon: ListOrdered,
    isHealthy: true,
  },
];

export function SystemHealthWidget() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">System Health</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <metric.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{metric.label}</span>
              </div>
              <Badge
                variant="outline"
                className={
                  metric.isHealthy
                    ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
                }
              >
                {metric.value}
              </Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          * Placeholder values — awaiting Redis/Queue integration
        </p>
      </CardContent>
    </Card>
  );
}
