import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFacetSlug, splitMultiValueFacet } from '@/lib/facets/normalization';

function uniqueCategoryNames(categoryValue: string | null | undefined): string[] {
    return Array.from(
        new Set(
            splitMultiValueFacet(categoryValue).map((value) => value.trim()).filter(Boolean)
        )
    );
}

export async function syncProductCategoryLinks(
    supabase: SupabaseClient,
    productId: string,
    categoryValue: string | null | undefined
) {
    const categoryNames = uniqueCategoryNames(categoryValue);

    if (categoryNames.length === 0) {
        const { error } = await supabase
            .from('product_categories')
            .delete()
            .eq('product_id', productId);

        if (error) {
            throw new Error(`Failed to clear product categories: ${error.message}`);
        }

        return;
    }

    const categoryIds: string[] = [];

    for (const categoryName of categoryNames) {
        const slug = buildFacetSlug(categoryName);

        const { data: category, error } = await supabase
            .from('categories')
            .upsert(
                {
                    name: categoryName,
                    slug,
                    display_order: 0,
                },
                { onConflict: 'slug' }
            )
            .select('id')
            .single();

        if (error || !category) {
            throw new Error(
                `Failed to resolve category "${categoryName}": ${error?.message ?? 'Missing category row'}`
            );
        }

        categoryIds.push(category.id);
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
            categoryIds.map((categoryId) => ({
                product_id: productId,
                category_id: categoryId,
            })),
            { onConflict: 'product_id, category_id' }
        );

    if (linkError) {
        throw new Error(`Failed to link product categories: ${linkError.message}`);
    }
}
