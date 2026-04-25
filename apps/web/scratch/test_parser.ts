import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';
import fs from 'fs';

async function main() {
    const client = new ShopSiteClient({
        storeUrl: 'https://example.com',
        merchantId: 'test',
        password: 'test'
    });

    const xml = fs.readFileSync('../../temp/web_inventory032126.xml', 'utf-8');
    const products = (client as any).parseProductsXml(xml);

    console.log(`Parsed ${products.length} products`);
    let count = 0;
    for (let i = 0; i < Math.min(100, products.length); i++) {
        if (products[i].categoryName) {
            count++;
            console.log(`Product ${i}: ${products[i].categoryName} > ${products[i].productTypeName}`);
        }
    }
    console.log(`Found ${count} with categories in first 100`);
}

main();