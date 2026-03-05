import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';

describe('ShopSite Sync Limits', () => {
    // @ts-ignore
    const client = new ShopSiteClient({ storeUrl: 'https://example.com', merchantId: 'test', password: 'test' });

    it('should respect the limit when parsing products', () => {
        const xml = `
            <Products>
                <Product><SKU>P1</SKU><Name>Product 1</Name></Product>
                <Product><SKU>P2</SKU><Name>Product 2</Name></Product>
                <Product><SKU>P3</SKU><Name>Product 3</Name></Product>
            </Products>
        `;
        const products = (client as any).parseProductsXml(xml, 2);
        expect(products).toHaveLength(2);
        expect(products[0].sku).toBe('P1');
        expect(products[1].sku).toBe('P2');
    });

    it('should respect the limit when parsing customers', () => {
        const xml = `
            <customers>
                <customer><email>c1@test.com</email></customer>
                <customer><email>c2@test.com</email></customer>
                <customer><email>c3@test.com</email></customer>
            </customers>
        `;
        const customers = (client as any).parseCustomersXml(xml, 2);
        expect(customers).toHaveLength(2);
        expect(customers[0].email).toBe('c1@test.com');
        expect(customers[1].email).toBe('c2@test.com');
    });
});
