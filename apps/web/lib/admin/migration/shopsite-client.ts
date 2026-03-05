/**
 * ShopSite API Client
 * 
 * Handles communication with the ShopSite db_xml.cgi endpoint
 * and Order Download API for data migration.
 */

import {
    ShopSiteProduct,
    ShopSiteOrder,
    ShopSiteOrderItem,
    ShopSiteCustomer,
    ShopSiteConfigSchema,
    ConnectionTestResult,
    ShopSiteConfig,
    AddressInfo,
} from './types';

export interface OrderDownloadOptions {
    version?: string;
    startOrder?: string;
    endOrder?: string;
    startDate?: string; // mm/dd/yyyy
    endDate?: string;   // mm/dd/yyyy
    pay?: boolean;
    limit?: number;
}

export { ShopSiteConfigSchema };
export type { ShopSiteConfig, AddressInfo } from './types';


/**
 * Client for interacting with ShopSite APIs.
 * Handles product, order, and customer data retrieval.
 */
export class ShopSiteClient {
    private readonly config: ShopSiteConfig;
    private readonly authHeader: string;

    constructor(config: ShopSiteConfig) {
        // Validate config
        const result = ShopSiteConfigSchema.safeParse(config);
        if (!result.success || !config.storeUrl || !config.merchantId) {
            throw new Error('Invalid ShopSite configuration');
        }

        this.config = config;
        this.authHeader = `Basic ${Buffer.from(`${config.merchantId}:${config.password}`).toString('base64')}`;
    }

    /**
     * Build the full URL for the API request.
     * Handles various storeUrl formats and different CGI scripts.
     */
    private buildUrl(queryParams: string, scriptName: string = 'db_xml.cgi'): string {
        let baseUrl = this.config.storeUrl.replace(/\/$/, '');

        // If the URL ends in .cgi, strip the filename to get the directory
        if (baseUrl.endsWith('.cgi')) {
            const lastSlash = baseUrl.lastIndexOf('/');
            if (lastSlash !== -1) {
                baseUrl = baseUrl.substring(0, lastSlash);
            }
        }

        return `${baseUrl}/${scriptName}?${queryParams}`;
    }

    /**
     * Sanitizes raw ShopSite XML to make it compatible with XML parsers.
     * 1. Fixes unencoded ampersands.
     * 2. Replaces common HTML entities that are not valid in standard XML.
     */
    public static sanitizeXml(xml: string): string {
        if (!xml) return '';

        let sanitized = xml;

        // 1. Fix Unencoded Ampersands
        // Matches '&' that is NOT followed by an entity pattern (e.g., &amp;, &#123;)
        // Using the exact regex from the guide: re.sub(r"&(?![a-zA-Z0-9#]+;)", "&amp;", raw_content)
        sanitized = sanitized.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');

        // 2. Replace common HTML entities that break XML parsers, plus others from the guide
        const htmlEntities: Record<string, string> = {
            '&nbsp;': '&#160;',
            '&copy;': '&#169;',
            '&reg;': '&#174;',
            '&trade;': '&#8482;',
            '&bull;': '&#8226;',
            '&hellip;': '&#8230;',
            '&ndash;': '&#8211;',
            '&mdash;': '&#8212;',
            '&lsquo;': '&#8216;',
            '&rsquo;': '&#8217;',
            '&ldquo;': '&#8220;',
            '&rdquo;': '&#8221;',
            '&middot;': '&#183;',
            '&deg;': '&#176;',
            '&uuml;': '&#252;', // Explicitly mentioned in guide
        };

        for (const [entity, replacement] of Object.entries(htmlEntities)) {
            // Global replacement
            sanitized = sanitized.split(entity).join(replacement);
        }

        return sanitized;
    }

