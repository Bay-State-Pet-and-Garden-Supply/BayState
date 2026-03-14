import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'finalized';
    const format = searchParams.get('format') || 'xlsx';
    const search = searchParams.get('search');

    try {
        const supabase = await createClient();

        let query = supabase
            .from('products_ingestion')
            .select('*')
            .eq('pipeline_status', status);

        if (search) {
            query = query.or(`sku.ilike.%${search}%,input->>name.ilike.%${search}%`);
        }

        // Limit to 1000 for reasonable memory usage
        const { data, error } = await query.limit(1000);

        if (error) {
            console.error('Error fetching data for export:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ error: 'No data found to export' }, { status: 404 });
        }

        // Flatten data
        const flattenedData = data.map((item) => ({
            SKU: item.sku,
            Name: item.consolidated?.name || item.input?.name || '',
            Description: item.consolidated?.description || '',
            Price: item.consolidated?.price || item.input?.price || '',
            Brand: item.consolidated?.brand_id || '',
            StockStatus: item.consolidated?.stock_status || '',
            PipelineStatus: item.pipeline_status,
            CreatedAt: item.created_at,
            UpdatedAt: item.updated_at,
        }));

        if (format === 'csv') {
            const headers = Object.keys(flattenedData[0]);
            const csvContent = [
                headers.join(','),
                ...flattenedData.map(row => 
                    headers.map(header => {
                        const val = row[header as keyof typeof row] || '';
                        return `"${String(val).replace(/"/g, '""')}"`;
                    }).join(',')
                )
            ].join('\n');

            return new NextResponse(csvContent, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="export-${status}.csv"`,
                },
            });
        } else {
            // XLSX format
            const worksheet = XLSX.utils.json_to_sheet(flattenedData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
            
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            return new NextResponse(buffer, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="export-${status}.xlsx"`,
                },
            });
        }
    } catch (error) {
        console.error('Error in export GET route:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
