import { createClient } from "@/lib/supabase/server";
import {
  buildProductImageStorageFolder,
  replaceInlineImageDataUrls,
} from "@/lib/product-image-storage";
import { buildProductSlug } from "@/lib/shopsite/mapping";

const STOREFRONT_PUBLISHABLE_STATUS = "finalizing";
const DEFAULT_AVAILABILITY_TEXT = "in stock";
const DEFAULT_QUANTITY = 0;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

function coalesceString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function parseNonNegativeNumber(
  ...values: unknown[]
): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }

  return null;
}

function parseNonNegativeInt(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return Math.max(0, parsed);
      }
    }
  }

  return 0;
}

function parseBoolean(defaultValue: boolean, ...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "checked", "check"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "uncheck", "unchecked"].includes(normalized)) {
        return false;
      }
    }
  }

  return defaultValue;
}

function resolveStorefrontName(
  consolidated: JsonRecord,
  input: JsonRecord,
): string | null {
  return coalesceString(consolidated.name, input.name);
}


export async function publishToStorefront(sku: string) {
  const supabase = await createClient();

  try {
    const { data: ingestionProduct, error: fetchError } = await supabase
      .from("products_ingestion")
      .select("sku, input, consolidated, pipeline_status")
      .eq("sku", sku)
      .single();

    if (fetchError || !ingestionProduct) {
      return { success: false, error: "Product not found in pipeline" };
    }

    if (ingestionProduct.pipeline_status !== STOREFRONT_PUBLISHABLE_STATUS) {
      return {
        success: false,
        error: `Product must be in ${STOREFRONT_PUBLISHABLE_STATUS} before it can be published to the storefront. Current status: ${ingestionProduct.pipeline_status}`,
      };
    }

    const consolidated = asRecord(ingestionProduct.consolidated);
    const input = asRecord(ingestionProduct.input);
    const name = resolveStorefrontName(consolidated, input);

    if (!name) {
      return { success: false, error: "Product has no name to publish" };
    }

    const slug = buildProductSlug(name, sku);
    if (!slug) {
      return { success: false, error: "Product has no valid slug to publish" };
    }

    let images: string[] = [];
    if (Array.isArray(consolidated.images)) {
      const sourceImages = (consolidated.images as unknown[]).filter(
        (img): img is string => typeof img === "string" && img.trim() !== "",
      );
      const durableImages = await replaceInlineImageDataUrls(
        supabase,
        sourceImages,
        {
          folderPath: buildProductImageStorageFolder("pipeline-storefront", sku),
          onError: (message, error) => {
            console.error(`[Publish] ${message}`, error);
          },
        },
      );
      images = durableImages.value;

      if (images.some((image, index) => image !== sourceImages[index])) {
        const { error: persistenceError } = await supabase
          .from("products_ingestion")
          .update({
            consolidated: {
              ...consolidated,
              images,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("sku", sku);

        if (persistenceError) {
          console.error(
            `[Publish] Failed to persist durable pipeline images for ${sku}:`,
            persistenceError,
          );
        }
      }
    }

    const productData: Record<string, unknown> = {
      sku,
      name,
      slug,
      description: coalesceString(consolidated.description, input.description),
      price: parseNonNegativeNumber(consolidated.price, input.price) ?? 0,
      brand_id: coalesceString(consolidated.brand_id),
      stock_status:
        coalesceString(consolidated.stock_status, input.stock_status) ??
        "in_stock",
      images,
      is_special_order: parseBoolean(
        false,
        consolidated.is_special_order,
        input.is_special_order,
      ),
      is_taxable: parseBoolean(true, consolidated.is_taxable, input.is_taxable),
      weight: parseNonNegativeNumber(consolidated.weight, input.weight),
      search_keywords: coalesceString(
        consolidated.search_keywords,
        input.search_keywords,
      ),
      published_at: new Date().toISOString(),
      gtin: coalesceString(consolidated.gtin, input.gtin, sku),
      availability:
        coalesceString(consolidated.availability, input.availability) ??
        DEFAULT_AVAILABILITY_TEXT,
      minimum_quantity: parseNonNegativeInt(
        consolidated.minimum_quantity,
        input.minimum_quantity,
      ),
      quantity: DEFAULT_QUANTITY,
      low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
      shopsite_sync_status: "pending",
      shopsite_last_sync_error: null,
    };

    const markProductAsExporting = async () => {
      const { error: statusError } = await supabase
        .from("products_ingestion")
        .update({
          pipeline_status: "exporting",
          exported_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("sku", sku);

      if (statusError) {
        console.error(`[Publish] Failed to move ${sku} into exporting:`, statusError);
        return {
          success: false as const,
          error: "Failed to move product into exporting",
        };
      }

      return { success: true as const };
    };

    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();

    if (existingProduct) {
      const { error: updateError } = await supabase
        .from("products")
        .update(productData)
        .eq("id", existingProduct.id);

      if (updateError) {
        console.error(`[Publish] Error updating product ${sku}:`, updateError);
        return {
          success: false,
          error: "Failed to update product in storefront",
        };
      }

      const statusResult = await markProductAsExporting();
      if (!statusResult.success) {
        return statusResult;
      }

      return { success: true, action: "updated", productId: existingProduct.id };
    }

    const { data: insertedProduct, error: insertError } = await supabase
      .from("products")
      .insert(productData)
      .select("id")
      .single();

    if (insertError) {
      console.error(`[Publish] Error inserting product ${sku}:`, insertError);
      return { success: false, error: "Failed to create product in storefront" };
    }

    const statusResult = await markProductAsExporting();
    if (!statusResult.success) {
      return statusResult;
    }

    return { success: true, action: "created", productId: insertedProduct?.id };
  } catch (err) {
    console.error(`[Publish] Unexpected error for ${sku}:`, err);
    return {
      success: false,
      error: "An unexpected error occurred during publishing",
    };
  }
}

export async function bulkPublishToStorefront(skus: string[], userId?: string) {
  const results = {
    successCount: 0,
    failCount: 0,
    errors: [] as { sku: string; error: string }[],
    publishedSkus: [] as string[],
  };

  const supabase = await createClient();

  for (const sku of skus) {
    try {
      const result = await publishToStorefront(sku);
      if (result.success) {
        results.successCount++;
        results.publishedSkus.push(sku);
      } else {
        results.failCount++;
        results.errors.push({ sku, error: result.error || "Unknown error" });
      }
    } catch (err) {
      results.failCount++;
      results.errors.push({
        sku,
        error: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  if (results.publishedSkus.length > 0) {
    try {
      const auditPayload = {
        job_type: "status_update",
        job_id: crypto.randomUUID(),
        from_state: "finalizing",
        to_state: "exporting",
        actor_id: userId || null,
        actor_type: userId ? "user" : "system",
        metadata: {
          updated_skus: results.publishedSkus,
          updated_count: results.successCount,
          action: "bulk_publish",
          timestamp: new Date().toISOString(),
        },
      };

      await supabase.from("pipeline_audit_log").insert([auditPayload]);
    } catch (err) {
      console.error("Error logging bulk publish to audit_log:", err);
    }
  }

  return {
    success: results.failCount === 0,
    ...results,
  };
}
