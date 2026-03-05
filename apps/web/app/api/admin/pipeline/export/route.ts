import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { PipelineStatus } from '@/lib/pipeline';
import * as ExcelJS from 'exceljs';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') || 'staging') as PipelineStatus;
    const search = searchParams.get('search') || '';
    const format = searchParams.get('format') || 'csv';

    const supabase = await createClient();

    if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Products');

        worksheet.columns = [
            { header: 'SKU', key: 'sku', width: 20 },
            { header: 'Name', key: 'name', width: 40 },
            { header: 'Description', key: 'description', width: 60 },
            { header: 'Price', key: 'price', width: 12 },
            { header: 'Brand', key: 'brand', width: 20 },
            { header: 'Stock Status', key: 'stock_status', width: 15 },
            { header: 'Images', key: 'images', width: 50 },
            { header: 'Sources', key: 'sources', width: 40 },
            { header: 'Confidence Score', key: 'confidence_score', width: 18 },
            { header: 'Pipeline Status', key: 'pipeline_status', width: 18 },
            { header: 'Created At', key: 'created_at', width: 20 },
            { header: 'Updated At', key: 'updated_at', width: 20 },
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        const pageSize = 500;
        let page = 0;
        let hasMore = true;

        while (hasMore) {
            let pageQuery = supabase
                .from('products_ingestion')
                .select('sku, input, consolidated, pipeline_status, confidence_score, created_at, updated_at')
                .eq('pipeline_status', status)
                .order('updated_at', { ascending: false });

            if (search) {
                pageQuery = pageQuery.or(`sku.ilike.%${search}%,input->>name.ilike.%${search}%`);
            }

            const { data, error } = await pageQuery.range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                console.error('Export error:', error);
                return NextResponse.json({ error: 'Export failed' }, { status: 500 });
            }

            if (!data || data.length === 0) {
                hasMore = false;
                break;
            }

            for (const item of data) {
                const consolidated = item.consolidated || {};
                const input = item.input || {};

                const sources = consolidated.sources
                    ? Object.keys(consolidated.sources).join(', ')
                    : '';

                const images = Array.isArray(consolidated.images)
                    ? consolidated.images.join(', ')
                    : '';

                worksheet.addRow({
                    sku: item.sku,
                    name: consolidated.name || input.name || '',
                    description: consolidated.description || '',
                    price: consolidated.price ?? input.price ?? 0,
                    brand: consolidated.brand || '',
                    stock_status: consolidated.stock_status || '',
                    images: images,
                    sources: sources,
                    confidence_score: item.confidence_score ?? '',
                    pipeline_status: item.pipeline_status,
                    created_at: item.created_at,
                    updated_at: item.updated_at,
                });
            }

            if (data.length < pageSize) {
                hasMore = false;
            }
            page++;
        }

        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="pipeline-export-${status}-${new Date().toISOString().split('T')[0]}.xlsx"`,
            },
        });
    }

    const encoder = new TextEncoder();

    const customReadable = new ReadableStream({
        async start(controller) {
            controller.enqueue(encoder.encode('sku,name,price,status,confidence_score,updated_at\n'));

            const pageSize = 500;
            let page = 0;
            let hasMore = true;

            try {
                while (hasMore) {
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
                        const name = (item.consolidated?.name || item.input?.name || '').replace(/"/g, '""');
                        const price = item.consolidated?.price ?? item.input?.price ?? 0;
                        const conf = item.confidence_score ?? '';

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
