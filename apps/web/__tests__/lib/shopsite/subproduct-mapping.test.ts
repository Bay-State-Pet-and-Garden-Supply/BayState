import { describe, it, expect } from '@jest/globals';
import { transformShopSiteProductToStorefrontRecord } from '@/lib/shopsite/mapping';
import type { ShopSiteProduct } from '@/lib/admin/migration/types';

describe('ShopSite Subproduct Mapping', () => {
    it('should map subproducts from ShopSiteProduct to storefront record', () => {
        const mockProduct: ShopSiteProduct = {
            sku: 'PARENT-001',
            name: 'Parent Product',
            price: 10.00,
            description: 'Test',
            quantityOnHand: 1,
            imageUrl: 'image.jpg',
            subproducts: [
                { name: 'Child 1', sku: 'CHILD-1' },
                { name: 'Child 2', sku: 'CHILD-2' }
            ]
        };

        const result = transformShopSiteProductToStorefrontRecord(mockProduct);
        
        expect(result.subproducts).toEqual(['CHILD-1', 'CHILD-2']);
    });

    it('should handle empty subproducts', () => {
        const mockProduct: ShopSiteProduct = {
            sku: 'SOLO-001',
            name: 'Solo Product',
            price: 10.00,
            description: 'Test',
            quantityOnHand: 1,
            imageUrl: 'image.jpg'
        };

        const result = transformShopSiteProductToStorefrontRecord(mockProduct);
        
        expect(result.subproducts).toEqual([]);
    });
});