    /**
     * Test the connection to ShopSite.
     * Makes a lightweight request to verify credentials.
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(
                this.buildUrl('action=list', 'db_xml.cgi'),
                {
                    method: 'GET',
                    headers: {
                        'Authorization': this.authHeader,
                    },
                }
            );

            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Fetch all products from ShopSite db_xml.cgi endpoint.
     */
    async fetchProducts(limit?: number): Promise<ShopSiteProduct[]> {
        try {
            // Added version=14.0 as per legacy guide
            const response = await fetch(
                this.buildUrl('clientApp=1&dbname=products&version=14.0', 'db_xml.cgi'),
                {
                    method: 'GET',
                    headers: {
                        'Authorization': this.authHeader,
                    },
                    cache: 'no-store',
                }
            );

            if (!response.ok) {
                console.error(`Failed to fetch products: ${response.status}`);
                return [];
            }

            // Implement manual streaming to abort download early if limit is set
            let rawText = '';

            if (limit && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8', { fatal: false });
                const productCount = 0;

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        rawText += chunk;

                        // Count occurrences of </Product> to estimate count
                        // Since a chunk might cut a tag in half, this is approximate but safe
                        // (we might download 1 extra product but that's fine)
                        const matches = rawText.match(/<\/Product>/gi);
                        if (matches && matches.length >= limit) {
                            console.log(`Limit of ${limit} reached. Aborting download.`);
                            await reader.cancel('Limit reached');
                            break;
                        }
                    }
                } catch (e) {
                    // Ignore cancel errors
                    if (e !== 'Limit reached') console.error('Stream read error:', e);
                }

                // Ensure the XML is terminated properly if we cut it off
                // Check if we cut off inside a tag or mid-stream
                if (!rawText.trim().endsWith('</ShopSiteProducts>')) {
                    // Try to find the last complete </Product>
                    const lastProductEnd = rawText.lastIndexOf('</Product>');
                    if (lastProductEnd !== -1) {
                        rawText = rawText.substring(0, lastProductEnd + 10);
                        rawText += '</ShopSiteProducts>';
                    } else {
                        // Fallback: just append the closing tag to whatever we have
                        rawText += '</ShopSiteProducts>';
                    }
                }
            } else {
                // Determine if we need to fall back to full download
                const buffer = await response.arrayBuffer();
                const decoder = new TextDecoder('utf-8', { fatal: false });
                rawText = decoder.decode(buffer);
            }

