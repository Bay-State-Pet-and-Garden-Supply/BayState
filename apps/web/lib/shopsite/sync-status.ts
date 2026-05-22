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

interface ShopSiteSyncByUpcOptions {
  upcs: string[];
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

async function upsertShopSiteSyncByUpcs(
  options: ShopSiteSyncByUpcOptions,
): Promise<{ matchedCount: number; missingUpcs: string[] }> {
  const upcs = uniqueNonEmpty(options.upcs);
  if (upcs.length === 0) {
    return { matchedCount: 0, missingUpcs: [] };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, upc')
    .in('upc', upcs);

  if (error) {
    throw new Error(`Failed to resolve products for ShopSite sync: ${error.message}`);
  }

  const products = (data ?? []) as Array<{ id: string; upc: string | null }>;
  const productIdByUpc = new Map<string, string>();

  for (const product of products) {
    if (product.upc) {
      productIdByUpc.set(product.upc, product.id);
    }
  }

  const missingUpcs = upcs.filter((upc) => !productIdByUpc.has(upc));
  const patches: ProductSyncPatch[] = [];

  for (const upc of upcs) {
    const productId = productIdByUpc.get(upc);
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
    missingUpcs,
  };
}

export async function markShopSiteSyncFailureByUpcs(
  upcs: string[],
  message: string,
): Promise<void> {
  await upsertShopSiteSyncByUpcs({
    upcs,
    syncStatus: 'failed',
    lastSyncError: message,
    metadata: {
      failure_recorded_at: new Date().toISOString(),
    },
  });
}

export async function markShopSiteSyncSuccessByUpcs(
  upcs: string[],
  syncedAt: string,
): Promise<void> {
  await upsertShopSiteSyncByUpcs({
    upcs,
    syncStatus: 'synced',
    lastSyncedAt: syncedAt,
    lastUploadedAt: syncedAt,
    lastSyncError: null,
    metadata: {
      synced_at: syncedAt,
    },
  });
}
