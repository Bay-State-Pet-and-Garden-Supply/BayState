import {
    loadPublishedShopSiteExport,
    preparePublishedShopSiteExport,
    type ShopSiteExportBrandRow,
    type ShopSiteExportSourceRow,
} from '@/lib/shopsite/export-builder';

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(),
}));

const { createAdminClient } = require('@/lib/supabase/server');

describe('preparePublishedShopSiteExport', () => {
    it('builds ShopSite-ready image paths grouped by brand', () => {
        const rows: ShopSiteExportSourceRow[] = [
            {
                sku: '011641750056',
                input: {
                    name: 'Feathered Friend Favorite 20 lb.',
                    price: 24.99,
                },
                consolidated: {
                    name: 'Feathered Friend Favorite 20 lb.',
                    price: 24.99,
                    brand_id: 'brand-1',
                    images: [
                        'https://cdn.example.com/source/feathered-friend-favorite-front.png',
                        'https://cdn.example.com/source/feathered-friend-favorite-back.png',
                    ],
                    category: 'Wild Bird Food',
                    product_type: 'Seeds & Seed Mixes',
                    product_on_pages: ['Wild Bird Seed & Seed Mixes', 'Wild Bird Food Shop All'],
                    search_keywords: 'bird, seed',
                    gtin: '011641750056',
                    availability: 'in stock',
                    minimum_quantity: 0,
                },
                selected_images: null,
            },
        ];
        const brands = new Map<string, ShopSiteExportBrandRow>([
            ['brand-1', { id: 'brand-1', name: 'Feathered Friend', slug: 'feathered-friend' }],
        ]);

        const [product] = preparePublishedShopSiteExport(rows, brands);

        expect(product).toMatchObject({
            sku: '011641750056',
            name: 'Feathered Friend Favorite 20 lb.',
            brand_name: 'Feathered Friend',
            brand_folder: 'feathered-friend',
            category: 'Wild Bird Food',
            file_name: 'feathered-friend-favorite-20-lb.html',
            gtin: '011641750056',
            availability: 'in stock',
            minimum_quantity: 0,
            shopsite_pages: ['Wild Bird Seed & Seed Mixes', 'Wild Bird Food Shop All'],
            image_sources: [
                'https://cdn.example.com/source/feathered-friend-favorite-front.png',
                'https://cdn.example.com/source/feathered-friend-favorite-back.png',
            ],
            images: [
                'feathered-friend/feathered-friend-favorite-20-lb.jpg',
                'feathered-friend/feathered-friend-favorite-20-lb-2.jpg',
            ],
        });
    });

    it('falls back to selected image metadata and deconflicts duplicate stems', () => {
        const rows: ShopSiteExportSourceRow[] = [
            {
                sku: 'SKU-1',
                input: { name: 'Duplicate Product', price: 9.99 },
                consolidated: { name: 'Duplicate Product', brand_id: 'brand-2' },
                selected_images: [{ url: 'https://cdn.example.com/source/duplicate-one.png' }],
            },
            {
                sku: 'SKU-2',
                input: { name: 'Duplicate Product', price: 10.99 },
                consolidated: {
                    name: 'Duplicate Product',
                    brand_id: 'brand-2',
                    images: ['https://cdn.example.com/source/duplicate-two.png'],
                },
                selected_images: [],
            },
        ];
        const brands = new Map<string, ShopSiteExportBrandRow>([
            ['brand-2', { id: 'brand-2', name: 'Test Brand', slug: 'test-brand' }],
        ]);

        const products = preparePublishedShopSiteExport(rows, brands);

        expect(products[0].file_name).toBe('duplicate-product.html');
        expect(products[0].images).toEqual(['test-brand/duplicate-product.jpg']);
        expect(products[0].image_sources).toEqual(['https://cdn.example.com/source/duplicate-one.png']);

        expect(products[1].file_name).toBe('duplicate-product-sku-2.html');
        expect(products[1].images).toEqual(['test-brand/duplicate-product-sku-2.jpg']);
        expect(products[1].image_sources).toEqual(['https://cdn.example.com/source/duplicate-two.png']);
    });
});

describe('loadPublishedShopSiteExport', () => {
    it('loads active exporting rows directly from products_ingestion', async () => {
        const publishedRange = jest.fn().mockResolvedValue({
            data: [
                {
                    sku: 'SKU-1',
                    input: { name: 'Exported Product', price: 12.99 },
                    consolidated: { name: 'Exported Product', brand_id: 'brand-1' },
                    selected_images: [],
                },
            ],
            error: null,
        });
        const ingestionQuery = {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: publishedRange,
        };
        const brandsIn = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-1', name: 'Test Brand', slug: 'test-brand' }],
            error: null,
        });

        const supabase = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: jest.fn().mockReturnValue(ingestionQuery),
                    };
                }

                if (table === 'brands') {
                    return {
                        select: jest.fn().mockReturnValue({
                            in: brandsIn,
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabase);

        const result = await loadPublishedShopSiteExport();

        expect(supabase.from).toHaveBeenCalledWith('products_ingestion');
        expect(ingestionQuery.eq).toHaveBeenCalledWith('pipeline_status', 'exporting');
        expect(ingestionQuery.is).toHaveBeenCalledWith('exported_at', null);
        expect(publishedRange).toHaveBeenCalledWith(0, 199);
        expect(result.products).toHaveLength(1);
        expect(result.products[0]).toMatchObject({
            sku: 'SKU-1',
            brand_folder: 'test-brand',
        });
    });
});
