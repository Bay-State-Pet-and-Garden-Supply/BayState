import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { getExternalSourceIdByKey } from '../lib/admin/external-sources';
import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';
import {
  importShopSiteProductsBatched,
  syncExistingProductsIngestionInputFromShopSite,
} from '../lib/admin/migration/product-import-batched';
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

async function startIntegrationSyncRun(
  supabase: SupabaseClient,
  fileName?: string,
): Promise<string | null> {
  const externalSourceId = await getExternalSourceIdByKey(supabase, 'shopsite');

  const { data, error } = await supabase
    .from('integration_sync_runs')
    .insert({
      external_source_id: externalSourceId,
      source_type: 'shopsite',
      source_system: 'shopsite_15',
      sync_kind: 'products',
      status: 'running',
      file_name: fileName ?? null,
      metadata: {
        legacy_adapter: 'migration_log',
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create integration sync run:', error.message);
    return null;
  }

  return data?.id ?? null;
}

async function completeIntegrationSyncRun(
  supabase: SupabaseClient,
  syncRunId: string,
  result: SyncResult,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('integration_sync_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: result.success ? 'completed' : (result.failed > 0 && result.created > 0 ? 'partial' : 'failed'),
      row_count: result.processed,
      inserted_count: result.created,
      updated_count: result.updated,
      error_count: result.failed,
      error_summary: result.errors[0]?.error ?? null,
      metadata: {
        ...metadata,
        legacy_adapter: 'migration_log',
        errors: result.errors,
      },
    })
    .eq('id', syncRunId);

  if (error) {
    console.error('Failed to complete integration sync run:', error.message);
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY.');
  }

  const limitArg = getArgValue('limit');
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
  if (limitArg && Number.isNaN(limit)) {
    throw new Error(`Invalid --limit value: ${limitArg}`);
  }

  const xmlFile = getArgValue('xml-file');

  const supabase: SupabaseClient = createClient(supabaseUrl, secretKey, {
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

  const syncRunId = await startIntegrationSyncRun(supabase, xmlFile);
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
      purgeMissingProducts: limit === undefined,
      logProgress: async (processed, total) => {
        if (processed % 500 === 0 || processed === total) {
          console.log(`[Progress] ${processed}/${total} products processed...`);
        }
      },
    });

    const pipelineInputSync = await syncExistingProductsIngestionInputFromShopSite({
      supabase,
      shopSiteProducts,
    });

    console.log(`Synced ShopSite input into ${pipelineInputSync.updated} pipeline rows`);

    if (syncRunId) {
      await completeIntegrationSyncRun(supabase, syncRunId, result, {
        pipeline_input_updated: pipelineInputSync.updated,
        xml_file: xmlFile ?? null,
      });
    }

    console.log('ShopSite sync complete');
    console.log(JSON.stringify({
      success: result.success,
      processed: result.processed,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      errorCount: result.errors.length,
      pipelineInputUpdated: pipelineInputSync.updated,
      duration: result.duration,
    }, null, 2));

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (syncError) {
    const result: SyncResult = {
      success: false,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 1,
      errors: [{
        record: 'N/A',
        error: syncError instanceof Error ? syncError.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }],
      duration: Date.now() - startedAt,
    };

    if (syncRunId) {
      await completeIntegrationSyncRun(supabase, syncRunId, result, {
        xml_file: xmlFile ?? null,
      });
    }

    throw syncError;
  }
}

main().catch((error) => {
  console.error('ShopSite bulk sync failed:', error);
  process.exit(1);
});
