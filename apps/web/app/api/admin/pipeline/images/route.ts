import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    try {
        const supabase = await createClient();

        let query = supabase
            .from('products_ingestion')
            .select('sku, image_candidates, consolidated, pipeline_status');

        if (status === 'needs-images') {
            // Has candidates but no selected images yet
            query = query
                .not('image_candidates', 'is', null)
                .not('image_candidates', 'eq', '{}')
                .or('selected_images.is.null,selected_images.eq.[]')
                .in('pipeline_status', ['finalized', 'consolidated', 'approved']);
        }

        const { data, error } = await query.limit(50);

        if (error) {
            console.error('Error fetching image candidates:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ products: data });
    } catch (error) {
        console.error('Error in images GET route:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const { sku, selectedImages } = await request.json();

        if (!sku || !Array.isArray(selectedImages)) {
            return NextResponse.json(
                { error: 'SKU and selectedImages array are required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Format selected_images as array of objects {url, selectedAt}
        const formattedImages = selectedImages.map((url: string) => ({
            url,
            selectedAt: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('products_ingestion')
            .update({ 
                selected_images: formattedImages,
                updated_at: new Date().toISOString()
            })
            .eq('sku', sku);

        if (error) {
            console.error('Error updating selected images:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Add to audit log
        try {
            await supabase.from('pipeline_audit_log').insert([{
                job_type: 'image_selection',
                job_id: crypto.randomUUID(),
                actor_type: 'system',
                metadata: {
                    sku,
                    image_count: selectedImages.length,
                    timestamp: new Date().toISOString()
                }
            }]);
        } catch (auditErr) {
            console.error('Failed to log to audit_log:', auditErr);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in images POST route:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
