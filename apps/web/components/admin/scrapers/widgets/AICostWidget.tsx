'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, DollarSign, TrendingUp, Activity } from 'lucide-react';

interface AICostData {
  summary: {
    total_cost: number;
    total_runs: number;
    avg_cost_per_run: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  daily: Array<{
    date: string;
    run_type: string;
    llm_model: string;
    run_count: number;
    total_cost: number;
  }>;
  byModel: Record<string, { runs: number; cost: number }>;
}

export function AICostWidget() {
  const [data, setData] = useState<AICostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCosts() {
      try {
        const response = await fetch('/api/admin/scrapers/ai-costs?days=30');
        if (!response.ok) throw new Error('Failed to fetch');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchCosts();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Scraper Costs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Scraper Costs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-500">Failed to load cost data</div>
        </CardContent>
      </Card>
    );
  }

  const { summary } = data;
  const hasData = summary.total_runs > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-600 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            AI Scraper Costs
          </span>
          <Badge variant="outline" className="text-xs">30 days</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasData ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <DollarSign className="h-3 w-3" />
                  Total Cost
                </div>
                <div className="text-2xl font-bold">
                  ${summary.total_cost.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <Activity className="h-3 w-3" />
                  Total Runs
                </div>
                <div className="text-2xl font-bold">
                  {summary.total_runs}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <TrendingUp className="h-3 w-3" />
                Avg Cost per Run
              </div>
              <div className="text-lg font-semibold">
                ${summary.avg_cost_per_run.toFixed(4)}
              </div>
            </div>

            {Object.keys(data.byModel).length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-gray-600 mb-2">By Model</div>
                <div className="space-y-1">
                  {Object.entries(data.byModel).map(([model, stats]) => (
                    <div key={model} className="flex justify-between text-xs">
                      <span className="text-gray-600">{model}</span>
                      <span className="font-medium">
                        {stats.runs} runs · ${stats.cost.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-gray-500 text-center py-4">
            No AI scraper runs in the last 30 days
          </div>
        )}
      </CardContent>
    </Card>
  );
}
