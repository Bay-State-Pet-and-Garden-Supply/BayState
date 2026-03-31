import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);

  const supabase = await createClient();

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    // Fetch fixed service costs
    const { data: services, error: servicesError } = await supabase
      .from('service_costs')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true });

    if (servicesError) throw servicesError;

    // Fetch OpenAI batch consolidation costs from batch_jobs
    const { data: batchJobs, error: batchError } = await supabase
      .from('batch_jobs')
      .select(
        'id, status, estimated_cost, prompt_tokens, completion_tokens, total_tokens, created_at, completed_at, description'
      )
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .order('created_at', { ascending: false });

    if (batchError) throw batchError;

    // Aggregate batch job costs
    const batchSummary = (batchJobs ?? []).reduce(
      (acc, job) => {
        acc.totalCost += parseFloat(String(job.estimated_cost ?? 0));
        acc.totalJobs += 1;
        acc.promptTokens += job.prompt_tokens ?? 0;
        acc.completionTokens += job.completion_tokens ?? 0;
        acc.totalTokens += job.total_tokens ?? 0;
        if (job.status === 'completed') acc.completedJobs += 1;
        if (job.status === 'failed') acc.failedJobs += 1;
        return acc;
      },
      {
        totalCost: 0,
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }
    );

    // Calculate fixed monthly total
    const fixedMonthlyTotal = (services ?? []).reduce(
      (sum, svc) => sum + parseFloat(String(svc.monthly_cost ?? 0)),
      0
    );

    // Group services by category
    const servicesByCategory = (services ?? []).reduce(
      (acc, svc) => {
        const cat = svc.category as string;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(svc);
        return acc;
      },
      {} as Record<string, typeof services>
    );

    return NextResponse.json({
      dateRange: { start: startDate, end: endDate, days },
      fixedMonthlyTotal,
      services: services ?? [],
      servicesByCategory,
      ai: {
        consolidation: batchSummary,
        recentJobs: (batchJobs ?? []).slice(0, 10),
      },
      estimatedMonthlyTotal: fixedMonthlyTotal + batchSummary.totalCost,
    });
  } catch (error) {
    console.error('Cost Tracking API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cost data' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { id, monthly_cost, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Service ID is required' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (monthly_cost !== undefined)
      updates.monthly_cost = parseFloat(monthly_cost);
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabase
      .from('service_costs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ service: data });
  } catch (error) {
    console.error('Cost Update API Error:', error);
    return NextResponse.json(
      { error: 'Failed to update service cost' },
      { status: 500 }
    );
  }
}
