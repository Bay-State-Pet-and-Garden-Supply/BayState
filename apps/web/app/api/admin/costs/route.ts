import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface ServiceCostRecord {
  id: string;
  service: string;
  display_name: string;
  monthly_cost: string | number;
  billing_cycle: string;
  category: string;
  notes: string | null;
  is_active: boolean;
}

interface BatchJobRecord {
  id: string;
  status: string;
  provider: string;
  estimated_cost: string | number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
  completed_at: string | null;
  description: string | null;
}

interface ScrapeJobRecord {
  id: string;
  type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  scrapers: string[] | null;
  metadata: Record<string, unknown> | null;
}

interface FeatureUsageSummary {
  totalCost: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface RecentUsageRecord {
  id: string;
  feature: 'AI Search' | 'Crawl4AI' | 'Consolidation';
  provider: string;
  status: string;
  estimated_cost: number;
  total_tokens: number;
  created_at: string;
  completed_at: string | null;
  description: string | null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function summarizeBatchJobs(jobs: BatchJobRecord[]): FeatureUsageSummary {
  return jobs.reduce<FeatureUsageSummary>(
    (acc, job) => {
      acc.totalCost += toNumber(job.estimated_cost);
      acc.totalJobs += 1;
      acc.promptTokens = (acc.promptTokens ?? 0) + (job.prompt_tokens ?? 0);
      acc.completionTokens = (acc.completionTokens ?? 0) + (job.completion_tokens ?? 0);
      acc.totalTokens = (acc.totalTokens ?? 0) + (job.total_tokens ?? 0);

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
}

function summarizeScrapeJobs(
  jobs: ScrapeJobRecord[],
  feature: 'ai_search' | 'crawl4ai'
): FeatureUsageSummary {
  return jobs.reduce<FeatureUsageSummary>(
    (acc, job) => {
      const metadata = asRecord(job.metadata);
      const featureMetadata = asRecord(metadata?.[feature]);
      const crawl4aiMetadata = asRecord(metadata?.crawl4ai);
      const costBreakdown = asRecord(crawl4aiMetadata?.cost_breakdown);
      const nestedCosts = asRecord(costBreakdown?.costs);
      const totalCost = feature === 'ai_search'
        ? toNumber(featureMetadata?.total_cost ?? metadata?.total_cost)
        : toNumber(
            metadata?.total_cost
              ?? nestedCosts?.total_cost_usd
              ?? costBreakdown?.total_cost_usd
          );

      acc.totalCost += totalCost;
      acc.totalJobs += 1;
      if (job.status === 'completed') acc.completedJobs += 1;
      if (job.status === 'failed') acc.failedJobs += 1;
      return acc;
    },
    {
      totalCost: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
    }
  );
}

function isAISearchJob(job: ScrapeJobRecord): boolean {
  return job.type === 'ai_search' || (job.scrapers ?? []).includes('ai_search');
}

function isCrawl4AiJob(job: ScrapeJobRecord): boolean {
  if (job.type === 'crawl4ai') {
    return true;
  }

  return (job.scrapers ?? []).includes('crawl4ai_discovery') || (job.scrapers ?? []).includes('crawl4ai');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);

  const supabase = await createClient();

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    const [servicesResult, batchJobsResult, scrapeJobsResult] = await Promise.all([
      supabase
        .from('service_costs')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true }),
      supabase
        .from('batch_jobs')
        .select(
          'id, status, provider, estimated_cost, prompt_tokens, completion_tokens, total_tokens, created_at, completed_at, description'
        )
        .gte('created_at', `${startDate}T00:00:00Z`)
        .lte('created_at', `${endDate}T23:59:59Z`)
        .order('created_at', { ascending: false }),
      supabase
        .from('scrape_jobs')
        .select('id, type, status, created_at, completed_at, scrapers, metadata')
        .gte('created_at', `${startDate}T00:00:00Z`)
        .lte('created_at', `${endDate}T23:59:59Z`)
        .order('created_at', { ascending: false }),
    ]);

    if (servicesResult.error) throw servicesResult.error;
    if (batchJobsResult.error) throw batchJobsResult.error;
    if (scrapeJobsResult.error) throw scrapeJobsResult.error;

    const activeServices = (servicesResult.data ?? []) as ServiceCostRecord[];
    const batchJobs = (batchJobsResult.data ?? []) as BatchJobRecord[];
    const scrapeJobs = ((scrapeJobsResult.data ?? []) as Array<Omit<ScrapeJobRecord, 'metadata'> & { metadata: unknown }>).map(
      (job) => ({
        ...job,
        metadata: asRecord(job.metadata),
      })
    );

    const aiSearchJobs = scrapeJobs.filter(isAISearchJob);
    const crawl4aiJobs = scrapeJobs.filter(isCrawl4AiJob);

    const consolidation = summarizeBatchJobs(batchJobs);
    const aiSearch = summarizeScrapeJobs(aiSearchJobs, 'ai_search');
    const crawl4ai = summarizeScrapeJobs(crawl4aiJobs, 'crawl4ai');

    const fixedMonthlyTotal = activeServices.reduce(
      (sum, svc) => sum + toNumber(svc.monthly_cost),
      0
    );

    const servicesByCategory = activeServices.reduce(
      (acc, svc) => {
        const category = svc.category as string;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(svc);
        return acc;
      },
      {} as Record<string, ServiceCostRecord[]>
    );

    const recentUsage: RecentUsageRecord[] = [
      ...batchJobs.map((job) => ({
        id: job.id,
        feature: 'Consolidation' as const,
        provider: job.provider || 'openai',
        status: job.status,
        estimated_cost: toNumber(job.estimated_cost),
        total_tokens: job.total_tokens ?? 0,
        created_at: job.created_at,
        completed_at: job.completed_at,
        description: job.description,
      })),
      ...aiSearchJobs.map((job) => {
        const metadata = asRecord(job.metadata);
        const aiSearchMetadata = asRecord(metadata?.ai_search);
        return {
          id: job.id,
          feature: 'AI Search' as const,
          provider: String(aiSearchMetadata?.llm_provider ?? 'openai'),
          status: job.status,
          estimated_cost: toNumber(aiSearchMetadata?.total_cost ?? metadata?.total_cost),
          total_tokens: 0,
          created_at: job.created_at,
          completed_at: job.completed_at,
          description: 'AI Search scrape job',
        };
      }),
      ...crawl4aiJobs.map((job) => {
        const metadata = asRecord(job.metadata);
        const crawl4aiMetadata = asRecord(metadata?.crawl4ai);
        const costBreakdown = asRecord(crawl4aiMetadata?.cost_breakdown);
        const nestedCosts = asRecord(costBreakdown?.costs);
        return {
          id: job.id,
          feature: 'Crawl4AI' as const,
          provider: 'openai',
          status: job.status,
          estimated_cost: toNumber(
            metadata?.total_cost
              ?? nestedCosts?.total_cost_usd
              ?? costBreakdown?.total_cost_usd
          ),
          total_tokens: 0,
          created_at: job.created_at,
          completed_at: job.completed_at,
          description: 'Crawl4AI scrape job',
        };
      }),
    ]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 12);

    const totalUsageCost = aiSearch.totalCost + crawl4ai.totalCost + consolidation.totalCost;

    return NextResponse.json({
      dateRange: { start: startDate, end: endDate, days },
      fixedMonthlyTotal,
      services: activeServices,
      servicesByCategory,
      usage: {
        aiSearch,
        crawl4ai,
        consolidation,
        combined: {
          totalCost: totalUsageCost,
          totalJobs: aiSearch.totalJobs + crawl4ai.totalJobs + consolidation.totalJobs,
        },
      },
      recentUsage,
      estimatedMonthlyTotal: fixedMonthlyTotal + totalUsageCost,
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
    if (monthly_cost !== undefined) updates.monthly_cost = parseFloat(monthly_cost);
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
