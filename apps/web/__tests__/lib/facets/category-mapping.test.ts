import { getMappedCategorySlug } from '@/lib/facets/category-mapping';

describe('Category Mapping', () => {
    it('maps an exact category and product type match', () => {
        expect(getMappedCategorySlug('Barn Supplies', 'Buckets & Feeders')).toBe('farm-animal-chicken-coop-supplies');
    });

    it('falls back to the category level if product type is missing or unmapped', () => {
        expect(getMappedCategorySlug('Barn Supplies', 'Unknown Type')).toBe('farm-animal');
        expect(getMappedCategorySlug('Barn Supplies', null)).toBe('farm-animal');
    });

    it('returns null for completely unmapped categories', () => {
        expect(getMappedCategorySlug('Unknown Category', 'Some Type')).toBeNull();
    });
});
