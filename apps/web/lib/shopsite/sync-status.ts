import { createAdminClient } from '@/lib/supabase/server';
import type { ShopSiteSyncStatus } from '@/lib/types';

interface ProductSyncPatch {
  productId: string;
  syncStatus: ShopSiteSyncStatus;
  lastSyncedAt?: string | null;
  lastUploadedAt?: string | null;
  lastSyncError?: string | null;
  metadata?: Record<string, unknown>;
}

interface ShopSiteSyncBySkuOptions {
  skus: string[];
  syncStatus: ShopSiteSyncStatus;
  lastSyncedAt?: string | null;
  lastUploadedAt?: string | null;
  lastSyncError?: string | null;
  metadata?: Record<string, unknown>;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}

export async function upsertShopSiteSyncByProductIds(
  patches: ProductSyncPatch[],
): Promise<void> {
  const normalizedPatches = patches.filter((patch) => patch.productId.trim().length > 0);
  if (normalizedPatches.length === 0) {
    return;
  }

  const supabase = await createAdminClient();
  const { data: externalSource, error: externalSourceError } = await supabase
    .from('external_sources')
    .select('id')
    .eq('key', 'shopsite')
    .maybeSingle();

  if (externalSourceError) {
    throw new Error(`Failed to resolve ShopSite external source: ${externalSourceError.message}`);
  }

  const externalSourceId = externalSource?.id ?? null;
  if (!externalSourceId) {
    throw new Error('ShopSite external source is not configured.');
  }

  const rows = normalizedPatches.map((patch) => ({
    product_id: patch.productId,
    external_source_id: externalSourceId,
    sync_status: patch.syncStatus,
    last_synced_at: patch.lastSyncedAt ?? null,
    last_uploaded_at: patch.lastUploadedAt ?? null,
    last_sync_error: patch.lastSyncError ?? null,
    metadata: patch.metadata ?? {},
  }));

  const { error } = await supabase
    .from('shopsite_product_sync')
    .upsert(rows, { onConflict: 'product_id,external_source_id' });

  if (error) {
    throw new Error(`Failed to persist ShopSite sync rows: ${error.message}`);
  }
}

async function upsertShopSiteSyncBySkus(
  options: ShopSiteSyncBySkuOptions,
): Promise<{ matchedCount: number; missingSkus: string[] }> {
  const skus = uniqueNonEmpty(options.skus);
  if (skus.length === 0) {
    return { matchedCount: 0, missingSkus: [] };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, sku')
    .in('sku', skus);

  if (error) {
    throw new Error(`Failed to resolve products for ShopSite sync: ${error.message}`);
  }

  const products = (data ?? []) as Array<{ id: string; sku: string | null }>;
  const productIdBySku = new Map<string, string>();

  for (const product of products) {
    if (product.sku) {
      productIdBySku.set(product.sku, product.id);
    }
  }

  const missingSkus = skus.filter((sku) => !productIdBySku.has(sku));
  const patches: ProductSyncPatch[] = [];

  for (const sku of skus) {
    const productId = productIdBySku.get(sku);
    if (!productId) {
      continue;
    }

    patches.push({
      productId,
      syncStatus: options.syncStatus,
      lastSyncedAt: options.lastSyncedAt ?? null,
      lastUploadedAt: options.lastUploadedAt ?? null,
      lastSyncError: options.lastSyncError ?? null,
      metadata: options.metadata,
    });
  }

  await upsertShopSiteSyncByProductIds(patches);

  return {
    matchedCount: patches.length,
    missingSkus,
  };
}

export async function markShopSiteSyncFailureBySkus(
  skus: string[],
  message: string,
): Promise<void> {
  await upsertShopSiteSyncBySkus({
    skus,
    syncStatus: 'failed',
    lastSyncError: message,
    metadata: {
      failure_recorded_at: new Date().toISOString(),
    },
  });
}

export async function markShopSiteSyncSuccessBySkus(
  skus: string[],
  syncedAt: string,
): Promise<void> {
  await upsertShopSiteSyncBySkus({
    skus,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt,
    lastUploadedAt: syncedAt,
    lastSyncError: null,
    metadata: {
      synced_at: syncedAt,
    },
  });
}
