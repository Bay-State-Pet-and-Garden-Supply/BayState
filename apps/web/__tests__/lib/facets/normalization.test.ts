/**
 * @jest-environment node
 */
import {
    buildFacetSlug,
    normalizeCategoryOptions,
    normalizeCategoryValue,
    normalizeProductTypeOptions,
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

    it('title-cases values after commas when normalizing categories', () => {
        expect(normalizeCategoryValue(' dog leashes, collars & harnesses '))
            .toBe('Dog Leashes, Collars & Harnesses');
    });

    it('splits pipe-delimited facet values into trimmed tokens', () => {
        expect(splitMultiValueFacet('Treats| Toys | '))
            .toEqual(['Treats', 'Toys']);
    });

    it('builds clean slugs for normalized facets', () => {
        expect(buildFacetSlug('Lawn & Garden')).toBe('lawn-garden');
    });

    it('normalizes and dedupes category option records', () => {
        const names = normalizeCategoryOptions([
            { id: '1', name: ' lawn & garden ' },
            { id: '2', name: 'Lawn & Garden' },
            { id: '3', name: 'bird supplies' },
        ]).map((item) => item.name);

        expect(names).toEqual(['Bird Supplies', 'Lawn & Garden']);
    });

    it('normalizes and dedupes product type option records', () => {
        const names = normalizeProductTypeOptions([
            { id: '1', name: ' Apparrel ' },
            { id: '2', name: 'Apparel' },
            { id: '3', name: 'gloves' },
        ]).map((item) => item.name);

        expect(names).toEqual(['Apparel', 'Gloves']);
    });
});
