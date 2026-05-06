import { createAdminClient } from "@/lib/supabase/server";
import {
  preparePipelineRowsForShopSiteExport,
  type PreparedShopSiteExportProduct,
  type ShopSiteExportBrandRow,
  type ShopSiteExportSourceRow,
} from "./mapping";

export type {
  PreparedShopSiteExportProduct,
  ShopSiteExportBrandRow,
  ShopSiteExportSourceRow,
} from "./mapping";

const PAGE_SIZE = 200;

interface PreparedShopSiteExport {
  products: PreparedShopSiteExportProduct[];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value): value is string => value.length > 0),
    ),
  );
}

function getBrandIdsFromRows(rows: ShopSiteExportSourceRow[]): string[] {
  const brandIds = rows
    .map((row) => {
      if (!row.consolidated || typeof row.consolidated !== "object" || Array.isArray(row.consolidated)) {
        return "";
      }

      const brandId = (row.consolidated as Record<string, unknown>).brand_id;
      return typeof brandId === "string" ? brandId.trim() : "";
    })
    .filter(Boolean);

  return uniqueStrings(brandIds);
}

export async function loadStorefrontShopSiteExport(
  options: { skus?: string[]; includeExportedRequestedSkus?: boolean } = {},
): Promise<PreparedShopSiteExport> {
  const supabase = await createAdminClient();
  const requestedSkus = uniqueStrings(options.skus ?? []);
  const includeExportedRequestedSkus =
    options.includeExportedRequestedSkus === true && requestedSkus.length > 0;
  const rows: ShopSiteExportSourceRow[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let exportQueueQuery = supabase
      .from("products_ingestion")
      .select("sku, input, consolidated, selected_images")
      .eq("pipeline_status", "exporting")
      .order("sku", { ascending: true });

    if (!includeExportedRequestedSkus) {
      exportQueueQuery = exportQueueQuery.is("exported_at", null);
    }

    if (requestedSkus.length > 0) {
      exportQueueQuery = exportQueueQuery.in("sku", requestedSkus);
    }

    const { data, error } = await exportQueueQuery.range(from, to);
    if (error) {
      throw new Error(`Failed to load export queue products: ${error.message}`);
    }

    const batch = (data ?? []) as ShopSiteExportSourceRow[];
    if (batch.length === 0) {
      break;
    }

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  if (requestedSkus.length > 0) {
    const foundSkus = new Set(rows.map((row) => row.sku));
    const missingSkus = requestedSkus.filter((sku) => !foundSkus.has(sku));
    if (missingSkus.length > 0) {
      throw new Error(
        `Some requested products are not in the export queue: ${missingSkus.join(", ")}`,
      );
    }
  }

  const brandIds = getBrandIdsFromRows(rows);
  const brandsById = new Map<string, ShopSiteExportBrandRow>();

  if (brandIds.length > 0) {
    const { data, error } = await supabase
      .from("brands")
      .select("id, name, slug")
      .in("id", brandIds);

    if (error) {
      throw new Error(`Failed to load brand metadata: ${error.message}`);
    }

    for (const brand of (data ?? []) as ShopSiteExportBrandRow[]) {
      brandsById.set(brand.id, brand);
    }
  }

  return {
    products: preparePipelineRowsForShopSiteExport(rows, brandsById),
  };
}

export const preparePublishedShopSiteExport = preparePipelineRowsForShopSiteExport;
export const loadPublishedShopSiteExport = loadStorefrontShopSiteExport;
