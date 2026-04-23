import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);

  const supabase = await createClient();
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const { data: jobs, error } = await supabase
      .from('scrape_jobs')
      .select('id, status, created_at, completed_at, metadata, scrapers, type')
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .in('type', ['ai_search', 'official_brand'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    const daily: Record<string, { date: string; run_count: number; total_cost: number }> = {};
    const byModel: Record<string, { runs: number; cost: number }> = {};

    let totalCost = 0;
    let totalRuns = 0;

    for (const job of jobs ?? []) {
      const metadata = asRecord(job.metadata);
      // Support both legacy ai_search and new official_brand keys in metadata
      const aiSearch = asRecord(metadata?.official_brand || metadata?.ai_search);
      const model = typeof aiSearch?.llm_model === 'string' ? aiSearch.llm_model : 'unknown';
      const cost = toNumber(aiSearch?.total_cost ?? metadata?.total_cost);
      const date = job.created_at.split('T')[0];

      totalCost += cost;
      totalRuns += 1;

      if (!daily[date]) {
        daily[date] = { date, run_count: 0, total_cost: 0 };
      }
      daily[date].run_count += 1;
      daily[date].total_cost += cost;

      if (!byModel[model]) {
        byModel[model] = { runs: 0, cost: 0 };
      }
      byModel[model].runs += 1;
      byModel[model].cost += cost;
    }

    return NextResponse.json({
      summary: {
        total_cost: totalCost,
        total_runs: totalRuns,
        avg_cost_per_run: totalRuns > 0 ? totalCost / totalRuns : 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
      daily: Object.values(daily).sort((a, b) => b.date.localeCompare(a.date)),
      byModel,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    console.error('AI Cost API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI cost data' },
      { status: 500 }
    );
  }
}
