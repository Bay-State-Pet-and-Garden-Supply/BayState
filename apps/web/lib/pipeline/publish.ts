import { createClient } from "@/lib/supabase/server";
import {
  buildProductImageStorageFolder,
  replaceInlineImageDataUrls,
} from "@/lib/product-image-storage";
import { buildProductSlug } from "@/lib/shopsite/mapping";
import { upsertShopSiteSyncByProductIds } from "@/lib/shopsite/sync-status";
import { syncProductCategoryLinks } from "@/lib/product-category-sync";
import { buildFacetSlug } from "@/lib/facets/normalization";
import { parseTaxonomyValues, resolveTaxonomySelections } from "@/lib/taxonomy";

const STOREFRONT_PUBLISHABLE_STATUS = "reviewing";
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
  const core = asRecord(consolidated.core);
  return coalesceString(core.name, consolidated.name, input.name);
}


async function syncProductFacets(
  supabase: any,
  productId: string,
  candidateFacets: Array<{
    definition_slug: string;
    value: string;
    confidence_score?: number | null;
    evidence_source?: string | null;
  }>
) {
  const { error: deleteError } = await supabase
    .from("product_facets")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw new Error(`Failed to clear product facets: ${deleteError.message}`);
  }

  if (candidateFacets.length === 0) {
    return;
  }

  // Normalize candidateFacets definition_slug to use hyphens (matching database slugs)
  const normalizedCandidateFacets = candidateFacets.map((f) => ({
    ...f,
    definition_slug: (f.definition_slug || "").trim().toLowerCase().replace(/_/g, "-"),
  }));

  const definitionSlugs = Array.from(
    new Set(
      normalizedCandidateFacets
        .map((f) => f.definition_slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.trim() !== "")
    )
  );

  if (definitionSlugs.length === 0) {
    return;
  }

  const { data: definitions, error: defError } = await supabase
    .from("facet_definitions")
    .select("id, slug, name")
    .in("slug", definitionSlugs);

  if (defError || !definitions) {
    console.error(`[Publish] Failed to fetch facet definitions:`, defError);
    return;
  }

  const definitionBySlug = new Map<string, { id: string; name: string; slug: string }>();
  for (const def of definitions) {
    definitionBySlug.set(def.slug, { id: def.id, name: def.name, slug: def.slug });
  }

  // Pre-fetch all existing facet values for these definitions
  const { data: existingVals, error: valFetchError } = await supabase
    .from("facet_values")
    .select("id, facet_definition_id, value, normalized_value, slug")
    .in("facet_definition_id", definitions.map((d: { id: string }) => d.id));

  const existingMap = new Map<string, { id: string; value: string; slug: string }>();
  const hasValues = new Set<string>();

  if (!valFetchError && existingVals) {
    for (const val of existingVals) {
      const key = `${val.facet_definition_id}:${val.normalized_value}`;
      existingMap.set(key, { id: val.id, value: val.value, slug: val.slug });
      hasValues.add(val.facet_definition_id);
    }
  }

  const STRICT_ENUM_SLUGS = new Set([
    "animal-type",
    "breed-size",
    "life-stage",
    "lifestage",
    "indoor-outdoor",
    "subscription-eligible",
    "clumping",
    "has-squeaker",
    "organic",
    "rawhide-free"
  ]);

  const productFacetRows: Array<{ product_id: string; facet_value_id: string }> = [];

  for (const facet of normalizedCandidateFacets) {
    const def = definitionBySlug.get(facet.definition_slug);
    if (!def) {
      console.warn(`[Publish] Skipping facet for unknown definition: ${facet.definition_slug}`);
      continue;
    }

    const individualValues = facet.value
      .split("|")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    for (const valText of individualValues) {
      const normalizedValue = valText.toLowerCase();
      const key = `${def.id}:${normalizedValue}`;

      const existing = existingMap.get(key);
      if (existing) {
        productFacetRows.push({
          product_id: productId,
          facet_value_id: existing.id,
        });
        continue;
      }

      // Guardrail: if it's a strict enum, and the definition already has values,
      // do not allow creating a new value - log warning and skip
      if (STRICT_ENUM_SLUGS.has(def.slug) && hasValues.has(def.id)) {
        console.warn(
          `[Publish] Guardrail blocked upsert of non-canonical value "${valText}" for strict enum "${def.slug}"`
        );
        continue;
      }

      const valSlug = buildFacetSlug(valText);

      const { data: upsertedVal, error: valError } = await supabase
        .from("facet_values")
        .upsert(
          {
            facet_definition_id: def.id,
            value: valText,
            normalized_value: normalizedValue,
            slug: valSlug,
          },
          { onConflict: "facet_definition_id, normalized_value" }
        )
        .select("id")
        .single();

      if (valError || !upsertedVal) {
        console.error(
          `[Publish] Failed to upsert facet value "${valText}" for definition "${def.name}":`,
          valError
        );
        continue;
      }

      productFacetRows.push({
        product_id: productId,
        facet_value_id: upsertedVal.id,
      });
    }
  }

  if (productFacetRows.length > 0) {
    const uniqueLinks = Array.from(
      new Map(productFacetRows.map((r) => [r.facet_value_id, r])).values()
    );

    const { error: linkError } = await supabase
      .from("product_facets")
      .insert(uniqueLinks);

    if (linkError) {
      throw new Error(`Failed to link product facets: ${linkError.message}`);
    }
  }
}


