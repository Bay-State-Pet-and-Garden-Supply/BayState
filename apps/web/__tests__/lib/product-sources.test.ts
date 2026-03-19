import {
    filterMeaningfulProductSources,
    hasMeaningfulProductSourceData,
    normalizeProductSources,
} from '@/lib/product-sources';

describe('hasMeaningfulProductSourceData', () => {
    it('returns false for ai_search payloads that only contain diagnostics/errors', () => {
        const result = hasMeaningfulProductSourceData({
            ai_search: {
                error: 'BRAVE_API_KEY not set',
                cost_usd: 0,
                scraped_at: '2026-03-11T23:24:53.854779',
            },
            _last_scraped: '2026-03-12T03:24:58.367Z',
        });

        expect(result).toBe(false);
    });

    it('returns true when ai_search contains real product fields', () => {
        const result = hasMeaningfulProductSourceData({
            ai_search: {
                error: 'fallback warning',
                title: 'GAS CAN 2 GAL',
                price: 21.99,
            },
        });

        expect(result).toBe(true);
    });

    it('still returns true for non-AI meaningful source data', () => {
        const result = hasMeaningfulProductSourceData({
            amazon: {
                name: 'Product Name',
                in_stock: true,
            },
        });

        expect(result).toBe(true);
    });
});

describe('filterMeaningfulProductSources', () => {
    it('drops diagnostic-only ai_search sources while preserving valid non-AI sources', () => {
        const result = filterMeaningfulProductSources({
            amazon: {
                name: 'Valid Product',
            },
            ai_search: {
                error: 'BRAVE_API_KEY not set',
                cost_usd: 0,
                scraped_at: '2026-03-11T23:24:53.854779',
            },
        });

        expect(result).toEqual({
            amazon: {
                title: 'Valid Product',
            },
        });
    });
});

describe('normalizeProductSources', () => {
    it('rewrites legacy scraper field aliases to canonical source keys', () => {
        const result = normalizeProductSources({
            bradley: {
                Name: 'Vita Prima Sunscription Finch Formula',
                'Image URLs': ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
                ProductType: 'Bird Food',
                'BCI Item Number': '073353',
                'Mfg#': 'MAZ123',
                UoM: 'EA',
            },
        });

        expect(result).toEqual({
            bradley: {
                title: 'Vita Prima Sunscription Finch Formula',
                images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
                product_type: 'Bird Food',
                item_number: '073353',
                manufacturer_part_number: 'MAZ123',
                unit_of_measure: 'EA',
            },
        });
    });

    it('normalizes top-level legacy fields into the _legacy source payload', () => {
        const result = normalizeProductSources({
            Name: 'Legacy Product',
            'Image URLs': ['https://cdn.example.com/legacy.jpg'],
            scraped_at: '2026-03-19T00:00:00.000Z',
            _last_scraped: '2026-03-19T00:00:00.000Z',
        });

        expect(result).toEqual({
            _legacy: {
                title: 'Legacy Product',
                images: ['https://cdn.example.com/legacy.jpg'],
                scraped_at: '2026-03-19T00:00:00.000Z',
            },
        });
    });
});
