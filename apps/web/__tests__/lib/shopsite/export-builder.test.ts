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
                upc: '011641750056',
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
            shopsite_pages: ['Wild Bird Food Shop All'],
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
                upc: 'SKU-1',
                input: { name: 'Duplicate Product', price: 9.99 },
                consolidated: { name: 'Duplicate Product', brand_id: 'brand-2' },
                selected_images: [{ url: 'https://cdn.example.com/source/duplicate-one.png' }],
            },
            {
                upc: 'SKU-2',
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

    it('correctly coalesces fields nested under consolidated.core and images in consolidated.media', () => {
        const rows: ShopSiteExportSourceRow[] = [
            {
                upc: '869050000114',
                input: {
                    name: 'DIMPLES HORSE TREATS 1.6LB',
                    price: 13.99,
                },
                consolidated: {
                    core: {
                        name: 'Dimples Horse Treats 1.6 lb.',
                        price: 0.99,
                        brand_id: 'brand-1',
                        weight_lbs: 0.6,
                        description: 'Delicious Dimples horse treats.',
                        canonical_category_breadcrumb: 'Horse > Feed & Treats',
                        search_keywords: 'horse, treats',
                        is_special_order: true,
                        is_taxable: false,
                        availability: 'out of stock',
                        minimum_quantity: 2,
                    },
                    media: [
                        { url: 'https://m.media-amazon.com/images/I/81QdgAw3zoL.jpg', role: 'main' }
                    ],
                },
                selected_images: null,
            },
        ];
        const brands = new Map<string, ShopSiteExportBrandRow>([
            ['brand-1', { id: 'brand-1', name: 'Dimples', slug: 'dimples' }],
        ]);

        const [product] = preparePublishedShopSiteExport(rows, brands);

        expect(product).toMatchObject({
            sku: '869050000114',
            name: 'Dimples Horse Treats 1.6 lb.',
            price: 0.99,
            weight: '0.6',
            brand_name: 'Dimples',
            description: 'Delicious Dimples horse treats.',
            category: 'Horse > Feed & Treats',
            shopsite_pages: expect.arrayContaining(['Horse Feed & Treats Shop All']),
            search_keywords: 'horse, treats',
            is_special_order: true,
            is_taxable: false,
            availability: 'out of stock',
            minimum_quantity: 2,
            image_sources: ['https://m.media-amazon.com/images/I/81QdgAw3zoL.jpg'],
            images: ['dimples/dimples-horse-treats-16-lb.jpg'],
        });
    });
});

describe('loadPublishedShopSiteExport', () => {
    it('loads active publishing rows directly from products_ingestion', async () => {
        const publishedRange = jest.fn().mockResolvedValue({
            data: [
                {
                    upc: 'SKU-1',
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
        expect(ingestionQuery.eq).toHaveBeenCalledWith('pipeline_status', 'publishing');
        expect(ingestionQuery.is).toHaveBeenCalledWith('exported_at', null);
        expect(publishedRange).toHaveBeenCalledWith(0, 199);
        expect(result.products).toHaveLength(1);
        expect(result.products[0]).toMatchObject({
            sku: 'SKU-1',
            brand_folder: 'test-brand',
        });
    });

    it('can load specifically requested publishing SKUs even after they have been marked exported', async () => {
        const publishedRange = jest.fn().mockResolvedValue({
            data: [
                {
                    upc: 'SKU-ARCHIVED',
                    input: { name: 'Archived Export', price: 12.99 },
                    consolidated: { name: 'Archived Export', brand_id: 'brand-1' },
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

        const result = await loadPublishedShopSiteExport({
            upcs: ['SKU-ARCHIVED'],
            includeExportedRequestedUpcs: true,
        });

        expect(ingestionQuery.eq).toHaveBeenCalledWith('pipeline_status', 'publishing');
        expect(ingestionQuery.in).toHaveBeenCalledWith('upc', ['SKU-ARCHIVED']);
        expect(ingestionQuery.is).not.toHaveBeenCalledWith('exported_at', null);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].sku).toBe('SKU-ARCHIVED');
    });

    it('infers ShopSite pages from new retail taxonomy breadcrumbs (e.g. Cat > Food > Freeze-Dried & Raw Food)', () => {
        const rows: ShopSiteExportSourceRow[] = [
            {
                upc: '012345678901',
                input: {
                    name: 'Stella & Chewys Cat Freeze-Dried Raw Dinner Morsels',
                    price: 15.99,
                },
                consolidated: {
                    name: 'Stella & Chewys Cat Freeze-Dried Raw Dinner Morsels',
                    price: 15.99,
                    brand_id: 'brand-2',
                    category: 'Cat > Food > Freeze-Dried & Raw Food',
                },
                selected_images: null,
            },
        ];
        const brands = new Map<string, ShopSiteExportBrandRow>([
            ['brand-2', { id: 'brand-2', name: 'Stella & Chewys', slug: 'stella-chewys' }],
        ]);

        const [product] = preparePublishedShopSiteExport(rows, brands);

        expect(product.shopsite_pages).toEqual(
            expect.arrayContaining(['Cat Food Shop All', 'Cat Food Raw'])
        );
    });
});
