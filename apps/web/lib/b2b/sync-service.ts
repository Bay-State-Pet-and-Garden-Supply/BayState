'use server';

import { createClient } from '@/lib/supabase/server';
import { B2BFactory } from './factory';
import {
  B2BConfig,
  B2BFeed,
  B2BSyncJob,
  B2BProduct,
  DistributorCode,
  SyncJobType,
} from './types';

export interface SyncResult {
  success: boolean;
  jobId?: string;
  productsFetched?: number;
  productsCreated?: number;
  productsUpdated?: number;
  error?: string;
}

export async function getB2BFeeds(): Promise<B2BFeed[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('b2b_feeds')
    .select('*')
    .order('display_name');

  if (error) {
    console.error('[B2B Sync] Failed to fetch feeds:', error);
    return [];
  }

  return data as B2BFeed[];
}

export async function getB2BFeed(distributorCode: DistributorCode): Promise<B2BFeed | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('b2b_feeds')
    .select('*')
    .eq('distributor_code', distributorCode)
    .single();

  if (error) {
    console.error('[B2B Sync] Failed to fetch feed:', error);
    return null;
  }

  return data as B2BFeed;
}

export async function getSyncJobs(
  feedId?: string,
  limit: number = 20
): Promise<B2BSyncJob[]> {
  const supabase = await createClient();
  
  let query = supabase
    .from('b2b_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (feedId) {
    query = query.eq('feed_id', feedId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[B2B Sync] Failed to fetch sync jobs:', error);
    return [];
  }

  return data as B2BSyncJob[];
}

export async function getCredentials(
  distributorCode: DistributorCode
): Promise<B2BConfig | null> {
  const supabase = await createClient();

  const keys = [
    `b2b_${distributorCode.toLowerCase()}_username`,
    `b2b_${distributorCode.toLowerCase()}_password`,
    `b2b_${distributorCode.toLowerCase()}_api_key`,
    `b2b_${distributorCode.toLowerCase()}_api_secret`,
  ];

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', keys);

  if (error || !data || data.length === 0) {
    return null;
  }

  const settings: Record<string, string> = {};
  for (const row of data) {
    const shortKey = row.key.replace(`b2b_${distributorCode.toLowerCase()}_`, '');
    settings[shortKey] = row.value;
  }

  return {
    username: settings['username'],
    password: settings['password'],
    apiKey: settings['api_key'],
    apiSecret: settings['api_secret'],
  };
}

export async function triggerSync(
  distributorCode: DistributorCode,
  jobType: SyncJobType = 'catalog'
): Promise<SyncResult> {
  const supabase = await createClient();

  const feed = await getB2BFeed(distributorCode);
  if (!feed) {
    return { success: false, error: `Feed not found: ${distributorCode}` };
  }

  if (!feed.enabled) {
    return { success: false, error: `Feed is disabled: ${distributorCode}` };
  }

  const credentials = await getCredentials(distributorCode);
  if (!credentials) {
    return { success: false, error: `No credentials configured for ${distributorCode}` };
  }

  const config: B2BConfig = {
    ...credentials,
    ...(feed.config as B2BConfig),
  };

  const { data: job, error: jobError } = await supabase
    .from('b2b_sync_jobs')
    .insert({
      feed_id: feed.id,
      job_type: jobType,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError || !job) {
    console.error('[B2B Sync] Failed to create job:', jobError);
    return { success: false, error: 'Failed to create sync job' };
  }

  try {
    const client = B2BFactory.getClient(distributorCode, config);
    let products: B2BProduct[] = [];

    switch (jobType) {
      case 'catalog':
      case 'full':
        products = await client.fetchCatalog();
        break;
      case 'inventory':
        console.warn('[B2B Sync] Inventory-only sync requires existing SKU list');
        break;
      case 'pricing':
        console.warn('[B2B Sync] Pricing-only sync requires existing SKU list');
        break;
    }

    const { created, updated, failed } = await upsertToIngestion(products, distributorCode);

    await supabase
      .from('b2b_sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        products_fetched: products.length,
        products_created: created,
        products_updated: updated,
        products_failed: failed,
      })
      .eq('id', job.id);

    await supabase
      .from('b2b_feeds')
      .update({
        status: 'healthy',
        last_sync_at: new Date().toISOString(),
        last_sync_job_id: job.id,
        products_count: products.length,
      })
      .eq('id', feed.id);

    return {
      success: true,
      jobId: job.id,
      productsFetched: products.length,
      productsCreated: created,
      productsUpdated: updated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    console.error('[B2B Sync] Sync failed:', message);

    await supabase
      .from('b2b_sync_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq('id', job.id);

    await supabase
      .from('b2b_feeds')
      .update({ status: 'degraded' })
      .eq('id', feed.id);

    return { success: false, jobId: job.id, error: message };
  }
}

async function upsertToIngestion(
  products: B2BProduct[],
  distributorCode: DistributorCode
): Promise<{ created: number; updated: number; failed: number }> {
  const supabase = await createClient();
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const product of products) {
    try {
      const sku = product.distributorSku;
      
      const { data: existing } = await supabase
        .from('products_ingestion')
        .select('sku, b2b_sources')
        .eq('sku', sku)
        .single();

      const b2bData = {
        distributorSku: product.distributorSku,
        upc: product.upc,
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: product.category,
        price: product.price,
        cost: product.cost,
        quantity: product.quantity,
        weight: product.weight,
        images: product.images,
        syncedAt: new Date().toISOString(),
      };

      if (existing) {
        const currentSources = (existing.b2b_sources || {}) as Record<string, unknown>;
        const updatedSources = { ...currentSources, [distributorCode]: b2bData };

        await supabase
          .from('products_ingestion')
          .update({
            b2b_sources: updatedSources,
            updated_at: new Date().toISOString(),
          })
          .eq('sku', sku);

        updated++;
      } else {
        await supabase
          .from('products_ingestion')
          .insert({
            sku,
            input: { name: product.name, price: product.price },
            b2b_sources: { [distributorCode]: b2bData },
            pipeline_status: 'staging',
          });

        created++;
      }
    } catch (error) {
      console.error('[B2B Sync] Failed to upsert product:', error);
      failed++;
    }
  }

  return { created, updated, failed };
}

export async function testFeedConnection(
  distributorCode: DistributorCode
): Promise<{ success: boolean; error?: string }> {
  const feed = await getB2BFeed(distributorCode);
  if (!feed) {
    return { success: false, error: 'Feed not found' };
  }

  const credentials = await getCredentials(distributorCode);
  if (!credentials) {
    return { success: false, error: 'No credentials configured' };
  }

  const config: B2BConfig = {
    ...credentials,
    ...(feed.config as B2BConfig),
  };

  try {
    const client = B2BFactory.getClient(distributorCode, config);
    const healthy = await client.healthCheck();
    return { success: healthy, error: healthy ? undefined : 'Health check failed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    return { success: false, error: message };
  }
}

export async function updateFeedConfig(
  distributorCode: DistributorCode,
  updates: Partial<Pick<B2BFeed, 'enabled' | 'sync_frequency' | 'config'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('b2b_feeds')
    .update(updates)
    .eq('distributor_code', distributorCode);

  if (error) {
    console.error('[B2B Sync] Failed to update feed config:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
