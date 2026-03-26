import { createClient } from '@/lib/supabase/server';
import {
    buildProductImageStorageFolder,
    replaceInlineImageDataUrls,
} from '@/lib/product-image-storage';

/**
 * Publishes a product from the ingestion pipeline to the storefront catalog.
 * Copies consolidated data to the main 'products' table.
 * 
 * @param sku The SKU of the product to publish
 * @returns Object with success status and details
 */
export async function publishToStorefront(sku: string) {
    const supabase = await createClient();

    try {
        // Fetch the product from ingestion table
        const { data: ingestionProduct, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, input, consolidated, pipeline_status')
            .eq('sku', sku)
            .single();

        if (fetchError || !ingestionProduct) {
            return { success: false, error: 'Product not found in pipeline' };
        }

        // Allow publishing from finalized or approved (legacy)
        const publishableStatuses = new Set(['finalized', 'approved', 'consolidated']);
        if (!publishableStatuses.has(ingestionProduct.pipeline_status)) {
            return { 
                success: false, 
                error: `Product must be in a reviewable status to publish. Current status: ${ingestionProduct.pipeline_status}` 
            };
        }

        const consolidated = ingestionProduct.consolidated || {};
        const input = ingestionProduct.input || {};

        const name = consolidated.name || input.name || '';
        if (!name) {
            return { success: false, error: 'Product has no name to publish' };
        }

        // Generate slug from name + SKU to ensure uniqueness
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') +
            '-' +
            sku.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Prepare images array
        let images: string[] = [];
        if (Array.isArray(consolidated.images)) {
            const sourceImages = (consolidated.images as unknown[])
                .filter((img): img is string => typeof img === 'string' && img.trim() !== '');
            images = await replaceInlineImageDataUrls(supabase, sourceImages, {
                folderPath: buildProductImageStorageFolder('pipeline-published', sku),
                onError: (message, error) => {
                    console.error(`[Publish] ${message}`, error);
                },
            });

            if (images.some((image, index) => image !== sourceImages[index])) {
                const { error: persistenceError } = await supabase
                    .from('products_ingestion')
                    .update({
                        consolidated: {
                            ...(consolidated as Record<string, unknown>),
                            images,
                        },
                        updated_at: new Date().toISOString(),
                    })
                    .eq('sku', sku);

                if (persistenceError) {
                    console.error(`[Publish] Failed to persist durable pipeline images for ${sku}:`, persistenceError);
                }
            }
        }

        // Resolve product_on_pages to shopsite_pages jsonb
        let shopsitePages: string[] | null = null;
        if (Array.isArray(consolidated.product_on_pages)) {
            shopsitePages = consolidated.product_on_pages as string[];
        } else if (typeof consolidated.product_on_pages === 'string' && consolidated.product_on_pages) {
            shopsitePages = (consolidated.product_on_pages as string).split('|').map((p: string) => p.trim()).filter(Boolean);
        }

        // Prepare product data for 'products' table
        const productData = {
            name,
            slug,
            description: consolidated.description || '',
            long_description: consolidated.long_description || null,
            price: consolidated.price ?? input.price ?? 0,
            brand_id: consolidated.brand_id || null,
            stock_status: consolidated.stock_status || 'in_stock',
            images: images,
            is_featured: consolidated.is_featured || false,
            is_special_order: consolidated.is_special_order || false,
            is_taxable: consolidated.is_taxable !== false,
            weight: consolidated.weight || null,
            product_type: consolidated.product_type || null,
            search_keywords: consolidated.search_keywords || null,
            shopsite_pages: shopsitePages,
            published_at: new Date().toISOString(),
            quantity: 0,
            low_stock_threshold: 5,
        };

        // Check if product already exists in products table by slug
        const { data: existingProduct } = await supabase
            .from('products')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

        if (existingProduct) {
            // Update existing product
            const { error: updateError } = await supabase
                .from('products')
                .update(productData)
                .eq('id', existingProduct.id);

            if (updateError) {
                console.error(`[Publish] Error updating product ${sku}:`, updateError);
                return { success: false, error: 'Failed to update product in storefront' };
            }

            return { success: true, action: 'updated', productId: existingProduct.id };
        } else {
            // Insert new product
            const { data: insertedProduct, error: insertError } = await supabase
                .from('products')
                .insert(productData)
                .select('id')
                .single();

            if (insertError) {
                console.error(`[Publish] Error inserting product ${sku}:`, insertError);
                return { success: false, error: 'Failed to create product in storefront' };
            }

            return { success: true, action: 'created', productId: insertedProduct?.id };
        }
    } catch (err) {
        console.error(`[Publish] Unexpected error for ${sku}:`, err);
        return { success: false, error: 'An unexpected error occurred during publishing' };
    }
}
