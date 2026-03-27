/**
 * @jest-environment node
 */
import {
    buildPipelineInputFromShopSiteProduct,
    buildProductSlug,
    transformShopSiteProduct,
} from '@/lib/admin/migration/product-sync';

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
                isSpecialOrder: true,
                productId: '123',
                productGuid: 'guid-123',
                fileName: 'test-product.html',
                shopsitePages: ['Dogs', 'Featured'],
                lowStockThreshold: 2,
                taxable: true,
                gtin: '0123456789012',
                availability: 'in stock',
                minimumQuantity: 0,
                moreInfoText: '<p>Long form details</p>',
                productTypeName: 'Dog Food',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result).toEqual({
                sku: 'SKU-001',
                name: 'Test Product',
                slug: 'test-product',
                price: 29.99,
                description: 'A test product description',
                stock_status: 'in_stock',
                images: ['https://example.com/image.jpg'],
                is_special_order: true,
                shopsite_pages: ['Dogs', 'Featured'],
                weight: 5.5,
                quantity: 10,
                low_stock_threshold: 2,
                is_taxable: true,
                gtin: '0123456789012',
                availability: 'in stock',
                minimum_quantity: 0,
                long_description: '<p>Long form details</p>',
                product_type: 'Dog Food',
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

        it('normalizes imported facet values before persistence', () => {
            const shopSiteProduct = {
                sku: 'SKU-004',
                name: 'Facet Normalization Product',
                price: 12.99,
                description: '',
                quantityOnHand: 3,
                imageUrl: '',
                brandName: '  Bay State P&G  ',
                categoryName: ' lawn & garden | bird supplies ',
                productTypeName: ' food | Apparrel | gloves ',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result.brand_name).toBe('Bay State P&G');
            expect(result.category_name).toBe('Lawn & Garden|Bird Supplies');
            expect(result.product_type).toBe('Food|Apparel|Gloves');
        });

        it('builds pipeline input that preserves ProductOnPages for downstream consolidation', () => {
            const input = buildPipelineInputFromShopSiteProduct({
                sku: 'SKU-PIPE-001',
                name: 'Example Product',
                price: 14.99,
                description: 'Short description',
                quantityOnHand: 8,
                imageUrl: '',
                brandName: 'Bay State',
                categoryName: 'Dog Food',
                productTypeName: 'Treats',
                moreInfoText: '<p>Long description</p>',
                shopsitePages: ['Dog Food Dry', 'Dog Food Shop All'],
            });

            expect(input).toEqual(
                expect.objectContaining({
                    name: 'Example Product',
                    price: 14.99,
                    category: 'Dog Food',
                    product_type: 'Treats',
                    product_on_pages: ['Dog Food Dry', 'Dog Food Shop All'],
                })
            );
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
