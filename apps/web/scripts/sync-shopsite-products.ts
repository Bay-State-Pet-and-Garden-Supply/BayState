import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';
import { importShopSiteProducts } from '../lib/admin/migration/product-import';
import type { SyncResult } from '../lib/admin/migration/types';

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

async function startLog(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase
        .from('migration_log')
        .insert({
            sync_type: 'products',
            status: 'running',
        } as never)
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create migration log:', error.message);
        return null;
    }

    return data?.id ?? null;
}

async function updateLogProgress(supabase: SupabaseClient, logId: string, result: SyncResult): Promise<void> {
    const { error } = await supabase
        .from('migration_log')
        .update({
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            errors: result.errors,
        } as never)
        .eq('id', logId);

    if (error) {
        console.error('Failed to update migration progress:', error.message);
    }
}

async function completeLog(supabase: SupabaseClient, logId: string, result: SyncResult): Promise<void> {
    const { error } = await supabase
        .from('migration_log')
        .update({
            completed_at: new Date().toISOString(),
            status: result.success ? 'completed' : 'failed',
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            duration_ms: result.duration,
            errors: result.errors,
        } as never)
        .eq('id', logId);

    if (error) {
        console.error('Failed to complete migration log:', error.message);
    }
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

    const credentials = data.value as {
        storeUrl: string;
        merchantId: string;
        password: string;
    };

    console.log('Starting ShopSite product sync...');
    if (limit) {
        console.log(`Limit enabled: ${limit} products`);
    }
    if (xmlFile) {
        console.log(`Using local ShopSite XML file: ${xmlFile}`);
    }

    const logId = await startLog(supabase);
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

        const result = await importShopSiteProducts({
            supabase,
            shopSiteProducts,
            logId: logId ?? undefined,
            updateProgress: logId
                ? async (progressResult) => updateLogProgress(supabase, logId, progressResult)
                : undefined,
        });

        if (logId) {
            await completeLog(supabase, logId, result);
        }

        console.log('ShopSite sync complete');
        console.log(JSON.stringify({
            success: result.success,
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            errorCount: result.errors.length,
            duration: result.duration,
        }, null, 2));

        if (!result.success) {
            process.exitCode = 1;
        }
    } catch (error) {
        const result: SyncResult = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{
                record: 'N/A',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            }],
            duration: Date.now() - startedAt,
        };

        if (logId) {
            await completeLog(supabase, logId, result);
        }

        throw error;
    }
}

main().catch((error) => {
    console.error('ShopSite bulk sync failed:', error);
    process.exit(1);
});
