import type { SupabaseClient } from '@supabase/supabase-js';
import {
    parseTaxonomyValues,
    resolveTaxonomySelections,
    type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';

async function fetchTaxonomyCategories(
    supabase: SupabaseClient
): Promise<TaxonomyCategoryRecord[]> {
    const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, description, display_order, image_url, is_featured');

    if (error) {
        throw new Error(`Failed to fetch taxonomy categories: ${error.message}`);
    }

    return (data || []) as TaxonomyCategoryRecord[];
}

export async function syncProductCategoryLinks(
    supabase: SupabaseClient,
    productId: string,
    categoryValue: string | null | undefined
) {
    const categoryTokens = parseTaxonomyValues(categoryValue);

    if (categoryTokens.length === 0) {
        const { error } = await supabase
            .from('product_categories')
            .delete()
            .eq('product_id', productId);

        if (error) {
            throw new Error(`Failed to clear product categories: ${error.message}`);
        }

        return;
    }

    const taxonomyCategories = await fetchTaxonomyCategories(supabase);
    const { matched, unresolved } = resolveTaxonomySelections(categoryTokens, taxonomyCategories);

    if (matched.length === 0) {
        throw new Error(
            `Failed to resolve any categories from taxonomy values: ${categoryTokens.join(', ')}`
        );
    }

    if (unresolved.length > 0) {
        throw new Error(
            `Unresolved taxonomy categories: ${unresolved.join(', ')}`
        );
    }

    const { error: deleteError } = await supabase
        .from('product_categories')
        .delete()
        .eq('product_id', productId);

    if (deleteError) {
        throw new Error(`Failed to replace product categories: ${deleteError.message}`);
    }

    const { error: linkError } = await supabase
        .from('product_categories')
        .upsert(
            matched.map((category) => ({
                product_id: productId,
                category_id: category.id,
            })),
            { onConflict: 'product_id, category_id' }
        );

    if (linkError) {
        throw new Error(`Failed to link product categories: ${linkError.message}`);
    }
}

export async function syncProductCategoryIds(
    supabase: SupabaseClient,
    productId: string,
    categoryIds: string[]
) {
    const uniqueCategoryIds = Array.from(
        new Set(categoryIds.map((categoryId) => categoryId.trim()).filter(Boolean))
    );

    const { error: deleteError } = await supabase
        .from('product_categories')
        .delete()
        .eq('product_id', productId);

    if (deleteError) {
        throw new Error(`Failed to replace product categories: ${deleteError.message}`);
    }

    if (uniqueCategoryIds.length === 0) {
        return;
    }

    const { error: linkError } = await supabase
        .from('product_categories')
        .upsert(
            uniqueCategoryIds.map((categoryId) => ({
                product_id: productId,
                category_id: categoryId,
            })),
            { onConflict: 'product_id, category_id' }
        );

    if (linkError) {
        throw new Error(`Failed to link product categories: ${linkError.message}`);
    }
}
