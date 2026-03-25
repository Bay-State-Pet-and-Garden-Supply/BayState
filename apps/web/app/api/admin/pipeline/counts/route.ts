import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  PIPELINE_STATUS_VALUES,
  isPipelineStatus,
  type PipelineStatus,
  type StatusCount,
} from '@/lib/pipeline/types';
import { requireAdminAuth } from '@/lib/admin/api-auth';

type PipelineStatusRow = {
  pipeline_status: string | null;
};

export async function GET() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const supabase = await createClient();

        // Use GROUP BY for efficient counting on the database side
        const { data, error } = await supabase
            .from('products_ingestion')
            .select('pipeline_status');

        if (error) {
            console.error('Error fetching status counts:', error);
            const counts: StatusCount[] = PIPELINE_STATUS_VALUES.map(status => ({
                status,
                count: 0,
            }));
            return NextResponse.json({ counts });
        }

        // Aggregate counts in memory
        const countMap: Record<PipelineStatus, number> = {
            imported: 0,
            monitoring: 0,
            scraped: 0,
            consolidated: 0,
            finalized: 0,
            published: 0,
        };
        const rows = (data ?? []) as PipelineStatusRow[];

        rows.forEach((row) => {
            const status = row.pipeline_status;
            if (status && isPipelineStatus(status)) {
                countMap[status] += 1;
            }
        });

        // Merge consolidated count into finalized for the UI
        countMap.finalized += countMap.consolidated;
        countMap.consolidated = 0;

        const counts: StatusCount[] = PIPELINE_STATUS_VALUES.map(status => ({
            status,
            count: countMap[status],
        }));

        return NextResponse.json({ counts });
    } catch (err) {
        console.error('Exception in status counts route:', err);
        return NextResponse.json({ 
            error: err instanceof Error ? err.message : 'Internal Server Error' 
        }, { status: 500 });
    }
}
