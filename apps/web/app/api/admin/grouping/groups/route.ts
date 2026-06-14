import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Build a normalized preview object for display in the Grouping UI.
 * Image priority: selected_images → consolidated.media → image_candidates → sources.
 */
function buildProductPreview(product: Record<string, unknown>): {
    name: string | null;
    image_url: string | null;
    image_source: 'selected_images' | 'consolidated_media' | 'image_candidates' | 'sources' | null;
    image_count: number;
    brand: string | null;
    variant_summary: string | null;
    source_brand: string | null;
    source_category: string | null;
    source_family: string | null;
    source_product_name: string | null;
    packaging_text: string | null;
    classification_rationale: string | null;
    classification_raw_label: string | null;
} {
    const input = product.input as Record<string, unknown> | null;
    const consolidated = product.consolidated as Record<string, unknown> | null;
    const name = (input?.name as string) || ((consolidated?.core as Record<string, unknown>)?.name as string) || null;
    const brand = (input?.brand as string) || ((consolidated?.core as Record<string, unknown>)?.brand_name as string) || null;

    // Variant summary: size/weight/flavor
    const parts: string[] = [];
    const core = consolidated?.core as Record<string, unknown> | null;
    if (core?.weight_lbs) parts.push(`${core.weight_lbs} lb`);
    const sources = product.sources as Record<string, unknown> | null;
    if (sources && typeof sources === 'object') {
        for (const srcData of Object.values(sources)) {
            if (!srcData || typeof srcData !== 'object') continue;
            const s = srcData as Record<string, unknown>;
            if (s.flavor && typeof s.flavor === 'string') { parts.push(s.flavor); break; }
        }
    }
    const variantSummary = parts.length > 0 ? parts.join(' · ') : null;

    // Images
    let imageUrl: string | null = null;
    let imageSource: string | null = null;
    let totalImageCount = 0;

    const selectedImages = product.selected_images;
    if (Array.isArray(selectedImages)) {
        for (const item of selectedImages) {
            const url = typeof item === 'string' ? item : (item as Record<string, unknown>)?.url;
            if (url && typeof url === 'string' && url.startsWith('http')) {
                if (!imageUrl) imageUrl = url;
                totalImageCount++;
            }
        }
        if (imageUrl) imageSource = 'selected_images';
    }

    if (!imageUrl) {
        const media = consolidated?.media as Array<{url: string}> | null;
        if (Array.isArray(media)) {
            for (const m of media) {
                if (m.url && m.url.startsWith('http')) {
                    if (!imageUrl) imageUrl = m.url;
                    totalImageCount++;
                }
            }
            if (imageUrl) imageSource = 'consolidated_media';
        }
    }

    if (!imageUrl) {
        const candidates = product.image_candidates as string[] | null;
        if (Array.isArray(candidates)) {
            for (const url of candidates) {
                if (typeof url === 'string' && url.startsWith('http')) {
                    if (!imageUrl) imageUrl = url;
                    totalImageCount++;
                }
            }
            if (imageUrl) imageSource = 'image_candidates';
        }
    }

    if (!imageUrl && sources && typeof sources === 'object') {
        for (const srcData of Object.values(sources)) {
            if (!srcData || typeof srcData !== 'object') continue;
            const s = srcData as Record<string, unknown>;
            const imgs = (s.images ?? s.image_urls ?? s.image_url ?? s.image) as unknown[] | undefined;
            if (Array.isArray(imgs)) {
                for (const img of imgs) {
                    const url = typeof img === 'string' ? img : (img as Record<string, unknown>)?.url;
                    if (url && typeof url === 'string' && url.startsWith('http')) {
                        if (!imageUrl) imageUrl = url;
                        totalImageCount++;
                    }
                }
            }
        }
        if (imageUrl) imageSource = 'sources';
    }

    // Source evidence for classification verification
    let sourceBrand: string | null = null;
    let sourceCategory: string | null = null;
    let sourceFamily: string | null = null;
    let sourceProductName: string | null = null;
    let packagingText: string | null = null;
    
    const TRUSTED = ['shopsite_input', 'bradley', 'central-pet', 'central_pet', 'orgill', 'doitbest', 'do_it_best', 'manufacturer', 'catalog', 'distributor', 'official_brand', 'official-brand'];
    
    if (sources && typeof sources === 'object') {
        for (const [sourceName, srcData] of Object.entries(sources)) {
            if (!srcData || typeof srcData !== 'object') continue;
            const s = srcData as Record<string, unknown>;
            const isTrusted = TRUSTED.some(t => sourceName.toLowerCase().includes(t));
            
            if (!sourceBrand && typeof s.brand === 'string' && s.brand.trim()) sourceBrand = s.brand.trim().replace(/^brand\s*:\s*/i, '');
            if (!sourceCategory && typeof s.category === 'string' && s.category.trim()) sourceCategory = s.category.trim();
            if (!sourceProductName && (typeof s.title === 'string' || typeof s.name === 'string')) sourceProductName = ((s.title || s.name) as string).trim();
            if (!sourceFamily && typeof s.product_family === 'string' && s.product_family.trim()) sourceFamily = s.product_family.trim();
            if (!sourceFamily && typeof s.product_line === 'string' && s.product_line.trim()) sourceFamily = s.product_line.trim();
            
            // Packaging OCR evidence
            if (isTrusted && !packagingText && typeof s.image_text === 'string' && s.image_text.trim()) {
                packagingText = s.image_text.trim().substring(0, 300);
            }
        }
    }

    return {
        name,
        image_url: imageUrl,
        image_source: imageSource as any,
        image_count: totalImageCount,
        brand,
        variant_summary: variantSummary,
        source_brand: sourceBrand,
        source_category: sourceCategory,
        source_family: sourceFamily,
        source_product_name: sourceProductName,
        packaging_text: packagingText,
        classification_rationale: (product.product_line_rationale as string) || null,
        classification_raw_label: (product.product_line_raw_label as string) || null,
    };
}

