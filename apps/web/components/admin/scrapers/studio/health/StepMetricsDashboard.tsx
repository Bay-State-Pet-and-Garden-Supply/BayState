'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { 
  getSelectorHealthStats, 
  getTopFailingSteps, 
  SelectorHealth, 
  FailingStep 
} from '@/lib/admin/scraper-health/step-metrics';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function StepMetricsDashboard() {
  const [selectors, setSelectors] = useState<SelectorHealth[]>([]);
  const [failingSteps, setFailingSteps] = useState<FailingStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [selectorData, stepData] = await Promise.all([
          getSelectorHealthStats(30),
          getTopFailingSteps(30)
        ]);
        setSelectors(selectorData);
        setFailingSteps(stepData);
      } catch (error) {
        console.error('Failed to load step metrics:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Top Missed Selectors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={selectors.slice(0, 10)}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis 
                  dataKey="selector" 
                  type="category" 
                  width={150} 
                  tickFormatter={(val) => val.length > 20 ? `${val.substring(0, 20)}...` : val}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                  cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="missed_count" name="Misses" radius={[0, 4, 4, 0]}>
                  {selectors.slice(0, 10).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.success_rate < 50 ? '#ef4444' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frequent Step Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead className="text-right">Failures</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failingSteps.map((step, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">
                      <div className="truncate max-w-[150px]" title={step.step_name}>
                        {step.step_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {step.affected_config}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{step.failure_count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {failingSteps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                      No failures recorded in last 30 days
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
