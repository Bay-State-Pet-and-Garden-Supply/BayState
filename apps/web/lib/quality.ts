import { createClient } from '@/lib/supabase/server';
import type { PipelineProduct } from './pipeline';

/**
 * Quality issue types.
 */
export interface QualityIssue {
    field: string;
    severity: 'required' | 'recommended';
    message: string;
}

/**
 * Product with quality issues.
 */
export interface ProductWithIssues {
    product: PipelineProduct;
    issues: QualityIssue[];
    completeness: number; // 0-100
}

/**
 * Quality rules for product validation.
 */
const qualityRules: Array<{
    field: string;
    severity: 'required' | 'recommended';
    check: (product: PipelineProduct) => boolean;
    message: string;
}> = [
        {
            field: 'name',
            severity: 'required',
            check: (p) => {
                const name = p.consolidated?.name || p.input?.name;
                // Fail if no name or if it's still ALL CAPS (register format)
                return !name || name === name.toUpperCase();
            },
            message: 'Product needs a clean, customer-friendly name',
        },
        {
            field: 'price',
            severity: 'required',
            check: (p) => {
                const price = p.consolidated?.price ?? p.input?.price;
                return price === undefined || price <= 0;
            },
            message: 'Price must be greater than zero',
        },
        {
            field: 'description',
            severity: 'recommended',
            check: (p) => !p.consolidated?.description,
            message: 'Add a product description for better SEO',
        },
        {
            field: 'images',
            severity: 'recommended',
            check: (p) => !p.consolidated?.images || p.consolidated.images.length === 0,
            message: 'Add at least one product image',
        },
        {
            field: 'brand_id',
            severity: 'recommended',
            check: (p) => !p.consolidated?.brand_id,
            message: 'Assign a brand to this product',
        },
    ];

/**
 * Calculates completeness percentage for a product.
 */
function calculateCompleteness(product: PipelineProduct): number {
    const fields = ['name', 'price', 'description', 'images', 'brand_id'];
    let completed = 0;

    const name = product.consolidated?.name || product.input?.name;
    if (name && name !== name.toUpperCase()) completed++;

    const price = product.consolidated?.price ?? product.input?.price;
    if (price && price > 0) completed++;

    if (product.consolidated?.description) completed++;
    if (product.consolidated?.images && product.consolidated.images.length > 0) completed++;
    if (product.consolidated?.brand_id) completed++;

    return Math.round((completed / fields.length) * 100);
}

/**
 * Validates a product and returns its issues.
 */
export function validateProduct(product: PipelineProduct): QualityIssue[] {
    return qualityRules
        .filter((rule) => rule.check(product))
        .map((rule) => ({
            field: rule.field,
            severity: rule.severity,
            message: rule.message,
        }));
}

/**
 * Fetches products with quality issues.
 */
export async function getProductsWithIssues(options?: {
    limit?: number;
    offset?: number;
    severityFilter?: 'required' | 'recommended' | 'all';
}): Promise<{ products: ProductWithIssues[]; count: number }> {
    const supabase = await createClient();

    // Get products in consolidated or approved status (need quality review)
    const { data, error, count } = await supabase
        .from('products_ingestion')
        .select('*', { count: 'exact' })
        .in('pipeline_status', ['staging', 'scraped', 'consolidated', 'approved'])
        .order('updated_at', { ascending: false })
        .limit(options?.limit || 50)
        .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1);

    if (error) {
        console.error('Error fetching products for quality review:', error);
        return { products: [], count: 0 };
    }

    const products = (data as PipelineProduct[]) || [];
    const productsWithIssues: ProductWithIssues[] = products
        .map((product) => {
            const issues = validateProduct(product);
            const completeness = calculateCompleteness(product);
            return { product, issues, completeness };
        })
        .filter((p) => {
            if (options?.severityFilter === 'required') {
                return p.issues.some((i) => i.severity === 'required');
            }
            if (options?.severityFilter === 'recommended') {
                return p.issues.some((i) => i.severity === 'recommended');
            }
            return p.issues.length > 0;
        });

    return { products: productsWithIssues, count: count || 0 };
}

/**
 * Updates a specific field in the consolidated data.
 */
export async function updateConsolidatedField(
    sku: string,
    field: string,
    value: unknown
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // First get the current consolidated data
    const { data: current, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('consolidated')
        .eq('sku', sku)
        .single();

    if (fetchError) {
        return { success: false, error: fetchError.message };
    }

    const consolidated = { ...(current?.consolidated || {}), [field]: value };

    const { error: updateError } = await supabase
        .from('products_ingestion')
        .update({ consolidated, updated_at: new Date().toISOString() })
        .eq('sku', sku);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    return { success: true };
}
