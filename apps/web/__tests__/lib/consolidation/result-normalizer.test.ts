import { normalizeConsolidationResult } from '@/lib/consolidation/result-normalizer';

describe('normalizeConsolidationResult', () => {
    it('normalizes brand prefixes and deduplicates search keywords', () => {
        const result = normalizeConsolidationResult({
            brand: 'Brand: Bubbacare',
            search_keywords: 'horse treats, horse treats; flax seed\nhorse snacks',
        });

        expect(result).toEqual(
            expect.objectContaining({
                brand: 'Bubbacare',
                search_keywords: 'Bubbacare, Horse Treats, Flax Seed, Horse Snacks',
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

    it('correctly normalizes all-caps names to Title Case while preserving SPOT brand and units', () => {
        const result = normalizeConsolidationResult({
            brand: 'SPOT',
            name: 'SPOT CAPYBARA WITH ORANGE 8 in.',
        });
        expect(result.name).toBe('SPOT Capybara With Orange 8 in.');
    });
});
