import {
    buildConsolidationSourcesPayload,
    extractImageCandidatesFromSourcePayload,
    filterMeaningfulProductSources,
    hasMeaningfulProductSourceData,
    normalizeImageUrl,
    normalizeProductSources,
    removeImageFieldsFromSourcePayload,
    mergeProductSources,
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

    it('adds ShopSite input as a consolidation source with product_on_pages', () => {
        const result = buildConsolidationSourcesPayload(
            {
                amazon: {
                    title: 'Source Product Title',
                },
            },
            {
                name: 'Catalog Product Title',
                product_on_pages: ['Dog Food Dry', 'Dog Food Shop All'],
                category: 'Dog Food',
            }
        );

        expect(result).toEqual(
            expect.objectContaining({
                shopsite_input: {
                    name: 'Catalog Product Title',
                    product_on_pages: ['Dog Food Dry', 'Dog Food Shop All'],
                    category: 'Dog Food',
                },
            })
        );
    });



    it('dedupes Amazon image variants by underlying image path while preserving the first host', () => {
        const result = normalizeProductSources({
            amazon: {
                images: [
                    'https://m.media-amazon.com/images/I/71hero._AC_SL1500_.jpg',
                    'https://images-na.ssl-images-amazon.com/images/I/71hero._AC_US100_.jpg',
                    'https://m.media-amazon.com/images/I/81alt._SX38_SY50_CR,0,0,38,50_.jpg',
                ],
            },
        });

        expect(result).toEqual({
            amazon: {
                images: [
                    'https://m.media-amazon.com/images/I/71hero.jpg',
                    'https://m.media-amazon.com/images/I/81alt.jpg',
                ],
            },
        });
    });
});

describe('image source helpers', () => {
    it('normalizes Amazon image URLs across multiple Amazon hosts', () => {
        expect(
            normalizeImageUrl('https://images-na.ssl-images-amazon.com/images/I/71hero._AC_US100_.jpg')
        ).toBe('https://images-na.ssl-images-amazon.com/images/I/71hero.jpg');
    });

    it('extracts image candidates from a single normalized source payload', () => {
        const result = extractImageCandidatesFromSourcePayload({
            title: 'Protected Product',
            images: ['https://private.example.com/hero.jpg', 'https://private.example.com/hero.jpg'],
            gallery: [
                {
                    thumbnail: 'https://private.example.com/thumb.png',
                },
            ],
            documents: ['https://private.example.com/spec-sheet.pdf'],
            scraped_at: '2026-03-22T00:00:00.000Z',
        });

        expect(result).toEqual([
            'https://private.example.com/hero.jpg',
            'https://private.example.com/thumb.png',
        ]);
    });

    it('removes image-like fields while preserving non-image data and scrape metadata', () => {
        const result = removeImageFieldsFromSourcePayload({
            title: 'Protected Product',
            price: '12.99',
            images: ['https://private.example.com/hero.jpg'],
            gallery: [{ thumbnail: 'https://private.example.com/thumb.png' }],
            attributes: {
                hero_image: 'https://private.example.com/detail.jpg',
                size: '40 lb.',
            },
            scraped_at: '2026-03-22T00:00:00.000Z',
        });

        expect(result).toEqual({
            title: 'Protected Product',
            price: '12.99',
            attributes: {
                size: '40 lb.',
            },
            scraped_at: '2026-03-22T00:00:00.000Z',
        });
    });

    it('resolves BigCommerce {:size} placeholder to 3840w', () => {
        expect(
            normalizeImageUrl(
                'https://cdn11.bigcommerce.com/s-rncilydun5/images/stencil/{:size}/products/16199/19476/436322__58796.jpg'
            )
        ).toBe(
            'https://cdn11.bigcommerce.com/s-rncilydun5/images/stencil/3840w/products/16199/19476/436322__58796.jpg'
        );
    });

    it('passes through BigCommerce URLs that already have a resolved size', () => {
        const resolved =
            'https://cdn11.bigcommerce.com/s-rncilydun5/images/stencil/3840w/products/16199/19476/436322__58796.jpg';
        expect(normalizeImageUrl(resolved)).toBe(resolved);
    });
});

describe('mergeProductSources', () => {
    it('overwrites old source data fields with new incoming fields instead of merging them, while preserving provenance/metadata', () => {
        const existingSources = {
            amazon: {
                title: 'Old Amazon Title',
                price: '19.99',
                images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
                scraped_at: '2026-05-02T23:50:39.868668',
                _scraped_at: '2026-05-02T23:50:39.868668',
                _url: 'https://amazon.com/dp/old',
                _provenance: {
                    source_kind: 'static_scraper',
                    scrape_job_id: 'job-1',
                },
            },
        };

        const incomingSources = {
            amazon: {
                title: 'New Amazon Title',
                image_urls: ['https://example.com/1.jpg'],
                _scraped_at: '2026-05-28T20:05:11.249700+00:00',
                _url: 'https://amazon.com/dp/new',
                _provenance: {
                    source_kind: 'static_scraper',
                    scrape_job_id: 'job-2',
                },
            },
        };

        const result = mergeProductSources(existingSources, incomingSources, { overwriteDataFields: true });

        expect(result.amazon).toEqual({
            title: 'New Amazon Title',
            images: ['https://example.com/1.jpg'], // Normalized from image_urls
            _scraped_at: '2026-05-28T20:05:11.249700+00:00',
            _url: 'https://amazon.com/dp/new',
            _provenance: {
                source_kind: 'static_scraper',
                scrape_job_id: 'job-2',
            },
        });
        // Important: old fields like 'price' and old 'scraped_at' data fields are NOT carried over if they are not in the new incoming payload
        expect((result.amazon as any).price).toBeUndefined();
        expect((result.amazon as any).scraped_at).toBeUndefined();
    });
});
