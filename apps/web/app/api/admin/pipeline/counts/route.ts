import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_STATUS_VALUES, type StatusCount } from '@/lib/pipeline/types';

export async function GET() {
    const supabase = await createClient();

    // Single query to fetch all pipeline_status values
    const { data, error } = await supabase
        .from('products_ingestion')
        .select('pipeline_status');

    if (error) {
        console.error('Error fetching status counts:', error);
        // Return all 5 stages with 0 count on error
        const counts: StatusCount[] = PIPELINE_STATUS_VALUES.map(status => ({
            status,
            count: 0,
        }));
        return NextResponse.json({ counts });
    }

    // Aggregate counts in memory (single DB round-trip)
    const countMap: Record<string, number> = {};
    PIPELINE_STATUS_VALUES.forEach(status => {
        countMap[status] = 0;
    });

    (data || []).forEach((row: { pipeline_status: string | null }) => {
        if (row.pipeline_status && countMap[row.pipeline_status] !== undefined) {
            countMap[row.pipeline_status]++;
        }
    });

    // Return all 5 stages in consistent order
    const counts: StatusCount[] = PIPELINE_STATUS_VALUES.map(status => ({
        status,
        count: countMap[status] || 0,
    }));

    return NextResponse.json({ counts });
}
