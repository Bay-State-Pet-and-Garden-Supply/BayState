'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { 
  Brain, 
  DollarSign, 
  Shield, 
  AlertTriangle,
  BarChart3,
  PieChart,
  TrendingUp
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPie,
  Pie,
  Legend
} from 'recharts';

interface Crawl4AIMetrics {
  summary: {
    total_jobs: number;
    extraction_ratio: {
      llm: number;
      css: number;
      xpath: number;
      unknown: number;
      llm_percentage: number;
      css_percentage: number;
      xpath_percentage: number;
    };
    costs: {
      total_llm_cost: number;
      total_cost: number;
      avg_cost_per_job: number;
      avg_llm_cost_per_job: number;
    };
    anti_bot: {
      avg_success_rate: number;
      jobs_with_metrics: number;
    };
    errors: Record<string, number>;
  };
  daily: Array<{
    date: string;
    llm: number;
    css: number;
    xpath: number;
    total_cost: number;
    llm_cost: number;
    anti_bot_rate: number;
    job_count: number;
  }>;
  dateRange: {
    start: string;
    end: string;
  };
}

interface Crawl4AIDashboardProps {
  days?: number;
}

export function Crawl4AIDashboard({ days = 30 }: Crawl4AIDashboardProps) {
  const [metrics, setMetrics] = useState<Crawl4AIMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const response = await fetch(`/api/admin/scrapers/crawl4ai-metrics?days=${days}`);
        if (!response.ok) {
          throw new Error('Failed to fetch crawl4ai metrics');
        }
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error('Failed to load crawl4ai metrics:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, [days]);

  if (loading) {
    return (
      <Card className="col-span-full">
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Crawl4AI Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No crawl4ai metrics available. This is expected if no crawl4ai-enabled scrapers have been run yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary, daily } = metrics;
  
  // Prepare pie chart data
  const pieData = [
    { name: 'LLM', value: summary.extraction_ratio.llm, color: '#8b5cf6' },
    { name: 'CSS', value: summary.extraction_ratio.css, color: '#10b981' },
    { name: 'XPath', value: summary.extraction_ratio.xpath, color: '#f59e0b' },
    { name: 'Unknown', value: summary.extraction_ratio.unknown, color: '#6b7280' },
  ].filter(d => d.value > 0);

  // Prepare bar chart data for daily extraction types
  const barChartData = daily.slice(0, 14).reverse().map(day => ({
    date: day.date.slice(5), // MM-DD format
    llm: day.llm,
    css: day.css,
    xpath: day.xpath,
  }));

  // Top errors
  const topErrors = Object.entries(summary.errors)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);

  return (
    <div className="grid gap-4 col-span-full">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            Crawl4AI Metrics (Last {days} days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Jobs */}
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Total Jobs</span>
              <span className="text-2xl font-bold">{summary.total_jobs}</span>
            </div>
            
            {/* LLM Jobs */}
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">LLM Extractions</span>
              <span className="text-2xl font-bold text-purple-600">
                {summary.extraction_ratio.llm}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({summary.extraction_ratio.llm_percentage.toFixed(1)}%)
                </span>
              </span>
            </div>
            
            {/* Total Cost */}
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Total Cost</span>
              <span className="text-2xl font-bold text-green-600">
                ${summary.costs.total_cost.toFixed(4)}
              </span>
            </div>
            
            {/* Anti-Bot Success */}
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Anti-Bot Success</span>
              <span className="text-2xl font-bold text-blue-600">
                {(summary.anti_bot.avg_success_rate * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Extraction Strategy Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Extraction Strategy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No extraction data available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Daily Extraction Trends */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Extraction Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barChartData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="llm" name="LLM" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="css" name="CSS" stackId="a" fill="#10b981" />
                    <Bar dataKey="xpath" name="XPath" stackId="a" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No daily data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Cost Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cost Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total LLM Cost</span>
                <span className="font-medium">${summary.costs.total_llm_cost.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Cost</span>
                <span className="font-medium">${summary.costs.total_cost.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Avg Cost/Job</span>
                <span className="font-medium">${summary.costs.avg_cost_per_job.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Avg LLM Cost/Job</span>
                <span className="font-medium">${summary.costs.avg_llm_cost_per_job.toFixed(4)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Top Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topErrors.length > 0 ? (
              <div className="space-y-2">
                {topErrors.map(([errorType, count]) => (
                  <div key={errorType} className="flex justify-between items-center">
                    <Badge variant="outline" className="text-xs">
                      {errorType}
                    </Badge>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No errors recorded
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Crawl4AIDashboard;
