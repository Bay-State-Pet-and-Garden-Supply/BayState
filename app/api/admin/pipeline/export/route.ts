import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { PipelineStatus } from '@/lib/pipeline';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') || 'staging') as PipelineStatus;
    const search = searchParams.get('search') || '';

    const supabase = await createClient();

    // Prepare the base query
    let queryBuilder = supabase
        .from('products_ingestion')
        .select('sku, input, consolidated, pipeline_status, confidence_score, updated_at')
        .eq('pipeline_status', status)
        .order('updated_at', { ascending: false });

    if (search) {
        queryBuilder = queryBuilder.or(`sku.ilike.%${search}%,input->>name.ilike.%${search}%`);
    }

    const encoder = new TextEncoder();
    
    const customReadable = new ReadableStream({
        async start(controller) {
            // CSV Header
            controller.enqueue(encoder.encode('sku,name,price,status,confidence_score,updated_at\n'));
            
            const pageSize = 500;
            let page = 0;
            let hasMore = true;

            try {
                while (hasMore) {
                    // We need to clone the query builder or re-construct it because .range() mutates or returns a promise-like
                    // Actually in supabase-js v2, we chain .range() at the end.
                    // But we can't reuse the same builder instance easily if it's mutated.
                    // So we'll reconstruct the chain for each page or use the existing one if it supports re-execution with different range.
                    // Safest is to rebuild the query part that is constant.
                    
                    let pageQuery = supabase
                        .from('products_ingestion')
                        .select('sku, input, consolidated, pipeline_status, confidence_score, updated_at')
                        .eq('pipeline_status', status)
                        .order('updated_at', { ascending: false });

                    if (search) {
                        pageQuery = pageQuery.or(`sku.ilike.%${search}%,input->>name.ilike.%${search}%`);
                    }

                    const { data, error } = await pageQuery.range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) {
                        console.error('Export error:', error);
                        controller.error(error);
                        break;
                    }

                    if (!data || data.length === 0) {
                        hasMore = false;
                        break;
                    }

                    for (const item of data) {
                        // Extract data with fallbacks
                        const name = (item.consolidated?.name || item.input?.name || '').replace(/"/g, '""');
                        const price = item.consolidated?.price ?? item.input?.price ?? 0;
                        const conf = item.confidence_score ?? '';
                        
                        // CSV Row
                        const row = `"${item.sku}","${name}",${price},${item.pipeline_status},${conf},${item.updated_at}\n`;
                        controller.enqueue(encoder.encode(row));
                    }

                    if (data.length < pageSize) {
                        hasMore = false;
                    }
                    page++;
                }
                controller.close();
            } catch (e) {
                console.error('Export stream error:', e);
                controller.error(e);
            }
        }
    });

    return new NextResponse(customReadable, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="pipeline-export-${status}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
    });
}
