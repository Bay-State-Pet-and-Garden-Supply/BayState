import {
    preparePublishedShopSiteExport,
    type ShopSiteExportBrandRow,
    type ShopSiteExportSourceRow,
} from '@/lib/shopsite/export-builder';

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
            product_type: 'Seeds & Seed Mixes',
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