/**
 * GET /api/admin/grouping/groups
 * List Product Groups and Ungrouped products in the grouping stage.
 *
 * Returns:
 *   - groups: Array of { product_line_id, product_line_name, products[], review_required_count }
 *   - ungrouped: Array of products without a product_line_id
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    try {
        // Get grouped products (have a product_line_id) in grouping stage
        const { data: groupedProducts, error: groupedError } = await supabase
            .from('products_ingestion')
            .select(`
                upc,
                pipeline_status,
                product_line_id,
                product_line_confidence,
                product_line_assignment_source,
                product_line_raw_label,
                product_line_rationale,
                product_line_review_required,
                input,
                sources,
                consolidated,
                selected_images,
                image_candidates,
                product_lines:product_line_id (
                    id,
                    canonical_name
                )
            `)
            .eq('pipeline_status', 'grouping')
            .not('product_line_id', 'is', null)
            .order('upc');

        // Get ungrouped products (no product_line_id) in grouping stage.
        // Include review fields so we can derive accepted vs needs-review without extra queries.
        const { data: ungroupedProducts, error: ungroupedError } = await supabase
            .from('products_ingestion')
            .select(`
                upc,
                pipeline_status,
                product_line_confidence,
                product_line_raw_label,
                product_line_rationale,
                product_line_review_required,
                product_line_assignment_source,
                input,
                sources,
                selected_images,
                image_candidates
            `)
            .eq('pipeline_status', 'grouping')
            .is('product_line_id', null)
            .order('upc');

        if (groupedError || ungroupedError) {
            return NextResponse.json(
                { error: groupedError?.message || ungroupedError?.message || 'Failed to fetch groups' },
                { status: 500 }
            );
        }

        // Organize grouped products into Product Groups with derived readiness state.
        // A group is Ready when ALL its products have:
        //   product_line_review_required === false
        //   product_line_assignment_source IS NOT NULL
        const groupMap = new Map<string, {
            product_line_id: string;
            product_line_name: string;
            products: any[];
            review_required_count: number;
            /** Whether this group is Ready (all products have been reviewed and assigned). */
            ready: boolean;
            /** UPCs within this group that still need review. */
            review_required_products: string[];
        }>();

        for (const product of (groupedProducts || [])) {
            const plId = product.product_line_id as string | null;
            if (!plId) continue;

            const plData = (product as any).product_lines as { id: string; canonical_name: string } | null;

            if (!groupMap.has(plId)) {
                groupMap.set(plId, {
                    product_line_id: plId,
                    product_line_name: plData?.canonical_name || 'Unknown Product Line',
                    products: [],
                    review_required_count: 0,
                    ready: true,
                    review_required_products: [],
                });
            }

            const group = groupMap.get(plId)!;
            const cleanProduct = { ...product, preview: buildProductPreview(product as Record<string, unknown>) };
            delete (cleanProduct as any).product_lines;
            group.products.push(cleanProduct);

            const needsReview = product.product_line_review_required === true
                || product.product_line_assignment_source === null
                || product.product_line_assignment_source === undefined;

            if (needsReview) {
                group.review_required_count++;
                group.ready = false;
                group.review_required_products.push(product.upc as string);
            }
        }

        // Compute readiness counts
        let readyGroupCount = 0;
        let needsReviewGroupCount = 0;
        for (const group of groupMap.values()) {
            if (group.ready) readyGroupCount++;
            else needsReviewGroupCount++;
        }

        // Ungrouped products — derive accepted vs needs-review.
        // Accepted: review_required=false AND assignment_source is set.
        const acceptedSingletons: any[] = [];
        const needsReviewUngrouped: any[] = [];
        for (const up of (ungroupedProducts || [])) {
            const accepted = up.product_line_review_required === false
                && up.product_line_assignment_source !== null
                && up.product_line_assignment_source !== undefined;

            const preview = buildProductPreview(up as Record<string, unknown>);
            if (accepted) {
                acceptedSingletons.push({ ...up, accepted: true, preview });
            } else {
                needsReviewUngrouped.push({ ...up, accepted: false, preview });
            }
        }

        return NextResponse.json({
            groups: Array.from(groupMap.values()).map(g => ({
                ...g,
                ready: g.ready,
                review_required_products: g.review_required_products,
            })),
            ungrouped: [
                ...acceptedSingletons,
                ...needsReviewUngrouped,
            ],
            ready_group_count: readyGroupCount,
            needs_review_group_count: needsReviewGroupCount,
            accepted_singleton_count: acceptedSingletons.length,
            needs_review_singleton_count: needsReviewUngrouped.length,
            total_grouped: (groupedProducts || []).length,
            total_ungrouped: (ungroupedProducts || []).length,
        });
    } catch (error) {
        console.error('[Grouping API] List groups error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list groups' },
            { status: 500 }
        );
    }
}