            const xmlText = ShopSiteClient.sanitizeXml(rawText);
            return this.parseProductsXml(xmlText, limit);
        } catch (error) {
            console.error('Error fetching products:', error);
            return [];
        }
    }

    /**
     * Fetch all orders from ShopSite Order Download API.
     */
    async fetchOrders(options: OrderDownloadOptions = {}): Promise<ShopSiteOrder[]> {
        try {
            // Build query parameters
            const params = new URLSearchParams();
            params.append('clientApp', '1');
            params.append('dbname', 'orders');
            params.append('version', options.version || '14.0');
            params.append('pay', 'yes');

            if (options.startOrder) params.append('startorder', options.startOrder);
            if (options.endOrder) params.append('endorder', options.endOrder);
            if (options.startDate) params.append('startdate', options.startDate);
            if (options.endDate) params.append('enddate', options.endDate);
            if (options.limit) params.append('maxorder', options.limit.toString());

            const response = await fetch(
                this.buildUrl(params.toString(), 'db_xml.cgi'),
                {
                    method: 'GET',
                    headers: {
                        'Authorization': this.authHeader,
                    },
                    cache: 'no-store',
                }
            );

            if (!response.ok) {
                console.error(`Failed to fetch orders: ${response.status}`);
                return [];
            }

            // Handle encoding (Switching to utf-8 per guide)
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('utf-8', { fatal: false });
            let xmlText = decoder.decode(buffer);

            // Strip "Content-type: ..." header if present in body
            if (xmlText.startsWith('Content-type:')) {
                const headerEnd = xmlText.indexOf('\n\n');
                if (headerEnd !== -1) {
                    xmlText = xmlText.substring(headerEnd + 2);
                }
            }

            // Sanitize XML
            xmlText = ShopSiteClient.sanitizeXml(xmlText);

            console.log(`[ShopSite] Downloaded orders XML: ${xmlText.length} chars`);
            return this.parseOrdersXml(xmlText);
        } catch (error) {
            console.error('Error fetching orders:', error);
            return [];
        }
    }

    /**
     * Fetch all registered customers from ShopSite.
     */
    async fetchCustomers(limit?: number): Promise<ShopSiteCustomer[]> {
        try {
            const response = await fetch(
                this.buildUrl('clientApp=1&dbname=registration', 'db_xml.cgi'),
                {
                    method: 'GET',
                    headers: {
                        'Authorization': this.authHeader,
                    },
                    cache: 'no-store',
                }
            );

            if (!response.ok) {
                console.error(`Failed to fetch customers: ${response.status}`);
                return [];
            }

            const xmlText = ShopSiteClient.sanitizeXml(await response.text());
            return this.parseCustomersXml(xmlText, limit);
        } catch (error) {
            console.error('Error fetching customers:', error);
            return [];
        }
    }

    // ============================================================================
    // XML Parsing Methods
    // ============================================================================

    private parseProductsXml(xmlText: string, limit?: number): ShopSiteProduct[] {
        const products: ShopSiteProduct[] = [];

        // Support both <product> and <Product> tags
        const productMatches = xmlText.match(/<(?:product|Product)>([\s\S]*?)<\/(?:product|Product)>/gi);
        if (!productMatches) return products;

        for (const productXml of productMatches) {
            // Check if product is disabled - skip disabled products to save storage
            const disabledRaw = this.extractXmlValue(productXml, 'ProductDisabled') ||
                this.extractXmlValue(productXml, 'productDisabled');
            const isDisabled = disabledRaw?.toLowerCase() === 'checked';

            // Skip disabled products (user preference for free Supabase tier)
            if (isDisabled) {
                continue;
            }

            // Core fields - support both lowercase and PascalCase
            const sku = this.extractXmlValue(productXml, 'sku') || this.extractXmlValue(productXml, 'SKU');
            const name = this.extractXmlValue(productXml, 'name') || this.extractXmlValue(productXml, 'Name');

            // Brand from custom ProductFields (moved up for filtering)
            const brandName = this.extractXmlValue(productXml, 'ProductField16') ||
                this.extractXmlValue(productXml, 'Brand') ||
                this.extractXmlValue(productXml, 'brand');

            // Skip products without SKU or Name
            // Brand is optional; downstream sync will handle missing brand.
            if (!sku || !name) {
                continue;
            }

            const price = parseFloat(this.extractXmlValue(productXml, 'price') || this.extractXmlValue(productXml, 'Price') || '0');
            const saleAmountRaw = this.extractXmlValue(productXml, 'SaleAmount') || this.extractXmlValue(productXml, 'saleAmount');
            const saleAmount = saleAmountRaw ? parseFloat(saleAmountRaw) : undefined;

            const description = this.extractXmlValue(productXml, 'ProductDescription') ||
                this.extractXmlValue(productXml, 'description') ||
                this.extractXmlValue(productXml, 'Name');

            const quantityOnHandRaw = this.extractXmlValue(productXml, 'QuantityOnHand') ||
                this.extractXmlValue(productXml, 'quantity_on_hand') ||
                this.extractXmlValue(productXml, 'Quantity') || '0';
            const quantityOnHand = parseInt(quantityOnHandRaw, 10) || 0;

            const lowStockRaw = this.extractXmlValue(productXml, 'LowStockThreshold');
            const lowStockThreshold = lowStockRaw ? parseInt(lowStockRaw, 10) : undefined;

            const outOfStockLimitRaw = this.extractXmlValue(productXml, 'OutOfStockLimit');
            const outOfStockLimit = outOfStockLimitRaw ? parseInt(outOfStockLimitRaw, 10) : undefined;

            // Image - primary graphic
            let imageUrl = this.extractXmlValue(productXml, 'Graphic') || this.extractXmlValue(productXml, 'graphic');
            if (imageUrl === 'none') imageUrl = '';

            // Additional images (MoreInfoImage1-20)
            const additionalImages: string[] = [];
            for (let i = 1; i <= 20; i++) {
                const img = this.extractXmlValue(productXml, `MoreInfoImage${i}`);
                if (img && img !== 'none') {
                    additionalImages.push(img);
                }
            }

            // Physical properties
            const weight = parseFloat(this.extractXmlValue(productXml, 'Weight') || this.extractXmlValue(productXml, 'weight') || '0');
            const taxableRaw = this.extractXmlValue(productXml, 'Taxable') || this.extractXmlValue(productXml, 'taxable');
            const taxableNormalized = taxableRaw?.trim().toLowerCase();
            const taxable = taxableNormalized === 'checked' || taxableNormalized === 'yes' || taxableNormalized === 'true' || taxableNormalized === '1';

            const fulfillmentType = this.extractXmlValue(productXml, 'ProductType') ||
                this.extractXmlValue(productXml, 'ProdType') ||
                this.extractXmlValue(productXml, 'prod_type');

            // ShopSite identifiers
            const productId = this.extractXmlValue(productXml, 'ProductID');
            const productGuid = this.extractXmlValue(productXml, 'ProductGUID');
            const gtin = this.extractXmlValue(productXml, 'GTIN') || this.extractXmlValue(productXml, 'gtin');

            // Brand extraction moved up
            const categoryName = this.extractXmlValue(productXml, 'ProductField24');
            const productTypeName = this.extractXmlValue(productXml, 'ProductField25');

            // Availability and status
            const availability = this.extractXmlValue(productXml, 'Availability') || this.extractXmlValue(productXml, 'availability');

            // SEO and content
            const fileName = this.extractXmlValue(productXml, 'FileName');
            const moreInfoText = this.extractXmlValue(productXml, 'MoreInformationText');
            const searchKeywords = this.extractXmlValue(productXml, 'SearchKeywords');
            const googleProductCategory = this.extractXmlValue(productXml, 'GoogleProductCategory');

            // Categorization from ProductOnPages
            const shopsitePages: string[] = [];
            const pagesBlock = this.extractXmlValue(productXml, 'ProductOnPages');
            if (pagesBlock) {
                const pageMatches = pagesBlock.match(/<Name>([\s\S]*?)<\/Name>/gi);
                if (pageMatches) {
                    for (const pageNameTag of pageMatches) {
                        const name = pageNameTag.replace(/<\/?Name>/gi, '').trim();
                        if (name) shopsitePages.push(name);
                    }
                }
            }

            // Ordering controls
            const minQtyRaw = this.extractXmlValue(productXml, 'MinimumQuantity');
            const minimumQuantity = minQtyRaw ? parseInt(minQtyRaw, 10) : undefined;

            products.push({
                sku,
                name,
                price,
                saleAmount,
                description,
                quantityOnHand,
                lowStockThreshold,
                imageUrl,
                additionalImages: additionalImages.length > 0 ? additionalImages : undefined,
                weight,
                taxable,
                fulfillmentType,
                productId,
                productGuid,
                gtin,
                brandName,
                categoryName,
                productTypeName,
                isDisabled,
                availability,
                fileName,
                moreInfoText,
                searchKeywords,
                minimumQuantity,
                outOfStockLimit,
                googleProductCategory,
                shopsitePages,
                isSpecialOrder: this.extractXmlValue(productXml, 'ProductField11')?.toLowerCase() === 'yes',
                rawXml: productXml,
            });

            // Respect limit if specified
            if (limit && products.length >= limit) {
                break;
            }
        }

        return products;
    }

    private parseOrdersXml(xmlText: string): ShopSiteOrder[] {
        const orders: ShopSiteOrder[] = [];
        const startTag = '<Order>';
        const endTag = '</Order>';
        let searchPos = 0;

        // Iterate through the XML using indexOf (much faster than global regex on large files)
        while (true) {
            const startIdx = xmlText.indexOf(startTag, searchPos);
            if (startIdx === -1) break;

            const endIdx = xmlText.indexOf(endTag, startIdx);
            if (endIdx === -1) break;

            // Force a string copy to avoid retaining reference to the huge parent string
            const orderXml = (' ' + xmlText.substring(startIdx, endIdx + endTag.length)).slice(1);
            searchPos = endIdx + endTag.length;

            // Extract order-level fields (PascalCase per DTD)
            const orderNumber = this.extractXmlValue(orderXml, 'OrderNumber');
            const transactionId = this.extractXmlValue(orderXml, 'ShopSiteTransactionID');
            const orderDate = this.extractXmlValue(orderXml, 'OrderDate');

            // Extract customer email and address from Billing section
            const billingMatch = orderXml.match(/<Billing>([\s\S]*?)<\/Billing>/i);
            const customerEmail = billingMatch
                ? this.extractXmlValue(billingMatch[1], 'Email') || ''
                : '';

            const billingAddress = billingMatch ? this.parseAddressXml(billingMatch[1]) : undefined;

            // Extract Shipping address
            const shippingMatch = orderXml.match(/<Shipping>([\s\S]*?)<\/Shipping>/i);
            const shippingAddress = shippingMatch ? this.parseAddressXml(shippingMatch[1]) : undefined;

            // Extract Payment Method
            const paymentMatch = orderXml.match(/<Payment>([\s\S]*?)<\/Payment>/i);
            let paymentMethod = '';
            if (paymentMatch) {
                // Try to find first tag inside Payment that isn't empty self-closing if possible, or just take the tag name
                // Simple heuristic: check for common ones
                if (paymentMatch[1].includes('<CreditCard>')) paymentMethod = 'CreditCard';
                else if (paymentMatch[1].includes('<PayPalExpress>')) paymentMethod = 'PayPalExpress';
                else if (paymentMatch[1].includes('<Check>')) paymentMethod = 'Check';
                else if (paymentMatch[1].includes('<PurchaseOrder>')) paymentMethod = 'PurchaseOrder';
                else paymentMethod = 'Other';
            }

            // Extract totals from Totals section
            const totalsMatch = orderXml.match(/<Totals>([\s\S]*?)<\/Totals>/i);
            let grandTotal = 0;
            let tax = 0;
            let shippingTotal = 0;
            if (totalsMatch) {
                grandTotal = parseFloat(this.extractXmlValue(totalsMatch[1], 'GrandTotal') || '0');
                const taxMatch = totalsMatch[1].match(/<Tax>([\s\S]*?)<\/Tax>/i);
                if (taxMatch) {
                    tax = parseFloat(this.extractXmlValue(taxMatch[1], 'TaxAmount') || '0');
                }
                const shippingTotalMatch = totalsMatch[1].match(/<ShippingTotal>([\s\S]*?)<\/ShippingTotal>/i);
                if (shippingTotalMatch) {
                    shippingTotal = parseFloat(this.extractXmlValue(shippingTotalMatch[1], 'Total') || '0');
                }
            }

            // Parse order items from Shipping/Products/Product
            const items: ShopSiteOrderItem[] = [];
            if (shippingMatch) {
                const productsMatch = shippingMatch[1].match(/<Products>([\s\S]*?)<\/Products>/i);
                if (productsMatch) {
                    // Use indexOf for products too
                    const productsXml = productsMatch[1];
                    let productPos = 0;
                    while (true) {
                        const pStart = productsXml.indexOf('<Product>', productPos);
                        if (pStart === -1) break;
                        const pEnd = productsXml.indexOf('</Product>', pStart);
                        if (pEnd === -1) break;

                        const productXml = productsXml.substring(pStart, pEnd + 10);
                        productPos = pEnd + 10;

                        const itemSku = this.extractXmlValue(productXml, 'SKU');
                        const quantity = parseInt(this.extractXmlValue(productXml, 'Quantity') || '0', 10);
                        const itemPrice = parseFloat(this.extractXmlValue(productXml, 'ItemPrice') || '0');

                        if (itemSku) {
                            items.push({ sku: itemSku, quantity, price: itemPrice });
                        }
                    }
                }
            }

            if (orderNumber) {
                orders.push({
                    orderNumber,
                    transactionId,
                    orderDate,
                    grandTotal,
                    tax,
                    shippingTotal,
                    customerEmail,
                    billingAddress,
                    shippingAddress,
                    paymentMethod,
                    items,
                    rawXml: orderXml,
                });
            }
        }

        console.log(`[ShopSite] Parsed ${orders.length} orders from XML`);
        return orders;
    }

    private parseCustomersXml(xmlText: string, limit?: number): ShopSiteCustomer[] {
        const customers: ShopSiteCustomer[] = [];

        const customerMatches = xmlText.match(/<customer>([\s\S]*?)<\/customer>/gi);
        if (!customerMatches) return customers;

        for (const customerXml of customerMatches) {
            const email = this.extractXmlValue(customerXml, 'email');
            const firstName = this.extractXmlValue(customerXml, 'first_name');
            const lastName = this.extractXmlValue(customerXml, 'last_name');
            const billingAddress = this.extractXmlValue(customerXml, 'billing_address');
            const billingCity = this.extractXmlValue(customerXml, 'billing_city');
            const billingState = this.extractXmlValue(customerXml, 'billing_state');
            const billingZip = this.extractXmlValue(customerXml, 'billing_zip');

            if (email) {
                customers.push({
                    email,
                    firstName,
                    lastName,
                    billingAddress,
                    billingCity,
                    billingState,
                    billingZip,
                    rawXml: customerXml,
                });

                // Respect limit if specified
                if (limit && customers.length >= limit) {
                    break;
                }
            }
        }

        return customers;
    }

    /**
     * Decode XML/HTML entities
     */
    private decodeXmlEntities(str: string): string {
        if (!str) return str;

        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&copy;/g, '©')
            .replace(/&reg;/g, '®')
            .replace(/&trade;/g, '™')
            .replace(/&ndash;/g, '–')
            .replace(/&mdash;/g, '—')
            .replace(/&pound;/g, '£')
            .replace(/&euro;/g, '€')
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }

    /**
     * Extract a value from XML using regex.
     * This is a simple approach that works for flat XML structures.
     */
    private extractXmlValue(xml: string, tag: string): string {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
        const match = xml.match(regex);
        let value = match ? match[1].trim() : '';

        // Handle CDATA if present
        if (value.startsWith('<![CDATA[')) {
            value = value.substring(9, value.length - 3);
        }

        return this.decodeXmlEntities(value);
    }

    /**
     * Parse AddressInfo from a Billing or Shipping XML block
     */
    private parseAddressXml(xml: string): AddressInfo {
        const fullName = this.extractXmlValue(xml, 'FullName');
        const company = this.extractXmlValue(xml, 'Company');
        const phone = this.extractXmlValue(xml, 'Phone');

        // Address block is nested
        const addressMatch = xml.match(/<Address>([\s\S]*?)<\/Address>/i);
        let street1 = '';
        let street2 = '';
        let city = '';
        let state = '';
        let zip = '';
        let country = '';

        if (addressMatch) {
            const addrXml = addressMatch[1];
            street1 = this.extractXmlValue(addrXml, 'Street1');
            street2 = this.extractXmlValue(addrXml, 'Street2');
            city = this.extractXmlValue(addrXml, 'City');
            state = this.extractXmlValue(addrXml, 'State');
            zip = this.extractXmlValue(addrXml, 'Code');
            country = this.extractXmlValue(addrXml, 'Country');
        }

        return {
            fullName,
            company,
            phone,
            street1,
            street2,
            city,
            state,
            zip,
            country
        };
    }
}
