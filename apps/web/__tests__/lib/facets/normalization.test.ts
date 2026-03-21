/**
 * @jest-environment node
 */
import {
    buildFacetSlug,
    normalizeCategoryValue,
    normalizeProductTypeValue,
    splitMultiValueFacet,
} from '@/lib/facets/normalization';

describe('facet normalization', () => {
    it('normalizes product type casing, typos, and duplicate pipe-delimited values', () => {
        expect(normalizeProductTypeValue(' food | Apparrel | gloves | Gloves | Vitsamins & Supplements '))
            .toBe('Food|Apparel|Gloves|Vitamins & Supplements');
    });

    it('normalizes category casing while preserving multiple values', () => {
        expect(normalizeCategoryValue(' lawn & garden | bird supplies '))
            .toBe('Lawn & Garden|Bird Supplies');
    });

    it('splits pipe-delimited facet values into trimmed tokens', () => {
        expect(splitMultiValueFacet('Treats| Toys | '))
            .toEqual(['Treats', 'Toys']);
    });

    it('builds clean slugs for normalized facets', () => {
        expect(buildFacetSlug('Lawn & Garden')).toBe('lawn-garden');
    });
});
