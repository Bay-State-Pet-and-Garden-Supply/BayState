import { normalizeConsolidationResult } from '@/lib/consolidation/result-normalizer';

describe('normalizeConsolidationResult', () => {
    it('preserves live ShopSite pages when they are in the allowed page catalog', () => {
        const result = normalizeConsolidationResult(
            {
                name: 'Dog Food Dry Example 7.9 lb',
                product_on_pages: ['Dog Food Dry', 'Not A Real Page', 'Dog Food Shop All'],
            },
            ['Dog Food Dry', 'Dog Food Shop All']
        );

        expect(result).toEqual(
            expect.objectContaining({
                name: 'Dog Food Dry Example 7.9 lb.',
                product_on_pages: ['Dog Food Dry', 'Dog Food Shop All'],
            })
        );
    });

    it('normalizes brand prefixes and deduplicates search keywords', () => {
        const result = normalizeConsolidationResult({
            brand: 'Brand: Bubbacare',
            search_keywords: 'horse treats, horse treats; flax seed\nhorse snacks',
        });

        expect(result).toEqual(
            expect.objectContaining({
                brand: 'Bubbacare',
                search_keywords: 'horse treats, flax seed, horse snacks',
            })
        );
    });

    it('correctly normalizes units while avoiding partial matches and prepositions', () => {
        const result = normalizeConsolidationResult({
            name: 'Tomato Jubilee Seed packets 5 packs',
            description: 'Made in USA with 10 inches and 5 gallons info',
        });

        // "packets" should be untouched, "packs" should become "pk."
        // "inches" should become "in."
        // "in" in "Made in USA" should be untouched.
        // "gallons" should become "gal."
        // "info" should be untouched.
        expect(result.name).toBe('Tomato Jubilee Seed Packets 5 pk.');
        expect(result.description).toBe('Made in USA with 10 in. and 5 gal. info');
    });
});
