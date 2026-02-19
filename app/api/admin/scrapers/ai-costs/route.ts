import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);
  
  const supabase = await createClient();
  
  // Calculate date range
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  try {
    // Get cost stats using the function
    const { data: stats, error: statsError } = await supabase
      .rpc('get_ai_cost_stats', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
    
    if (statsError) throw statsError;
    
    // Get daily breakdown
    const { data: daily, error: dailyError } = await supabase
      .from('ai_cost_summary_daily')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });
    
    if (dailyError) throw dailyError;
    
    // Get model breakdown
    const { data: byModel, error: modelError } = await supabase
      .from('ai_cost_summary_daily')
      .select('llm_model, run_count, total_cost')
      .gte('date', startDate)
      .lte('date', endDate);
    
    if (modelError) throw modelError;
    
    // Aggregate by model
    const modelAggregation = byModel?.reduce((acc, row) => {
      if (!acc[row.llm_model]) {
        acc[row.llm_model] = { runs: 0, cost: 0 };
      }
      acc[row.llm_model].runs += row.run_count;
      acc[row.llm_model].cost += parseFloat(row.total_cost);
      return acc;
    }, {} as Record<string, { runs: number; cost: number }>) || {};
    
    return NextResponse.json({
      summary: stats?.[0] || {
        total_cost: 0,
        total_runs: 0,
        avg_cost_per_run: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      },
      daily: daily || [],
      byModel: modelAggregation,
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
