import { after, NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { ShopSiteClient } from "@/lib/admin/migration/shopsite-client";
import { getStoredShopSiteConfig } from "@/lib/admin/shopsite-settings";
import { loadStorefrontShopSiteExport } from "@/lib/shopsite/export-builder";
import {
  buildShopSiteNewProductTag,
  generateShopSiteXml,
} from "@/lib/shopsite/xml-generator";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

interface UploadRequestBody {
  skus?: unknown;
}

function parseSkuSelection(body: UploadRequestBody): string[] {
  if (body.skus === undefined) {
    return [];
  }

  if (!Array.isArray(body.skus)) {
    throw new Error('Expected "skus" to be an array of SKU strings');
  }

  return body.skus
    .map((sku) => (typeof sku === "string" ? sku.trim() : ""))
    .filter((sku) => sku.length > 0);
}

async function parseRequestBody(
  request: NextRequest,
): Promise<UploadRequestBody> {
  const rawBody = await request.text();
  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody) as UploadRequestBody;
}

async function markShopSiteSyncFailure(skus: string[], message: string) {
  if (skus.length === 0) {
    return;
  }

  try {
    const supabase = await createAdminClient();
    const timestamp = new Date().toISOString();
    const { error } = await supabase
      .from("products")
      .update({
        shopsite_sync_status: "failed",
        shopsite_last_sync_error: message,
        updated_at: timestamp,
      })
      .in("sku", skus);

    if (error) {
      console.error("[UploadShopSite] Failed to persist ShopSite failure status:", error);
    }
  } catch (statusError) {
    console.error("[UploadShopSite] Failed to record ShopSite failure status:", statusError);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  let exportSkus: string[] = [];
  let shopSiteUploadCompleted = false;

  try {
    const body = await parseRequestBody(request);
    const skus = parseSkuSelection(body);
    const { products } = await loadStorefrontShopSiteExport({
      skus: skus.length > 0 ? skus : undefined,
    });

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No export-ready storefront products available for ShopSite upload" },
        { status: 404 },
      );
    }

    exportSkus = products.map((product) => product.sku);

    const config = await getStoredShopSiteConfig();
    if (!config) {
      return NextResponse.json(
        {
          error:
            "ShopSite settings are incomplete. Please configure the store URL, merchant ID, and password in Admin Settings.",
        },
        { status: 400 },
      );
    }

    const marker = buildShopSiteNewProductTag();
    const xml = generateShopSiteXml(products, { newProductTag: marker });
    const client = new ShopSiteClient(config);

    const uploadResult = await client.uploadProductsXml(xml, {
      uniqueName: "SKU (Products)",
      publish: false,
    });
    shopSiteUploadCompleted = true;

    const publishOptions = {
      htmlpages: true,
      index: true,
    };

    const syncedAt = new Date().toISOString();
    const supabase = await createAdminClient();

    const { error: productSyncError } = await supabase
      .from("products")
      .update({
        shopsite_sync_status: "synced",
        shopsite_last_synced_at: syncedAt,
        shopsite_last_sync_error: null,
        updated_at: syncedAt,
      })
      .in("sku", exportSkus);

    if (productSyncError) {
      throw new Error(
        `ShopSite upload succeeded, but failed to record storefront sync status: ${productSyncError.message}`,
      );
    }

    const { error: statusError } = await supabase
      .from("products_ingestion")
      .update({
        exported_at: syncedAt,
        updated_at: syncedAt,
      })
      .in("sku", exportSkus)
      .eq("pipeline_status", "exporting");

    if (statusError) {
      throw new Error(
        `ShopSite upload succeeded, but failed to retire exported products from the active pipeline: ${statusError.message}`,
      );
    }

    after(async () => {
      try {
        await client.publishStore(publishOptions, uploadResult.publishCookieHeader);
      } catch (publishError) {
        console.error("[UploadShopSite] Background publish failed:", publishError);
      }
    });

    const publishWarning =
      "ShopSite import completed. Storefront generation is running in the background and may take a few minutes to finish.";

    return NextResponse.json({
      success: true,
      uploadedCount: products.length,
      uploadedSkus: exportSkus,
      marker,
      publishWarning,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to sync products to ShopSite";

    if (exportSkus.length > 0 && !shopSiteUploadCompleted) {
      await markShopSiteSyncFailure(exportSkus, message);
    }

    const status =
      message.includes('Expected "skus"') || message.includes("export queue")
        ? 400
        : 500;
    console.error("[UploadShopSite] Error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
