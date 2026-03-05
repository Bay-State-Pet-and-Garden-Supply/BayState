import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('scrape_jobs')
            .select('id, skus, status, runner_name, lease_token, lease_expires_at, heartbeat_at, attempt_count, max_attempts, backoff_until, created_at, completed_at, error_message, metadata')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('[Jobs API] Error:', error);
            return NextResponse.json({ jobs: [] }, { status: 500 });
        }

        const jobs = (data || []).map((job) => {
            const metadata = job.metadata && typeof job.metadata === 'object'
                ? (job.metadata as Record<string, unknown>)
                : {};
            const crawl4ai = metadata.crawl4ai && typeof metadata.crawl4ai === 'object'
                ? (metadata.crawl4ai as Record<string, unknown>)
                : {};

            return {
                ...job,
                crawl4ai: {
                    extraction_strategy: Array.isArray(crawl4ai.extraction_strategy)
                        ? crawl4ai.extraction_strategy
                        : [],
                    cost_breakdown: crawl4ai.cost_breakdown ?? null,
                    anti_bot_metrics: crawl4ai.anti_bot_metrics ?? null,
                    llm_count: typeof crawl4ai.llm_count === 'number' ? crawl4ai.llm_count : 0,
                    llm_free_count: typeof crawl4ai.llm_free_count === 'number' ? crawl4ai.llm_free_count : 0,
                    llm_ratio: typeof crawl4ai.llm_ratio === 'number' ? crawl4ai.llm_ratio : null,
                },
            };
        });

        return NextResponse.json({ jobs });
    } catch (error) {
        console.error('[Jobs API] Error:', error);
        return NextResponse.json({ jobs: [] }, { status: 500 });
    }
}
