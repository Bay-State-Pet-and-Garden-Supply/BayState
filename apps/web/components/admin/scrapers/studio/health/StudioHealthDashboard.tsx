'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAggregatedHealthStats, ScraperHealthMetric } from '@/lib/admin/scraper-health/metrics';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area
} from 'recharts';
import { Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface HealthStats {
  date: string;
  total_runs: number;
  passed_runs: number;
  failed_runs: number;
  avg_duration_ms: number;
  pass_rate: number;
}

export default function StudioHealthDashboard() {
  const [stats, setStats] = useState<HealthStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    avgPassRate: 0,
    totalFailures: 0,
    avgDuration: 0,
    trend: 'stable'
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getAggregatedHealthStats(30);
        setStats(data);
        
        if (data.length > 0) {
          const totalRuns = data.reduce((sum, d) => sum + d.total_runs, 0);
          const totalPassed = data.reduce((sum, d) => sum + d.passed_runs, 0);
          const totalFailed = data.reduce((sum, d) => sum + d.failed_runs, 0);
          const totalDuration = data.reduce((sum, d) => sum + (d.avg_duration_ms * d.total_runs), 0);
          
          setSummary({
            avgPassRate: totalRuns > 0 ? Math.round((totalPassed / totalRuns) * 100) : 0,
            totalFailures: totalFailed,
            avgDuration: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
            trend: data.length > 1 && data[data.length - 1].pass_rate > data[0].pass_rate ? 'improving' : 'declining'
          });
        }
      } catch (error) {
        console.error('Failed to load health stats:', error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Pass Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.avgPassRate}%</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Failures</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalFailures}</div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(summary.avgDuration / 1000).toFixed(2)}s</div>
            <p className="text-xs text-muted-foreground">
              Per run average
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Pass/Fail Rate Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  fontSize={12}
                />
                <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" domain={[0, 100]} />
                <Tooltip 
                  labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="passed_runs" name="Passed" stackId="a" fill="#4ade80" />
                <Bar yAxisId="left" dataKey="failed_runs" name="Failed" stackId="a" fill="#f87171" />
                <Line yAxisId="right" type="monotone" dataKey="pass_rate" name="Pass Rate %" stroke="#008850" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Execution Duration Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  fontSize={12}
                />
                <YAxis tickFormatter={(val) => `${(val / 1000).toFixed(1)}s`} />
                <Tooltip 
                  labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  formatter={(val: number | undefined) => [`${val ? (val / 1000).toFixed(2) : '0'}s`, 'Avg Duration']}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                />
                <Area type="monotone" dataKey="avg_duration_ms" stroke="#0ea5e9" fill="#e0f2fe" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { AreaChart } from 'recharts';
