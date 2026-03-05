/**
 * Download ShopSite XML data for schema analysis
 * 
 * Usage: npx tsx --env-file=.env.local scripts/download-shopsite-xml.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
    console.log('🔄 Fetching ShopSite credentials from Supabase...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'shopsite_migration')
        .single();

    if (error || !data) {
        console.error('❌ Failed to get credentials:', error?.message || 'No credentials found');
        console.log('   Make sure you have configured credentials in /admin/migration first.');
        process.exit(1);
    }

    const { storeUrl, merchantId, password } = data.value as {
        storeUrl: string;
        merchantId: string;
        password: string;
    };

    console.log(`📡 Connecting to: ${storeUrl}`);

    // Build auth header
    const authHeader = 'Basic ' + Buffer.from(`${merchantId}:${password}`).toString('base64');

    // Normalize URL
    let baseUrl = storeUrl.replace(/\/$/, '');
    if (baseUrl.endsWith('.cgi')) {
        const lastSlash = baseUrl.lastIndexOf('/');
        if (lastSlash !== -1) {
            baseUrl = baseUrl.substring(0, lastSlash);
        }
    }

    const outputDir = path.join(process.cwd(), 'docs', 'shopsite-data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Download products
    console.log('📦 Downloading products XML (Limit: 100 items)...');
    try {
        const productsRes = await fetch(`${baseUrl}/db_xml.cgi?action=download&type=products`, {
            headers: { 'Authorization': authHeader },
        });

        if (productsRes.ok && productsRes.body) {
            const productsPath = path.join(outputDir, 'products.xml');
            const fileStream = fs.createWriteStream(productsPath);

            // Use streaming to limit download size
            const reader = productsRes.body.getReader();
            const decoder = new TextDecoder();
            let content = '';
            const productCount = 0;
            const limit = 100; // Hardcoded limit for testing efficiency

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    content += chunk;

                    // Count products
                    const matches = content.match(/<\/Product>/gi);
                    if (matches && matches.length >= limit) {
                        console.log(`   🛑 Limit of ${limit} products reached. Stopping download.`);
                        await reader.cancel();
                        break;
                    }
                }
            } catch (e) {
                // Ignore cancel errors
            } finally {
                // Ensure valid XML termination
                if (!content.trim().endsWith('</ShopSiteProducts>')) {
                    const lastProductEnd = content.lastIndexOf('</Product>');
                    if (lastProductEnd !== -1) {
                        content = content.substring(0, lastProductEnd + 10);
                        content += '\n</ShopSiteProducts>';
                    }
                }

                fs.writeFileSync(productsPath, content);
                console.log(`   ✅ Saved to ${productsPath} (${(content.length / 1024).toFixed(1)} KB)`);
            }
        } else {
            console.log(`   ❌ Failed: ${productsRes.status} ${productsRes.statusText}`);
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    // Download orders
    console.log('📋 Downloading orders XML...');
    try {
        const ordersRes = await fetch(`${baseUrl}/db_xml.cgi?action=download&type=orders`, {
            headers: { 'Authorization': authHeader },
        });
        if (ordersRes.ok) {
            const ordersXml = await ordersRes.text();
            const ordersPath = path.join(outputDir, 'orders.xml');
            fs.writeFileSync(ordersPath, ordersXml);
            console.log(`   ✅ Saved to ${ordersPath} (${(ordersXml.length / 1024).toFixed(1)} KB)`);
        } else {
            console.log(`   ❌ Failed: ${ordersRes.status} ${ordersRes.statusText}`);
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    // Download customers
    console.log('👥 Downloading customers XML...');
    try {
        const customersRes = await fetch(`${baseUrl}/db_xml.cgi?action=download&type=customers`, {
            headers: { 'Authorization': authHeader },
        });
        if (customersRes.ok) {
            const customersXml = await customersRes.text();
            const customersPath = path.join(outputDir, 'customers.xml');
            fs.writeFileSync(customersPath, customersXml);
            console.log(`   ✅ Saved to ${customersPath} (${(customersXml.length / 1024).toFixed(1)} KB)`);
        } else {
            console.log(`   ❌ Failed: ${customersRes.status} ${customersRes.statusText}`);
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    console.log('\n✨ Done! Check docs/shopsite-data/ for the XML files.');
}

main().catch(console.error);
