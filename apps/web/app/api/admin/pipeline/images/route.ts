import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: Request) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

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

        const { data, error } = await query.order('updated_at', { ascending: false }).limit(50);

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
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const { sku, selectedImages } = await request.json();

        if (!sku || !Array.isArray(selectedImages)) {
            return NextResponse.json(
                { error: 'SKU and selectedImages array are required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // 1. Fetch current product to validate selected images against candidates
        const { data: product, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, image_candidates, consolidated')
            .eq('sku', sku)
            .single();

        if (fetchError || !product) {
            return NextResponse.json(
                { error: 'Product not found' },
                { status: 404 }
            );
        }

        // 2. Validate all selected images exist in candidates
        const candidates = (product.image_candidates as string[]) || [];
        const invalidImages = selectedImages.filter(url => !candidates.includes(url));

        if (invalidImages.length > 0) {
            return NextResponse.json(
                { error: `Invalid image selection. Following URLs are not in candidates: ${invalidImages.join(', ')}` },
                { status: 400 }
            );
        }

        // 3. Format selected_images as array of objects {url, selectedAt}
        const formattedImages = selectedImages.map((url: string) => ({
            url,
            selectedAt: new Date().toISOString()
        }));

        // 4. Update product
        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({ 
                selected_images: formattedImages,
                updated_at: new Date().toISOString()
            })
            .eq('sku', sku);

        if (updateError) {
            console.error('Error updating selected images:', error);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // 5. Add to audit log
        try {
            await supabase.from('pipeline_audit_log').insert([{
                job_type: 'image_selection',
                job_id: crypto.randomUUID(),
                actor_id: auth.user?.id,
                actor_type: 'user',
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
