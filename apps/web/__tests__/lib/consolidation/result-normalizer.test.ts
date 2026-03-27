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
});
