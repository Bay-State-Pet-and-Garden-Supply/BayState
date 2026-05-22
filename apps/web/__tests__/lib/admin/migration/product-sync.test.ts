/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
    buildPipelineInputFromShopSiteProduct,
    buildProductSlug,
    transformShopSiteProduct,
} from '@/lib/admin/migration/product-sync';

describe('Product Sync Utilities', () => {
    describe('transformShopSiteProduct', () => {
        it('transforms ShopSite product to full feature parity format', () => {
            const shopSiteProduct = {
                upc: 'UPC-001',
                name: 'Test Product',
                price: 29.99,
                saleAmount: 24.99,
                description: 'A test product description',
                quantityOnHand: 10,
                imageUrl: 'https://example.com/image.jpg',
                shortName: 'Test Short Name',
                brandName: 'Test Brand',
                petTypeName: 'dogs',
                lifeStage: 'adult',
                petSize: 'small',
                specialDiet: 'limited ingredient',
                healthFeature: 'hip & joint',
                foodForm: 'baked',
                flavor: 'peanut butter',
                categoryName: 'Dog Food',
                productFeature: 'soft chew',
                size: '8 oz',
                color: 'tan',
                packagingType: 'pouch',
                weight: 5.5,
                searchKeywords: 'dog, food, healthy',
                isSpecialOrder: true,
                inStorePickup: true,
                productId: '123',
                productGuid: 'guid-123',
                fileName: 'test-product.html',
                lowStockThreshold: 2,
                minimumQuantity: 0,
                moreInfoText: '<p>Long form details</p>',
                productTypeName: 'Dog Food',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result).toEqual({
                upc: 'UPC-001',
                name: 'Test Product',
                slug: 'test-product',
                price: 29.99,
                description: 'A test product description',
                stock_status: 'in_stock',
                images: ['https://example.com/image.jpg'],
                short_name: 'Test Short Name',
                is_special_order: true,
                in_store_pickup: true,
                weight: 5.5,
                quantity: 10,
                low_stock_threshold: 2,
                is_taxable: true,
                minimum_quantity: 0,
                product_type: 'Dog Food',
                search_keywords: 'dog, food, healthy',
                brand_name: 'Test Brand',
                pet_type_name: 'Dog',
                life_stage: 'Adult',
                pet_size: 'Small',
                special_diet: 'Limited Ingredient',
                health_feature: 'Hip & Joint',
                food_form: 'Baked',
                flavor: 'Peanut Butter',
                category_name: 'Dog Food',
                product_feature: 'Soft Chew',
                size: '8 Oz',
                color: 'Tan',
                packaging_type: 'Pouch',
                subproducts: [],
            });
        });

        it('ignores ShopSite availability text when quantity is 0', () => {
            const shopSiteProduct = {
                upc: 'UPC-AVAIL',
                name: 'Availability Test Product',
                price: 15.00,
                description: '',
                quantityOnHand: 0,
                imageUrl: '',
            };

            const result = transformShopSiteProduct(shopSiteProduct);

            expect(result.stock_status).toBe('out_of_stock');
        });


        it('sets stock_status to out_of_stock when quantity is 0', () => {
            const shopSiteProduct = {
                upc: 'UPC-002',
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
                upc: 'UPC-003',
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
                upc: 'UPC-004',
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
                upc: 'UPC-PIPE-001',
                name: 'Example Product',
                price: 14.99,
                description: 'Short description',
                quantityOnHand: 8,
                imageUrl: '',
                shortName: 'Mini Trainers',
                brandName: 'Bay State',
                petTypeName: 'dog',
                lifeStage: 'adult',
                categoryName: 'Dog Food',
                productTypeName: 'Treats',
                packagingType: 'bag',
                moreInfoText: '<p>Long description</p>',
                inStorePickup: true,
            });

            expect(input).toEqual({
                name: 'Example Product',
                price: 14.99,
                description: 'Short description',
                short_name: 'Mini Trainers',
                category: 'Dog Food',
                product_type: 'Treats',
                brand: 'Bay State',
                pet_type: 'Dog',
                lifestage: 'Adult',
                pet_size: null,
                special_diet: null,
                health_feature: null,
                food_form: null,
                flavor: null,
                product_feature: null,
                size: null,
                color: null,
                packaging_type: 'Bag',
                weight: null,
                search_keywords: null,
                minimum_quantity: 0,
                is_special_order: false,
                in_store_pickup: true,
                legacy_filename: null,
                subproduct_upcs: undefined,
            });
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

        it('appends UPC for uniqueness when provided', () => {
            expect(buildProductSlug('Common Product', 'UPC-123')).toBe('common-product-upc-123');
        });
    });
});