export async function publishToStorefront(upc: string) {
  const supabase = await createClient();

  try {
    const { data: ingestionProduct, error: fetchError } = await supabase
      .from("products_ingestion")
      .select("upc, input, consolidated, pipeline_status")
      .eq("upc", upc)
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
    const core = asRecord(consolidated.core);
    const name = resolveStorefrontName(consolidated, input);

    if (!name) {
      return { success: false, error: "Product has no name to publish" };
    }

    const brandId = coalesceString(core.brand_id, consolidated.brand_id);
    if (!brandId || brandId === "none") {
      return { success: false, error: "Product cannot be published without a brand" };
    }

    const price = parseNonNegativeNumber(core.price, consolidated.price, input.price) ?? 0;
    if (price <= 0) {
      return { success: false, error: "Product price must be greater than $0.00" };
    }

    const slug = buildProductSlug(name, upc);
    if (!slug) {
      return { success: false, error: "Product has no valid slug to publish" };
    }

    let images: string[] = [];
    let sourceImages: string[] = [];
    if (Array.isArray(consolidated.media)) {
      sourceImages = consolidated.media
          .map((m: any) => m?.url)
          .filter((url): url is string => typeof url === "string" && url.trim() !== "");
    } else if (Array.isArray(consolidated.images)) {
      sourceImages = (consolidated.images as unknown[]).filter(
          (img): img is string => typeof img === "string" && img.trim() !== "",
      );
    }

    if (sourceImages.length > 0) {
      const durableImages = await replaceInlineImageDataUrls(
          supabase,
          sourceImages,
          {
            folderPath: buildProductImageStorageFolder("pipeline-storefront", upc),
            onError: (message, error) => {
              console.error(`[Publish] ${message}`, error);
            },
          },
      );
      images = durableImages.value;

      if (images.some((image, index) => image !== sourceImages[index])) {
        const updatedConsolidated = { ...consolidated };
        if (Array.isArray(consolidated.media)) {
          updatedConsolidated.media = consolidated.media.map((m: any, idx: number) => ({
            ...m,
            url: images[idx] || m.url,
          }));
        } else {
          updatedConsolidated.images = images;
        }

        const { error: persistenceError } = await supabase
            .from("products_ingestion")
            .update({
              consolidated: updatedConsolidated,
              updated_at: new Date().toISOString(),
            })
            .eq("upc", upc);

        if (persistenceError) {
          console.error(
              `[Publish] Failed to persist durable pipeline images for ${upc}:`,
              persistenceError,
          );
        }
      }
    }

    if (images.length === 0) {
      return { success: false, error: "Product must have at least one image selected to publish" };
    }

    // Resolve canonical category and canonical_category_id
    const categoryBreadcrumb = coalesceString(
        core.canonical_category_breadcrumb,
        consolidated.category,
        input.category
    );

    let canonicalCategoryId: string | null = null;
    if (categoryBreadcrumb) {
      try {
        const { data: taxonomyCategories, error: taxError } = await supabase
            .from("categories")
            .select("id, name, slug, parent_id, description, display_order, image_url, is_featured, synonym_keywords, breadcrumb");
        if (!taxError && taxonomyCategories) {
          const categoryTokens = parseTaxonomyValues(categoryBreadcrumb);
          const { matched } = resolveTaxonomySelections(categoryTokens, taxonomyCategories);
          if (matched.length > 0) {
            canonicalCategoryId = matched[0].id;
          }
        }
      } catch (err) {
        console.error(`[Publish] Failed to resolve canonical category for ${upc}:`, err);
      }
    }

    if (!categoryBreadcrumb || !canonicalCategoryId) {
      return { success: false, error: "Product must be assigned to a valid category in the taxonomy" };
    }

    const productData: Record<string, unknown> = {
      upc,
      name,
      slug,
      description: coalesceString(core.description, consolidated.description, input.description),
      price: parseNonNegativeNumber(core.price, consolidated.price, input.price) ?? 0,
      brand_id: coalesceString(core.brand_id, consolidated.brand_id),
      stock_status:
        coalesceString(core.stock_status, consolidated.stock_status, input.stock_status) ??
        "in_stock",
      images,
      is_special_order: parseBoolean(
        false,
        core.is_special_order,
        consolidated.is_special_order,
        input.is_special_order,
      ),
      is_taxable: parseBoolean(true, core.is_taxable, consolidated.is_taxable, input.is_taxable),
      weight: parseNonNegativeNumber(core.weight_lbs, consolidated.weight, input.weight),
      search_keywords: coalesceString(
        core.search_keywords,
        consolidated.search_keywords,
        input.search_keywords,
      ),
      published_at: new Date().toISOString(),
      gtin: coalesceString(core.gtin, consolidated.gtin, input.gtin, upc),
      availability:
        coalesceString(core.availability, consolidated.availability, input.availability) ??
        DEFAULT_AVAILABILITY_TEXT,
      minimum_quantity: parseNonNegativeInt(
        core.minimum_quantity,
        consolidated.minimum_quantity,
        input.minimum_quantity,
      ),
      quantity: DEFAULT_QUANTITY,
      low_stock_threshold: DEFAULT_LOW_STOCK_THRESHOLD,
      canonical_category_id: canonicalCategoryId,
    };

    const markProductAsExporting = async () => {
      const { error: statusError } = await supabase
        .from("products_ingestion")
        .update({
          pipeline_status: "publishing",
          updated_at: new Date().toISOString(),
          exported_at: null,
        })
        .eq("upc", upc);

      if (statusError) {
        console.error(`[Publish] Failed to move ${upc} into publishing:`, statusError);
        return {
          success: false as const,
          error: "Failed to move product into publishing",
        };
      }

      return { success: true as const };
    };

    const markProductPendingShopSiteSync = async (productId: string) => {
      try {
        await upsertShopSiteSyncByProductIds([
          {
            productId,
            syncStatus: "pending",
            lastSyncedAt: null,
            lastUploadedAt: null,
            lastSyncError: null,
            metadata: {
              upc,
              published_at: new Date().toISOString(),
            },
          },
        ]);
      } catch (syncError) {
        console.error(`[Publish] Failed to persist ShopSite sync row for ${upc}:`, syncError);
      }
    };

    const candidateFacets = Array.isArray(consolidated.facets) ? (consolidated.facets as any[]) : [];

    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .eq("upc", upc)
      .maybeSingle();

    if (existingProduct) {
      const { error: updateError } = await supabase
        .from("products")
        .update(productData)
        .eq("id", existingProduct.id);

      if (updateError) {
        console.error(`[Publish] Error updating product ${upc}:`, updateError);
        return {
          success: false,
          error: "Failed to update product in storefront",
        };
      }

      if (categoryBreadcrumb) {
        try {
          await syncProductCategoryLinks(supabase, existingProduct.id, categoryBreadcrumb);
        } catch (err) {
          console.error(`[Publish] Failed to sync category links for ${upc}:`, err);
        }
      }

      try {
        await syncProductFacets(supabase, existingProduct.id, candidateFacets);
      } catch (err) {
        console.error(`[Publish] Failed to sync facets for ${upc}:`, err);
      }

      await markProductPendingShopSiteSync(existingProduct.id);

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
      console.error(`[Publish] Error inserting product ${upc}:`, insertError);
      return { success: false, error: "Failed to create product in storefront" };
    }

    if (insertedProduct?.id) {
      if (categoryBreadcrumb) {
        try {
          await syncProductCategoryLinks(supabase, insertedProduct.id, categoryBreadcrumb);
        } catch (err) {
          console.error(`[Publish] Failed to sync category links for ${upc}:`, err);
        }
      }

      try {
        await syncProductFacets(supabase, insertedProduct.id, candidateFacets);
      } catch (err) {
        console.error(`[Publish] Failed to sync facets for ${upc}:`, err);
      }

      await markProductPendingShopSiteSync(insertedProduct.id);
    }

    const statusResult = await markProductAsExporting();
    if (!statusResult.success) {
      return statusResult;
    }

    return { success: true, action: "created", productId: insertedProduct?.id };
  } catch (err) {
    console.error(`[Publish] Unexpected error for ${upc}:`, err);
    return {
      success: false,
      error: "An unexpected error occurred during publishing",
    };
  }
}

export async function bulkPublishToStorefront(upcs: string[], userId?: string) {
  const results = {
    successCount: 0,
    failCount: 0,
    errors: [] as { upc: string; error: string }[],
    publishedUpcs: [] as string[],
  };

  const supabase = await createClient();

  for (const upc of upcs) {
    try {
      const result = await publishToStorefront(upc);
      if (result.success) {
        results.successCount++;
        results.publishedUpcs.push(upc);
      } else {
        results.failCount++;
        results.errors.push({ upc, error: result.error || "Unknown error" });
      }
    } catch (err) {
      results.failCount++;
      results.errors.push({
        upc,
        error: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  if (results.publishedUpcs.length > 0) {
    try {
      const auditPayload = {
        job_type: "status_update",
        job_id: crypto.randomUUID(),
        from_state: "reviewing",
        to_state: "publishing",
        actor_id: userId || null,
        actor_type: userId ? "user" : "system",
        metadata: {
          updated_upcs: results.publishedUpcs,
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
