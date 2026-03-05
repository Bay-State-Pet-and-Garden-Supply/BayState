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
    // Get crawl4ai metrics from scrape_jobs
    // Note: This assumes the new columns exist. If not, we'll use metadata JSONB
    const { data: jobs, error: jobsError } = await supabase
      .from('scrape_jobs')
      .select(`
        id,
        status,
        created_at,
        completed_at,
        extraction_strategy,
        llm_cost,
        total_cost,
        anti_bot_success_rate,
        crawl4ai_errors,
        metadata
      `)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    
    if (jobsError) throw jobsError;
    
    // Calculate extraction strategy ratio
    const strategyCounts = {
      llm: 0,
      css: 0,
      xpath: 0,
      unknown: 0
    };
    
    let totalLlmCost = 0;
    let totalCost = 0;
    let totalAntiBotRate = 0;
    let antiBotCount = 0;
    
    // Aggregate error types
    const errorAggregation: Record<string, number> = {};
    
    for (const job of jobs || []) {
      // Extraction strategy
      const strategy = job.extraction_strategy || job.metadata?.extraction_strategy || 'unknown';
      if (strategy in strategyCounts) {
        strategyCounts[strategy as keyof typeof strategyCounts]++;
      } else {
        strategyCounts.unknown++;
      }
      
      // Cost tracking
      const llmCost = job.llm_cost ?? job.metadata?.llm_cost ?? 0;
      const totalJobCost = job.total_cost ?? job.metadata?.total_cost ?? 0;
      
      totalLlmCost += llmCost;
      totalCost += totalJobCost;
      
      // Anti-bot success rate
      const antiBotRate = job.anti_bot_success_rate ?? job.metadata?.anti_bot_success_rate;
      if (antiBotRate !== undefined && antiBotRate !== null) {
        totalAntiBotRate += antiBotRate;
        antiBotCount++;
      }
      
      // Error aggregation
      const errors = job.crawl4ai_errors || job.metadata?.crawl4ai_errors || [];
      for (const err of errors) {
        const key = err.error_type || 'unknown';
        errorAggregation[key] = (errorAggregation[key] || 0) + (err.count || 1);
      }
    }
    
    const totalJobs = jobs?.length || 0;
    const avgAntiBotRate = antiBotCount > 0 ? totalAntiBotRate / antiBotCount : 0;
    
    // Get daily breakdown
    const dailyMetrics: Record<string, {
      date: string;
      llm: number;
      css: number;
      xpath: number;
      total_cost: number;
      llm_cost: number;
      anti_bot_rate: number;
      job_count: number;
    }> = {};
    
    for (const job of jobs || []) {
      const date = job.created_at.split('T')[0];
      if (!dailyMetrics[date]) {
        dailyMetrics[date] = {
          date,
          llm: 0,
          css: 0,
          xpath: 0,
          total_cost: 0,
          llm_cost: 0,
          anti_bot_rate: 0,
          job_count: 0
        };
      }
      
      const strategy = job.extraction_strategy || job.metadata?.extraction_strategy || 'unknown';
      if (strategy === 'llm') dailyMetrics[date].llm++;
      else if (strategy === 'css') dailyMetrics[date].css++;
      else if (strategy === 'xpath') dailyMetrics[date].xpath++;
      
      dailyMetrics[date].total_cost += job.total_cost ?? job.metadata?.total_cost ?? 0;
      dailyMetrics[date].llm_cost += job.llm_cost ?? job.metadata?.llm_cost ?? 0;
      dailyMetrics[date].job_count++;
      
      const antiBotRate = job.anti_bot_success_rate ?? job.metadata?.anti_bot_success_rate;
      if (antiBotRate !== undefined && antiBotRate !== null) {
        dailyMetrics[date].anti_bot_rate += antiBotRate;
      }
    }
    
    // Calculate daily averages
    const dailyBreakdown = Object.values(dailyMetrics).map(day => ({
      ...day,
      anti_bot_rate: day.job_count > 0 ? day.anti_bot_rate / day.job_count : 0
    })).sort((a, b) => b.date.localeCompare(a.date));
    
    return NextResponse.json({
      summary: {
        total_jobs: totalJobs,
        extraction_ratio: {
          llm: strategyCounts.llm,
          css: strategyCounts.css,
          xpath: strategyCounts.xpath,
          unknown: strategyCounts.unknown,
          llm_percentage: totalJobs > 0 ? (strategyCounts.llm / totalJobs) * 100 : 0,
          css_percentage: totalJobs > 0 ? (strategyCounts.css / totalJobs) * 100 : 0,
          xpath_percentage: totalJobs > 0 ? (strategyCounts.xpath / totalJobs) * 100 : 0,
        },
        costs: {
          total_llm_cost: totalLlmCost,
          total_cost: totalCost,
          avg_cost_per_job: totalJobs > 0 ? totalCost / totalJobs : 0,
          avg_llm_cost_per_job: totalJobs > 0 ? totalLlmCost / totalJobs : 0,
        },
        anti_bot: {
          avg_success_rate: avgAntiBotRate,
          jobs_with_metrics: antiBotCount,
        },
        errors: errorAggregation,
      },
      daily: dailyBreakdown,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    console.error('Crawl4AI Metrics API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch crawl4ai metrics' },
      { status: 500 }
    );
  }
}
