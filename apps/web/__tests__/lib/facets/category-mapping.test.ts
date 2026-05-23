import { getMappedCategorySlug } from '@/lib/facets/category-mapping';

describe('Category Mapping', () => {
    it('maps an exact category and product type match', () => {
        expect(getMappedCategorySlug('Barn Supplies', 'Buckets & Feeders')).toBe('farm-livestock-feeders-waterers');
    });

    it('falls back to the category level if product type is missing or unmapped', () => {
        expect(getMappedCategorySlug('Barn Supplies', 'Unknown Type')).toBe('farm-livestock');
        expect(getMappedCategorySlug('Barn Supplies', null)).toBe('farm-livestock');
    });

    it('returns null for completely unmapped categories', () => {
        expect(getMappedCategorySlug('Unknown Category', 'Some Type')).toBeNull();
    });
});
