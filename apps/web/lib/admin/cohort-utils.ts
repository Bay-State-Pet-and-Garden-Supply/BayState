import type { SupabaseClient } from "@/lib/supabase/server";

const DEFAULT_PREFIX_LENGTH = 6;
const WRITE_BATCH_SIZE = 100;
const UNGROUPED_PREFIX = "UNGROUPED";
const UNGROUPED_NAME = "Ungrouped Products";

/**
 * Extract the first N digits from a SKU to use as a UPC prefix.
 * Returns empty string if SKU is non-numeric or shorter than prefix length.
 */
function extractUpcPrefix(
  sku: string,
  prefixLength: number = DEFAULT_PREFIX_LENGTH,
): string {
  const normalized = sku.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return "";
  }
  if (normalized.length < prefixLength) {
    return normalized;
  }
  return normalized.slice(0, prefixLength);
}

/**
 * Group SKUs by their UPC prefix.
 * Non-numeric/short SKUs are grouped under the UNGROUPED sentinel.
 */
export function groupSkusByPrefix(
  skus: string[],
  prefixLength: number = DEFAULT_PREFIX_LENGTH,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const sku of skus) {
    const prefix = extractUpcPrefix(sku, prefixLength);
    const key = prefix || UNGROUPED_PREFIX;
    const existing = groups.get(key);
    if (existing) {
      existing.push(sku);
    } else {
      groups.set(key, [sku]);
    }
  }
  return groups;
}

interface CohortBatch {
  id: string;
  name: string | null;
  upc_prefix: string;
}

/**
 * Find existing cohort batches by UPC prefix, or create new ones.
 * Returns a map of prefix -> cohort batch.
 */
async function ensureCohortBatches(
  supabase: SupabaseClient,
  prefixes: string[],
): Promise<Map<string, CohortBatch>> {
  const uniquePrefixes = Array.from(new Set(prefixes));
  const result = new Map<string, CohortBatch>();

  if (uniquePrefixes.length === 0) {
    return result;
  }

  // Fetch existing batches
  const { data: existing, error } = await supabase
    .from("cohort_batches")
    .select("id, name, upc_prefix")
    .in("upc_prefix", uniquePrefixes);

  if (error) {
    console.error(
      "[ensureCohortBatches] Failed to fetch existing batches:",
      error,
    );
    throw new Error(`Failed to fetch cohort batches: ${error.message}`);
  }

  for (const batch of existing || []) {
    result.set(batch.upc_prefix, {
      id: batch.id,
      name: batch.name,
      upc_prefix: batch.upc_prefix,
    });
  }

  // Create missing batches in chunks
  const missingPrefixes = uniquePrefixes.filter((p) => !result.has(p));
  if (missingPrefixes.length > 0) {
    const insertPayload = missingPrefixes.map((prefix) => ({
      upc_prefix: prefix,
      name: prefix,
      product_line: prefix,
      status: "pending" as const,
    }));

    for (let i = 0; i < insertPayload.length; i += WRITE_BATCH_SIZE) {
      const batch = insertPayload.slice(i, i + WRITE_BATCH_SIZE);
      const { data: created, error: insertError } = await supabase
        .from("cohort_batches")
        .insert(batch)
        .select("id, name, upc_prefix");

      if (insertError) {
        console.error(
          "[ensureCohortBatches] Failed to create batches:",
          insertError,
        );
        throw new Error(
          `Failed to create cohort batches: ${insertError.message}`,
        );
      }

      for (const item of created || []) {
        result.set(item.upc_prefix, {
          id: item.id,
          name: item.name,
          upc_prefix: item.upc_prefix,
        });
      }
    }
  }

  return result;
}

interface CohortAssignmentResult {
  assigned: number;
  ungrouped: number;
  cohortCount: number;
  errors: string[];
}

/**
 * Assign products to cohorts based on SKU prefix grouping.
 * Updates products_ingestion.cohort_id and inserts/upserts cohort_members.
 *
 * Errors are collected and returned; the function does its best to
 * assign everything it can even if individual batches fail.
 */
