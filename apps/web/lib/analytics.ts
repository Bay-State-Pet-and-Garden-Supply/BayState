import { createClient } from '@/lib/supabase/server';
import type { PipelineStatus } from './pipeline';

/**
 * Status breakdown with counts.
 */
export interface StatusBreakdown {
    status: PipelineStatus;
    count: number;
    percentage: number;
}

/**
 * Pipeline throughput metrics.
 */
export interface ThroughputMetric {
    date: string;
    published: number;
    approved: number;
    consolidated: number;
}

/**
 * Data completeness metrics.
 */
export interface CompletenessMetric {
    field: string;
    completedCount: number;
    totalCount: number;
    percentage: number;
}

/**
 * Gets the breakdown of products by status.
 */
export async function getStatusBreakdown(): Promise<StatusBreakdown[]> {
    const supabase = await createClient();

    const statuses: PipelineStatus[] = ['staging', 'scraped', 'consolidated', 'approved', 'published'];
    const counts: { status: PipelineStatus; count: number }[] = [];
    let total = 0;

    for (const status of statuses) {
        const { count, error } = await supabase
            .from('products_ingestion')
            .select('*', { count: 'exact', head: true })
            .eq('pipeline_status', status);

        if (error) {
            console.error(`Error counting ${status}:`, error);
            counts.push({ status, count: 0 });
        } else {
            counts.push({ status, count: count || 0 });
            total += count || 0;
        }
    }

    return counts.map((c) => ({
        ...c,
        percentage: total > 0 ? Math.round((c.count / total) * 100) : 0,
    }));
}

/**
 * Gets the pipeline throughput for the last N days.
 */
export async function getPipelineThroughput(days = 7): Promise<ThroughputMetric[]> {
    const supabase = await createClient();

    // Get products updated in the last N days grouped by date and status
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('pipeline_status, updated_at')
        .gte('updated_at', startDate.toISOString())
        .in('pipeline_status', ['consolidated', 'approved', 'published']);

    if (error) {
        console.error('Error fetching throughput:', error);
        return [];
    }

    // Group by date
    const byDate: Record<string, ThroughputMetric> = {};

    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        byDate[dateStr] = { date: dateStr, published: 0, approved: 0, consolidated: 0 };
    }

    (data || []).forEach((row) => {
        const dateStr = new Date(row.updated_at).toISOString().split('T')[0];
        if (byDate[dateStr]) {
            const status = row.pipeline_status as 'consolidated' | 'approved' | 'published';
            byDate[dateStr][status]++;
        }
    });

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Gets data completeness metrics across all products.
 */
export async function getDataCompleteness(): Promise<CompletenessMetric[]> {
    const supabase = await createClient();

    const { data, error, count } = await supabase
        .from('products_ingestion')
        .select('consolidated, input', { count: 'exact' });

    if (error) {
        console.error('Error fetching completeness:', error);
        return [];
    }

    const total = count || 0;
    const products = data || [];

    const fields: { field: string; check: (p: { consolidated: Record<string, unknown>; input: Record<string, unknown> }) => boolean }[] = [
        {
            field: 'Name (Clean)',
            check: (p) => {
                const name = (p.consolidated?.name || p.input?.name) as string | undefined;
                return !!name && name !== name.toUpperCase();
            }
        },
        { field: 'Price', check: (p) => (p.consolidated?.price ?? p.input?.price ?? 0) as number > 0 },
        { field: 'Description', check: (p) => !!(p.consolidated?.description) },
        { field: 'Images', check: (p) => Array.isArray(p.consolidated?.images) && (p.consolidated?.images as unknown[]).length > 0 },
        { field: 'Brand', check: (p) => !!(p.consolidated?.brand_id) },
    ];

    return fields.map(({ field, check }) => {
        const completed = products.filter((p) => check(p as { consolidated: Record<string, unknown>; input: Record<string, unknown> })).length;
        return {
            field,
            completedCount: completed,
            totalCount: total,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
    });
}
