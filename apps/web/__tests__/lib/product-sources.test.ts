import { filterMeaningfulProductSources, hasMeaningfulProductSourceData } from '@/lib/product-sources';

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
                name: 'Valid Product',
            },
        });
    });
});
