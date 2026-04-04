import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';
import type { ShopSiteConfig } from '../lib/admin/migration/shopsite-client';
import { importShopSiteProductsBatched } from '../lib/admin/migration/product-import-batched';

const MIGRATION_SETTINGS_KEY = 'shopsite_migration';

function getArgValue(name: string): string | undefined {
    const exact = process.argv.find((arg) => arg === `--${name}`);
    if (exact) {
        const next = process.argv[process.argv.indexOf(exact) + 1];
        return next && !next.startsWith('--') ? next : 'true';
    }

    const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return prefixed?.split('=').slice(1).join('=');
}

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    const limitArg = getArgValue('limit');
    const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
    if (limitArg && Number.isNaN(limit)) {
        throw new Error(`Invalid --limit value: ${limitArg}`);
    }

    const xmlFile = getArgValue('xml-file');

    const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MIGRATION_SETTINGS_KEY)
        .single();

    if (error || !data) {
        throw new Error(`Failed to load ShopSite credentials from site_settings: ${error?.message ?? 'missing row'}`);
    }

    const credentials = data.value as ShopSiteConfig;

    console.log('Starting ShopSite product sync (BATCHED)...');
    if (limit) {
        console.log(`Limit enabled: ${limit} products`);
    }
    if (xmlFile) {
        console.log(`Using local ShopSite XML file: ${xmlFile}`);
    }

    const startedAt = Date.now();

    try {
        const client = new ShopSiteClient(credentials);
        const shopSiteProducts = xmlFile
            ? client.parseProductsXml(
                ShopSiteClient.sanitizeXml(await readFile(xmlFile, 'latin1')),
                limit,
                { includeRawXml: false },
            )
            : await client.fetchProducts(limit, { includeRawXml: false });

        console.log(`${xmlFile ? 'Loaded' : 'Downloaded'} ${shopSiteProducts.length} ShopSite products`);

        const result = await importShopSiteProductsBatched({
            supabase,
            shopSiteProducts,
            logProgress: async (processed, total) => {
                const percent = ((processed / total) * 100).toFixed(1);
                console.log(`Progress: ${processed}/${total} (${percent}%)`);
            },
        });

        const duration = Date.now() - startedAt;

        console.log('ShopSite sync complete');
        console.log(JSON.stringify({
            success: result.success,
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            errorCount: result.errors.length,
            crossSellStats: result.crossSellStats,
            duration,
        }, null, 2));

        if (!result.success) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error('ShopSite bulk sync failed:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('ShopSite bulk sync failed:', error);
    process.exit(1);
});
