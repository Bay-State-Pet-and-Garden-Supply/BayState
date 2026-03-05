/**
 * @jest-environment node
 */
import { ShopSiteClient, ShopSiteConfig } from '@/lib/admin/migration/shopsite-client';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ShopSiteClient', () => {
    const validConfig: ShopSiteConfig = {
        storeUrl: 'https://example.shopsite.com',
        merchantId: 'test-merchant',
        password: 'test-password',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('creates a client with valid config', () => {
            const client = new ShopSiteClient(validConfig);
            expect(client).toBeInstanceOf(ShopSiteClient);
        });

        it('throws error if storeUrl is missing', () => {
            expect(() => new ShopSiteClient({ ...validConfig, storeUrl: '' }))
                .toThrow('Invalid ShopSite configuration');
        });

        it('throws error if merchantId is missing', () => {
            expect(() => new ShopSiteClient({ ...validConfig, merchantId: '' }))
                .toThrow('Invalid ShopSite configuration');
        });
    });

    describe('testConnection', () => {
        it('returns true when connection succeeds', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<?xml version="1.0"?><products></products>'),
            });

            const client = new ShopSiteClient(validConfig);
            const result = await client.testConnection();

            expect(result.success).toBe(true);
        });

        it('returns false with error message on failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            const client = new ShopSiteClient(validConfig);
            const result = await client.testConnection();

            expect(result.success).toBe(false);
            expect(result.error).toContain('401');
        });

        it('handles network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const client = new ShopSiteClient(validConfig);
            const result = await client.testConnection();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('fetchProducts', () => {
        const mockProductXml = `<?xml version="1.0"?>
      <products>
        <product>
          <sku>SKU001</sku>
          <name>Test Product</name>
          <price>19.99</price>
          <description>A test product</description>
          <quantity_on_hand>10</quantity_on_hand>
          <graphic>https://example.com/image.jpg</graphic>
        </product>
      </products>`;

        it('fetches and parses products from XML', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockProductXml),
                arrayBuffer: () => Promise.resolve(Buffer.from(mockProductXml)),
            });

            const client = new ShopSiteClient(validConfig);
            const products = await client.fetchProducts();

            expect(products).toHaveLength(1);
            expect(products[0]).toMatchObject({
                sku: 'SKU001',
                name: 'Test Product',
                price: 19.99,
                description: 'A test product',
                quantityOnHand: 10,
                imageUrl: 'https://example.com/image.jpg',
            });
        });

        it('returns empty array on fetch error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));

            const client = new ShopSiteClient(validConfig);
            const products = await client.fetchProducts();

            expect(products).toEqual([]);
        });

        it('includes proper authentication headers', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('<?xml version="1.0"?><products></products>'),
                arrayBuffer: () => Promise.resolve(Buffer.from('<?xml version="1.0"?><products></products>')),
            });

            const client = new ShopSiteClient(validConfig);
            await client.fetchProducts();

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('db_xml.cgi'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': expect.stringContaining('Basic'),
                    }),
                })
            );
        });
    });

    describe('fetchOrders', () => {
        const mockOrderXml = `<?xml version="1.0"?>
      <ShopSiteOrders>
        <Order>
          <OrderNumber>ORD-001</OrderNumber>
          <OrderDate>2024-01-15</OrderDate>
          <Totals>
            <GrandTotal>99.99</GrandTotal>
            <Tax>
               <TaxAmount>8.00</TaxAmount>
            </Tax>
            <ShippingTotal>
               <Total>5.99</Total>
            </ShippingTotal>
          </Totals>
          <Billing>
            <Email>test@example.com</Email>
          </Billing>
          <Shipping>
            <Products>
                <Product>
                  <SKU>SKU001</SKU>
                  <Quantity>2</Quantity>
                  <ItemPrice>19.99</ItemPrice>
                </Product>
            </Products>
          </Shipping>
        </Order>
      </ShopSiteOrders>`;

        it('fetches and parses orders from XML', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockOrderXml),
                arrayBuffer: () => Promise.resolve(Buffer.from(mockOrderXml)),
            });

            const client = new ShopSiteClient(validConfig);
            const orders = await client.fetchOrders();

            expect(orders).toHaveLength(1);
            expect(orders[0]).toMatchObject({
                orderNumber: 'ORD-001',
                grandTotal: 99.99,
                customerEmail: 'test@example.com',
            });
            expect(orders[0].items).toHaveLength(1);
        });
    });

    describe('fetchCustomers', () => {
        const mockCustomerXml = `<?xml version="1.0"?>
      <customers>
        <customer>
          <email>customer@example.com</email>
          <first_name>John</first_name>
          <last_name>Doe</last_name>
          <billing_address>123 Main St</billing_address>
          <billing_city>Springfield</billing_city>
          <billing_state>MA</billing_state>
          <billing_zip>01234</billing_zip>
        </customer>
      </customers>`;

        it('fetches and parses customers from XML', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockCustomerXml),
                arrayBuffer: () => Promise.resolve(Buffer.from(mockCustomerXml)),
            });

            const client = new ShopSiteClient(validConfig);
            const customers = await client.fetchCustomers();

            expect(customers).toHaveLength(1);
            expect(customers[0]).toMatchObject({
                email: 'customer@example.com',
                firstName: 'John',
                lastName: 'Doe',
            });
        });
    });

    describe('sanitizeXml', () => {
        it('should fix unencoded ampersands', () => {
            const input = '<Name>Ben & Jerry\'s</Name>';
            const expected = '<Name>Ben &amp; Jerry\'s</Name>';
            expect(ShopSiteClient.sanitizeXml(input)).toBe(expected);
        });

        it('should not double-encode already encoded ampersands', () => {
            const input = '<Name>Ben &amp; Jerry\'s</Name>';
            const expected = '<Name>Ben &amp; Jerry\'s</Name>'; // Should remain unchanged
            expect(ShopSiteClient.sanitizeXml(input)).toBe(expected);
        });

        it('should replace known HTML entities', () => {
            const input = '<Desc>Copyright &copy; 2024</Desc>';
            const expected = '<Desc>Copyright &#169; 2024</Desc>';
            expect(ShopSiteClient.sanitizeXml(input)).toBe(expected);
        });

        it('should replace &uuml; (explicitly requested)', () => {
            const input = '<Desc>M&uuml;ller</Desc>';
            const expected = '<Desc>M&#252;ller</Desc>';
            expect(ShopSiteClient.sanitizeXml(input)).toBe(expected);
        });

        it('should handle complex mixed cases', () => {
            const input = '<Item>M&Ms & &nbsp;Skittles</Item>';
            // & -> &amp;
            // &nbsp; -> &#160;
            const expected = '<Item>M&amp;Ms &amp; &#160;Skittles</Item>';
            expect(ShopSiteClient.sanitizeXml(input)).toBe(expected);
        });
    });
});