export async function assignProductsToCohorts(
  supabase: SupabaseClient,
  skus: string[],
  prefixLength: number = DEFAULT_PREFIX_LENGTH,
): Promise<CohortAssignmentResult> {
  if (skus.length === 0) {
    return { assigned: 0, ungrouped: 0, cohortCount: 0, errors: [] };
  }

  const errors: string[] = [];
  const grouped = groupSkusByPrefix(skus, prefixLength);
  const ungroupedSkus = grouped.get(UNGROUPED_PREFIX) ?? [];
  grouped.delete(UNGROUPED_PREFIX);

  // Ensure cohort batches exist for all prefixes
  const prefixes = Array.from(grouped.keys());
  let cohortMap: Map<string, CohortBatch>;
  try {
    cohortMap = await ensureCohortBatches(supabase, prefixes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { assigned: 0, ungrouped: skus.length, cohortCount: 0, errors: [message] };
  }

  // Ensure ungrouped cohort exists if needed
  let ungroupedCohortId: string | null = null;
  if (ungroupedSkus.length > 0) {
    try {
      const { data: existingUngrouped } = await supabase
        .from("cohort_batches")
        .select("id, name")
        .eq("upc_prefix", UNGROUPED_PREFIX)
        .limit(1);

      if (existingUngrouped && existingUngrouped.length > 0) {
        ungroupedCohortId = existingUngrouped[0].id;
      } else {
        const { data: createdUngrouped, error: createUngroupedError } =
          await supabase
            .from("cohort_batches")
            .insert({
              upc_prefix: UNGROUPED_PREFIX,
              name: UNGROUPED_NAME,
              product_line: UNGROUPED_PREFIX,
              status: "pending",
            })
            .select("id");

        if (!createUngroupedError && createdUngrouped && createdUngrouped.length > 0) {
          ungroupedCohortId = createdUngrouped[0].id;
        } else if (createUngroupedError) {
          errors.push(
            `Failed to create ungrouped cohort: ${createUngroupedError.message}`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to create ungrouped cohort: ${message}`);
    }
  }

  // Build SKU -> cohort_id mapping
  const skuToCohortId = new Map<string, string>();
  for (const [prefix, prefixSkus] of grouped.entries()) {
    const cohort = cohortMap.get(prefix);
    if (!cohort) {
      errors.push(`Cohort not found for prefix ${prefix}`);
      continue;
    }
    for (const sku of prefixSkus) {
      skuToCohortId.set(sku, cohort.id);
    }
  }
  for (const sku of ungroupedSkus) {
    if (ungroupedCohortId) {
      skuToCohortId.set(sku, ungroupedCohortId);
    }
  }

  // Update products_ingestion grouped by cohort_id so .update().in() works
  const skusByCohortId = new Map<string, string[]>();
  for (const [sku, cohortId] of skuToCohortId.entries()) {
    const existing = skusByCohortId.get(cohortId);
    if (existing) {
      existing.push(sku);
    } else {
      skusByCohortId.set(cohortId, [sku]);
    }
  }

  for (const [cohortId, skuList] of skusByCohortId.entries()) {
    for (let i = 0; i < skuList.length; i += WRITE_BATCH_SIZE) {
      const batch = skuList.slice(i, i + WRITE_BATCH_SIZE);
      const { error: updateError } = await supabase
        .from("products_ingestion")
        .update({ cohort_id: cohortId })
        .in("sku", batch);

      if (updateError) {
        console.error(
          "[assignProductsToCohorts] Failed to update products_ingestion:",
          updateError,
        );
        errors.push(
          `Failed to update cohort assignments: ${updateError.message}`,
        );
      }
    }
  }

  // Upsert cohort_members
  const memberRows = Array.from(skuToCohortId.entries()).map(
    ([sku, cohortId], index) => ({
      cohort_id: cohortId,
      product_sku: sku,
      upc_prefix: extractUpcPrefix(sku, prefixLength) || UNGROUPED_PREFIX,
      sort_order: index,
    }),
  );

  for (let i = 0; i < memberRows.length; i += WRITE_BATCH_SIZE) {
    const batch = memberRows.slice(i, i + WRITE_BATCH_SIZE);
    const { error: memberError } = await supabase
      .from("cohort_members")
      .upsert(batch, { onConflict: "cohort_id,product_sku" });

    if (memberError) {
      console.error(
        "[assignProductsToCohorts] Failed to upsert cohort_members:",
        memberError,
      );
      errors.push(`Failed to insert cohort members: ${memberError.message}`);
    }
  }

  const assigned = skuToCohortId.size;
  const cohortCount = grouped.size + (ungroupedSkus.length > 0 ? 1 : 0);

  return { assigned, ungrouped: ungroupedSkus.length, cohortCount, errors };
}
