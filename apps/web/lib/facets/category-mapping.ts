export const SHOPSITE_CATEGORY_MAPPING: Record<string, Record<string, string>> = {
    'Barn Supplies': {
        'Buckets & Feeders': 'farm-animal-chicken-coop-supplies',
        '*': 'farm-animal',
    },
    'Dog Food': {
        'Dry': 'dog-food-dry-food',
        'Wet': 'dog-food-wet-food',
        '*': 'dog-food',
    },
    'Cat Food': {
        'Dry': 'cat-food-dry-food',
        'Wet': 'cat-food-wet-food',
        '*': 'cat-food',
    },
};

export function getMappedCategorySlug(
    categoryName: string | null | undefined,
    productTypeName: string | null | undefined
): string | null {
    if (!categoryName) return null;

    const categoryMap = SHOPSITE_CATEGORY_MAPPING[categoryName];
    if (!categoryMap) return null;

    if (productTypeName && categoryMap[productTypeName]) {
        return categoryMap[productTypeName];
    }

    return categoryMap['*'] || null;
}
