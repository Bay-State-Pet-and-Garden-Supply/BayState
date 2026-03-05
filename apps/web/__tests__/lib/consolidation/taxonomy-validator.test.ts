import { validateConsolidationTaxonomy } from '@/lib/consolidation/taxonomy-validator';

describe('validateConsolidationTaxonomy', () => {
    it('deduplicates category and product_type arrays', () => {
        const result = validateConsolidationTaxonomy(
            {
                category: ['Dog', 'Dog', 'Cat'],
                product_type: ['Dry Dog Food', 'Dry Dog Food'],
            },
            ['Dog', 'Cat'],
            ['Dry Dog Food', 'Dog Treats']
        );

        expect(result.category).toBe('Dog|Cat');
        expect(result.product_type).toBe('Dry Dog Food');
    });

    it('throws when category is missing after validation', () => {
        expect(() =>
            validateConsolidationTaxonomy(
                {
                    product_type: ['Dry Dog Food'],
                },
                ['Dog'],
                ['Dry Dog Food']
            )
        ).toThrow('category is required');
    });

    it('throws when product_type is missing after validation', () => {
        expect(() =>
            validateConsolidationTaxonomy(
                {
                    category: ['Dog'],
                },
                ['Dog'],
                ['Dry Dog Food']
            )
        ).toThrow('product_type is required');
    });
});
