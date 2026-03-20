import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PIPELINE_STATUS_VALUES, type StatusCount } from '@/lib/pipeline/types';
import { requireAdminAuth } from '@/lib/admin/api-auth';

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
        const countMap: Record<string, number> = {};
        PIPELINE_STATUS_VALUES.forEach(status => {
            countMap[status] = 0;
        });

        (data || []).forEach((row: any) => {
            const status = row.pipeline_status;
            if (status && countMap[status] !== undefined) {
                countMap[status]++;
            }
        });

        const counts: StatusCount[] = PIPELINE_STATUS_VALUES.map(status => ({
            status,
            count: countMap[status] || 0,
        }));

        return NextResponse.json({ counts });
    } catch (err) {
        console.error('Exception in status counts route:', err);
        return NextResponse.json({ 
            error: err instanceof Error ? err.message : 'Internal Server Error' 
        }, { status: 500 });
    }
}
