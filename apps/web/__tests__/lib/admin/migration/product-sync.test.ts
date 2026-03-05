/**
 * @jest-environment node
 */
import { transformShopSiteProduct, buildProductSlug } from '@/lib/admin/migration/product-sync';

describe('Product Sync Utilities', () => {
    describe('transformShopSiteProduct', () => {
        it('transforms ShopSite product to full feature parity format', () => {
            const shopSiteProduct = {
                sku: 'SKU-001',
                name: 'Test Product',
                price: 29.99,
                saleAmount: 24.99,
                description: 'A test product description',
                quantityOnHand: 10,
                imageUrl: 'https://example.com/image.jpg',
                brandName: 'Test Brand',
                categoryName: 'Dog Food',
                weight: 5.5,
                searchKeywords: 'dog, food, healthy',
                isSpecialOrder: true
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result).toEqual({
                sku: 'SKU-001',
                name: 'Test Product',
                slug: 'test-product',
                price: 29.99,
                sale_price: 24.99,
                description: 'A test product description',
                stock_status: 'in_stock',
                images: ['https://example.com/image.jpg'],
                is_featured: false,
                is_special_order: true,
                weight: 5.5,
                search_keywords: 'dog, food, healthy',
                brand_name: 'Test Brand',
                category_name: 'Dog Food',
            });
        });

        it('sets stock_status based on availability string when quantity is 0', () => {
            const shopSiteProduct = {
                sku: 'SKU-AVAIL',
                name: 'Availability Test Product',
                price: 15.00,
                description: '',
                quantityOnHand: 0,
                availability: 'in stock',
                imageUrl: '',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result.stock_status).toBe('in_stock');
        });


        it('sets stock_status to out_of_stock when quantity is 0', () => {
            const shopSiteProduct = {
                sku: 'SKU-002',
                name: 'Out of Stock Product',
                price: 19.99,
                description: '',
                quantityOnHand: 0,
                imageUrl: '',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result.stock_status).toBe('out_of_stock');
        });

        it('handles empty image URL', () => {
            const shopSiteProduct = {
                sku: 'SKU-003',
                name: 'No Image Product',
                price: 9.99,
                description: '',
                quantityOnHand: 5,
                imageUrl: '',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result.images).toEqual([]);
        });
    });

    describe('buildProductSlug', () => {
        it('generates lowercase hyphenated slug from name', () => {
            expect(buildProductSlug('Test Product Name')).toBe('test-product-name');
        });

        it('removes special characters', () => {
            expect(buildProductSlug("Product's Special & Great!")).toBe('products-special-great');
        });

        it('handles multiple spaces', () => {
            expect(buildProductSlug('Product   With   Spaces')).toBe('product-with-spaces');
        });

        it('appends SKU for uniqueness when provided', () => {
            expect(buildProductSlug('Common Product', 'SKU-123')).toBe('common-product-sku-123');
        });
    });
});
