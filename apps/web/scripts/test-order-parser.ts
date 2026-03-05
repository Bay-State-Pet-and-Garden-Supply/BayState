
import * as fs from 'fs';

// Mock types
interface ShopSiteOrder {
    orderNumber: string;
    orderDate?: string;
    grandTotal: number;
    tax: number;
    shippingTotal: number;
    customerEmail?: string | null;
    items: { sku: string; quantity: number; price: number }[];
}

function extractXmlValue(xml: string, tagName: string): string | null {
    const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'i'));
    return match ? match[1] : null;
}

function parseOrdersXml(xmlText: string): ShopSiteOrder[] {
    console.log(`Parsing XML length: ${xmlText.length}`);
    const orders: ShopSiteOrder[] = [];
    const startTag = '<Order>';
    const endTag = '</Order>';
    let searchPos = 0;

    let count = 0;

    // Iterate through the XML using indexOf (much faster than global regex on large files)
    while (true) {
        const startIdx = xmlText.indexOf(startTag, searchPos);
        if (startIdx === -1) {
            console.log(`No more start tags found after position ${searchPos}`);
            break;
        }

        const endIdx = xmlText.indexOf(endTag, startIdx);
        if (endIdx === -1) {
            console.log(`Start tag found at ${startIdx} but no end tag!`);
            break;
        }

        const orderXml = xmlText.substring(startIdx, endIdx + endTag.length);
        searchPos = endIdx + endTag.length;
        count++;

        if (count % 1000 === 0) process.stdout.write('.');

        // Extract order-level fields (PascalCase per DTD)
        const orderNumber = extractXmlValue(orderXml, 'OrderNumber');
        const orderDate = extractXmlValue(orderXml, 'OrderDate');

        // Extract customer email from Billing section
        const billingMatch = orderXml.match(/<Billing>([\s\S]*?)<\/Billing>/i);
        const customerEmail = billingMatch
            ? extractXmlValue(billingMatch[1], 'Email') || ''
            : '';

        // Extract totals from Totals section
        const totalsMatch = orderXml.match(/<Totals>([\s\S]*?)<\/Totals>/i);
        let grandTotal = 0;
        let tax = 0;
        let shippingTotal = 0;
        if (totalsMatch) {
            grandTotal = parseFloat(extractXmlValue(totalsMatch[1], 'GrandTotal') || '0');
            // Tax is nested: <Tax><TaxAmount>...</TaxAmount></Tax>
            const taxMatch = totalsMatch[1].match(/<Tax>([\s\S]*?)<\/Tax>/i);
            if (taxMatch) {
                tax = parseFloat(extractXmlValue(taxMatch[1], 'TaxAmount') || '0');
            }
            // ShippingTotal is nested: <ShippingTotal><Total>...</Total></ShippingTotal>
            const shippingMatch = totalsMatch[1].match(/<ShippingTotal>([\s\S]*?)<\/ShippingTotal>/i);
            if (shippingMatch) {
                shippingTotal = parseFloat(extractXmlValue(shippingMatch[1], 'Total') || '0');
            }
        }

        // Parse order items from Shipping/Products/Product
        const items: { sku: string; quantity: number; price: number }[] = [];
        const shippingMatch = orderXml.match(/<Shipping>([\s\S]*?)<\/Shipping>/i);
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

                    const itemSku = extractXmlValue(productXml, 'SKU');
                    const quantity = parseInt(extractXmlValue(productXml, 'Quantity') || '0', 10);
                    const itemPrice = parseFloat(extractXmlValue(productXml, 'ItemPrice') || '0');

                    if (itemSku) {
                        items.push({ sku: itemSku, quantity, price: itemPrice });
                    }
                }
            }
        }

        if (orderNumber) {
            orders.push({
                orderNumber: orderNumber!,
                orderDate: orderDate!,
                grandTotal,
                tax,
                shippingTotal,
                customerEmail,
                items,
            });
        }
    }

    console.log('\nFinished loop.');
    return orders;
}

try {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: npx tsx scripts/test-order-parser.ts <path-to-orders.xml>');
        process.exit(1);
    }
    console.log(`Reading file: ${filePath}`);

    // Read with correct encoding
    const buffer = fs.readFileSync(filePath);
    const decoder = new TextDecoder('iso-8859-1');
    const xmlText = decoder.decode(buffer);

    console.log('File read. Starting parse...');
    const startTime = Date.now();
    const orders = parseOrdersXml(xmlText);
    const duration = Date.now() - startTime;

    console.log(`\nParsed ${orders.length} orders in ${duration}ms`);
    if (orders.length > 0) {
        console.log('Sample Order:', JSON.stringify(orders[0], null, 2));
    } else {
        console.log('WARNING: No orders found!');
        // Debug: print first 500 chars
        console.log('First 500 chars:', xmlText.substring(0, 500));
    }
} catch (err) {
    console.error('Error:', err);
}
