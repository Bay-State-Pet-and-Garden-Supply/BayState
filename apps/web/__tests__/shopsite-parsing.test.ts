import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';

describe('ShopSite XML Parsing', () => {
    // @ts-ignore - Mock config is enough for testing private parsing methods
    const client = new ShopSiteClient({ storeUrl: 'https://example.com', merchantId: 'test', password: 'test' });

    describe('Product Parsing', () => {
        it('should parse products with lowercase tags', () => {
            const xml = `
                <products>
                    <product>
                        <sku>SKU123</sku>
                        <name>Test Product</name>
                        <price>19.99</price>
                        <description>A test product description</description>
                        <quantity_on_hand>10</quantity_on_hand>
                        <graphic>image.jpg</graphic>
                    </product>
                </products>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products).toHaveLength(1);
            expect(products[0]).toMatchObject({
                sku: 'SKU123',
                name: 'Test Product',
                price: 19.99,
                description: 'A test product description',
                quantityOnHand: 10,
                imageUrl: 'image.jpg'
            });
        });

        it('should parse products with PascalCase tags (from DTD)', () => {
            const xml = `
                <Products>
                    <Product>
                        <SKU>SKU456</SKU>
                        <Name>Pascal Product</Name>
                        <Price>25.00</Price>
                        <Quantity>5</Quantity>
                        <Weight>2.5</Weight>
                        <Taxable>Yes</Taxable>
                    </Product>
                </Products>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products).toHaveLength(1);
            expect(products[0]).toMatchObject({
                sku: 'SKU456',
                name: 'Pascal Product',
                price: 25.0,
                quantityOnHand: 5,
                weight: 2.5,
                taxable: true
            });
        });

        it('should handle CDATA values', () => {
            const xml = `
                <product>
                    <sku>SKU-CDATA</sku>
                    <name><![CDATA[Product with <Special> Characters]]></name>
                </product>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products[0].name).toBe('Product with <Special> Characters');
        });

        it('should parse extended product fields from full ShopSite export', () => {
            const xml = `
                <Product>
                    <SKU>71859002217</SKU>
                    <Name>Kaytee Bermuda Grass 16 oz.</Name>
                    <Price>4.99</Price>
                    <SaleAmount>3.99</SaleAmount>
                    <ProductDisabled></ProductDisabled>
                    <GTIN>071859002217</GTIN>
                    <Brand>Kaytee</Brand>
                    <Weight>1.02</Weight>
                    <Taxable>checked</Taxable>
                    <Availability>in stock</Availability>
                    <FileName>kaytee-bermuda-grass-16-oz.html</FileName>
                    <MinimumQuantity>0</MinimumQuantity>
                    <ProductID>378</ProductID>
                    <ProductGUID>eda0c8b0-cb3b-11e5-a172-0025908f7730</ProductGUID>
                    <MoreInformationText>Full description here</MoreInformationText>
                    <ProductDescription>Short description</ProductDescription>
                </Product>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products).toHaveLength(1);
            expect(products[0]).toMatchObject({
                sku: '71859002217',
                name: 'Kaytee Bermuda Grass 16 oz.',
                price: 4.99,
                saleAmount: 3.99,
                gtin: '071859002217',
                brandName: 'Kaytee',
                weight: 1.02,
                taxable: true,
                availability: 'in stock',
                fileName: 'kaytee-bermuda-grass-16-oz.html',
                productId: '378',
                productGuid: 'eda0c8b0-cb3b-11e5-a172-0025908f7730',
                moreInfoText: 'Full description here',
                description: 'Short description',
            });
        });

        it('should parse inventory and categorization data', () => {
            const xml = `
                <Product>
                    <SKU>CAT-TEST-001</SKU>
                    <Name>Categorized Product</Name>
                    <QuantityOnHand>42</QuantityOnHand>
                    <OutOfStockLimit>2</OutOfStockLimit>
                    <GoogleProductCategory>Pet Supplies &gt; Dog Supplies</GoogleProductCategory>
                    <ProductOnPages>
                        <PageLink>
                            <Name>Dog Food</Name>
                        </PageLink>
                        <PageLink>
                            <Name>Premium Brands</Name>
                        </PageLink>
                    </ProductOnPages>
                </Product>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products).toHaveLength(1);
            expect(products[0]).toMatchObject({
                sku: 'CAT-TEST-001',
                quantityOnHand: 42,
                outOfStockLimit: 2,
                googleProductCategory: 'Pet Supplies > Dog Supplies',
                shopsitePages: ['Dog Food', 'Premium Brands'],
            });
        });

        it('should skip disabled products', () => {
            const xml = `
                <Products>
                    <Product>
                        <SKU>ENABLED-SKU</SKU>
                        <Name>Enabled Product</Name>
                        <ProductDisabled></ProductDisabled>
                    </Product>
                    <Product>
                        <SKU>DISABLED-SKU</SKU>
                        <Name>Disabled Product</Name>
                        <ProductDisabled>checked</ProductDisabled>
                    </Product>
                </Products>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products).toHaveLength(1);
            expect(products[0].sku).toBe('ENABLED-SKU');
        });

        it('should filter out "none" from image fields', () => {
            const xml = `
                <Product>
                    <SKU>IMG-TEST</SKU>
                    <Name>Image Test</Name>
                    <Graphic>none</Graphic>
                    <MoreInfoImage1>real-image.jpg</MoreInfoImage1>
                    <MoreInfoImage2>none</MoreInfoImage2>
                </Product>
            `;
            const products = (client as any).parseProductsXml(xml);
            expect(products[0].imageUrl).toBe('');
            expect(products[0].additionalImages).toEqual(['real-image.jpg']);
        });
    });

    describe('Order Parsing', () => {
        it('should parse orders based on the DTD structure', () => {
            const xml = `
                <ShopSiteOrders>
                    <Order>
                        <OrderNumber>1001</OrderNumber>
                        <ShopSiteTransactionID>TX123</ShopSiteTransactionID>
                        <OrderDate>12/31/2025</OrderDate>
                        <Billing>
                            <Email>customer@example.com</Email>
                            <FullName>John Doe</FullName>
                            <Address>
                                <Street1>123 Main St</Street1>
                                <City>Boston</City>
                                <State>MA</State>
                                <Code>02108</Code>
                                <Country>US</Country>
                            </Address>
                        </Billing>
                        <Totals>
                            <GrandTotal>55.00</GrandTotal>
                            <Tax>
                                <TaxAmount>2.50</TaxAmount>
                            </Tax>
                            <ShippingTotal>
                                <Total>7.50</Total>
                            </ShippingTotal>
                        </Totals>
                        <Shipping>
                            <Products>
                                <Product>
                                    <SKU>SKU123</SKU>
                                    <Quantity>2</Quantity>
                                    <ItemPrice>22.50</ItemPrice>
                                </Product>
                            </Products>
                        </Shipping>
                    </Order>
                </ShopSiteOrders>
            `;
            const orders = (client as any).parseOrdersXml(xml);
            expect(orders).toHaveLength(1);
            expect(orders[0]).toMatchObject({
                orderNumber: '1001',
                customerEmail: 'customer@example.com',
                grandTotal: 55.00,
                tax: 2.50,
                shippingTotal: 7.50
            });
            expect(orders[0].items).toHaveLength(1);
            expect(orders[0].items[0]).toMatchObject({
                sku: 'SKU123',
                quantity: 2,
                price: 22.50
            });
        });
    });
});
