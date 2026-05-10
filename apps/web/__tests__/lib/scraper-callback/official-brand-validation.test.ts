import {
    filterOfficialBrandResultsForPersistence,
    validateOfficialBrandSourceForPersistence,
} from '@/lib/scraper-callback/official-brand-validation';

describe('validateOfficialBrandSourceForPersistence', () => {
    it('accepts official brand payload with configured domain match', () => {
        const result = validateOfficialBrandSourceForPersistence(
            {
                title: 'Miracle-Gro Potting Mix 2 cu ft',
                brand: 'Miracle-Gro',
                url: 'https://www.scottsmiraclegro.com/en-us/products/miracle-gro/potting-mix',
                source_website: 'https://www.scottsmiraclegro.com/en-us/products/miracle-gro/potting-mix',
                confidence: 0.92,
                images: ['https://example.com/image.jpg'],
            },
            {
                officialDomains: ['scottsmiraclegro.com'],
                preferredDomains: ['homedepot.com'],
            },
        );

        expect(result).toEqual({ accepted: true });
    });

    it('rejects payload when source domain does not match configured domains', () => {
        const result = validateOfficialBrandSourceForPersistence(
            {
                title: 'Miracle-Gro Potting Mix 2 cu ft',
                brand: 'Miracle-Gro',
                url: 'https://www.amazon.com/example',
                source_website: 'https://www.amazon.com/example',
                confidence: 0.95,
                description: 'Product description',
            },
            {
                officialDomains: ['scottsmiraclegro.com'],
            },
        );

        expect(result).toEqual({
            accepted: false,
            reason: 'Official Brand domain did not match configured cohort domains',
        });
    });

    it('rejects payload with low confidence', () => {
        const result = validateOfficialBrandSourceForPersistence({
            title: 'Product name',
            brand: 'Brand',
            url: 'https://example.com/p/123',
            source_website: 'https://example.com/p/123',
            confidence: 0.51,
            description: 'description',
        });

        expect(result).toEqual({
            accepted: false,
            reason: 'Official Brand confidence below threshold',
        });
    });
});

describe('filterOfficialBrandResultsForPersistence', () => {
    it('returns accepted and rejected SKU sets for legacy official_brand source key', () => {
        const result = filterOfficialBrandResultsForPersistence(
            {
                'SKU-VALID': {
                    official_brand: {
                        title: 'Valid Product',
                        brand: 'Miracle-Gro',
                        url: 'https://www.scottsmiraclegro.com/products/abc',
                        source_website: 'https://www.scottsmiraclegro.com/products/abc',
                        confidence: 0.9,
                        images: ['https://cdn.example.com/img.jpg'],
                    },
                },
                'SKU-INVALID': {
                    official_brand: {
                        title: 'Invalid Product',
                        brand: 'Miracle-Gro',
                        url: 'https://www.amazon.com/products/abc',
                        source_website: 'https://www.amazon.com/products/abc',
                        confidence: 0.9,
                        images: ['https://cdn.example.com/img.jpg'],
                    },
                },
            },
            { officialDomains: ['scottsmiraclegro.com'] },
        );

        expect(Object.keys(result.acceptedResults)).toEqual(['SKU-VALID']);
        expect(result.rejectedBySku['SKU-INVALID']).toBe('Official Brand domain did not match configured cohort domains');
        expect(result.acceptedCount).toBe(1);
        expect(result.rejectedCount).toBe(1);
    });

    it('returns accepted and rejected SKU sets for product_url_extraction source key', () => {
        const result = filterOfficialBrandResultsForPersistence(
            {
                'SKU-VALID': {
                    product_url_extraction: {
                        title: 'Valid Product',
                        brand: 'Miracle-Gro',
                        url: 'https://www.scottsmiraclegro.com/products/abc',
                        source_website: 'https://www.scottsmiraclegro.com/products/abc',
                        confidence: 0.9,
                        images: ['https://cdn.example.com/img.jpg'],
                    },
                },
                'SKU-INVALID': {
                    product_url_extraction: {
                        title: 'Invalid Product',
                        brand: 'Miracle-Gro',
                        url: 'https://www.amazon.com/products/abc',
                        source_website: 'https://www.amazon.com/products/abc',
                        confidence: 0.9,
                        images: ['https://cdn.example.com/img.jpg'],
                    },
                },
            },
            { officialDomains: ['scottsmiraclegro.com'] },
        );

        expect(Object.keys(result.acceptedResults)).toEqual(['SKU-VALID']);
        expect(result.rejectedBySku['SKU-INVALID']).toBe('Official Brand domain did not match configured cohort domains');
        expect(result.acceptedCount).toBe(1);
        expect(result.rejectedCount).toBe(1);
    });
});
