import { after, NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { ShopSiteClient } from "@/lib/admin/migration/shopsite-client";
import { getStoredShopSiteConfig } from "@/lib/admin/shopsite-settings";
import { loadStorefrontShopSiteExport } from "@/lib/shopsite/export-builder";
import {
  buildShopSiteNewProductTag,
  generateShopSiteXml,
} from "@/lib/shopsite/xml-generator";
import {
  markShopSiteSyncFailureByUpcs,
  markShopSiteSyncSuccessByUpcs,
} from "@/lib/shopsite/sync-status";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

interface UploadRequestBody {
  upcs?: unknown;
}

function parseUpcSelection(body: UploadRequestBody): string[] {
  if (body.upcs === undefined) {
    return [];
  }

  if (!Array.isArray(body.upcs)) {
    throw new Error('Expected "upcs" to be an array of UPC strings');
  }

  return body.upcs
    .map((upc) => (typeof upc === "string" ? upc.trim() : ""))
    .filter((upc) => upc.length > 0);
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

async function markShopSiteSyncFailure(upcs: string[], message: string) {
  if (upcs.length === 0) {
    return;
  }

  try {
    await markShopSiteSyncFailureByUpcs(upcs, message);
  } catch (statusError) {
    console.error("[UploadShopSite] Failed to record ShopSite failure status:", statusError);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  let exportUpcs: string[] = [];
  let shopSiteUploadCompleted = false;

  try {
    const body = await parseRequestBody(request);
    const upcs = parseUpcSelection(body);
    const { products } = await loadStorefrontShopSiteExport({
      upcs: upcs.length > 0 ? upcs : undefined,
    });

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No export-ready storefront products available for ShopSite upload" },
        { status: 404 },
      );
    }

    // The products from loadStorefrontShopSiteExport still have a .sku property 
    // mapped from the internal .upc, which we need for ShopSite XML.
    exportUpcs = products.map((product) => product.sku);

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

    try {
      await markShopSiteSuccessByUpcs(exportUpcs, syncedAt);
    } catch (productSyncError) {
      throw new Error(
        `ShopSite upload succeeded, but failed to record storefront sync status: ${productSyncError instanceof Error ? productSyncError.message : String(productSyncError)}`,
      );
    }

    const { error: statusError } = await supabase
      .from("products_ingestion")
      .update({
        exported_at: syncedAt,
        updated_at: syncedAt,
      })
      .in("upc", exportUpcs)
      .eq("pipeline_status", "publishing");

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
      uploadedUpcs: exportUpcs,
      marker,
      publishWarning,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to sync products to ShopSite";

    if (exportUpcs.length > 0 && !shopSiteUploadCompleted) {
      await markShopSiteSyncFailure(exportUpcs, message);
    }

    const status =
      message.includes('Expected "upcs"') || message.includes("export queue")
        ? 400
        : 500;
    console.error("[UploadShopSite] Error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}

async function markShopSiteSuccessByUpcs(upcs: string[], syncedAt: string) {
  return markShopSiteSyncSuccessByUpcs(upcs, syncedAt);
}
