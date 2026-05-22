import type { SupabaseClient } from "@/lib/supabase/server";

const DEFAULT_PREFIX_LENGTH = 6;
const WRITE_BATCH_SIZE = 100;
const UNGROUPED_PREFIX = "UNGROUPED";
const UNGROUPED_NAME = "Ungrouped Products";

/**
 * Extract the first N digits from a UPC to use as a prefix.
 * Returns empty string if UPC is non-numeric or shorter than prefix length.
 */
function extractUpcPrefix(
  upc: string,
  prefixLength: number = DEFAULT_PREFIX_LENGTH,
): string {
  const normalized = upc.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return "";
  }
  if (normalized.length < prefixLength) {
    return normalized;
  }
  return normalized.slice(0, prefixLength);
}

/**
 * Group UPCs by their prefix.
 * Non-numeric/short UPCs are grouped under the UNGROUPED sentinel.
 */
export function groupUpcsByPrefix(
  upcs: string[],
  prefixLength: number = DEFAULT_PREFIX_LENGTH,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const upc of upcs) {
    const prefix = extractUpcPrefix(upc, prefixLength);
    const key = prefix || UNGROUPED_PREFIX;
    const existing = groups.get(key);
    if (existing) {
      existing.push(upc);
    } else {
      groups.set(key, [upc]);
    }
  }
  return groups;
}

interface CohortBatch {
  id: string;
  name: string | null;
  upc_prefix: string;
  brand_id?: string | null;
}

interface CohortBatchTarget {
  upc_prefix: string;
  brand_id: string | null;
}

/**
 * Find existing cohort batches by UPC prefix and brand, or create new ones.
 * Returns a map of "prefix:brandId" -> cohort batch.
 */
async function ensureCohortBatches(
  supabase: SupabaseClient,
  targets: CohortBatchTarget[],
): Promise<Map<string, CohortBatch>> {
  const result = new Map<string, CohortBatch>();

  if (targets.length === 0) {
    return result;
  }

  const uniquePrefixes = Array.from(new Set(targets.map((t) => t.upc_prefix)));

  // Fetch existing batches matching these prefixes
  const { data: existing, error } = await supabase
    .from("cohort_batches")
    .select("id, name, upc_prefix, brand_id")
    .in("upc_prefix", uniquePrefixes);

  if (error) {
    console.error(
      "[ensureCohortBatches] Failed to fetch existing batches:",
      error,
    );
    throw new Error(`Failed to fetch cohort batches: ${error.message}`);
  }

  // Populate map for existing batches: key is "upc_prefix:brand_id" (null brand_id is mapped as "null")
  for (const batch of existing || []) {
    const key = `${batch.upc_prefix}:${batch.brand_id || "null"}`;
    result.set(key, {
      id: batch.id,
      name: batch.name,
      upc_prefix: batch.upc_prefix,
      brand_id: batch.brand_id,
    });
  }

  // Identify missing combinations of (upc_prefix, brand_id)
  const missingTargets: CohortBatchTarget[] = [];
  const processedTargetKeys = new Set<string>();

  for (const target of targets) {
    const key = `${target.upc_prefix}:${target.brand_id || "null"}`;
    if (processedTargetKeys.has(key)) continue;
    processedTargetKeys.add(key);

    if (!result.has(key)) {
      missingTargets.push(target);
    }
  }

  if (missingTargets.length > 0) {
    // Look up brand names for the missing cohorts that have brand_id
    const brandIds = Array.from(
      new Set(missingTargets.map((t) => t.brand_id).filter(Boolean) as string[]),
    );
    const brandNameMap = new Map<string, string>();
    if (brandIds.length > 0) {
      const { data: brands, error: brandError } = await supabase
        .from("brands")
        .select("id, name")
        .in("id", brandIds);

      if (brandError) {
        console.warn("[ensureCohortBatches] Failed to fetch brand names:", brandError);
      } else {
        for (const b of brands || []) {
          brandNameMap.set(b.id, b.name);
        }
      }
    }

    const insertPayload = missingTargets.map((target) => {
      const brandName = target.brand_id ? brandNameMap.get(target.brand_id) : null;
      return {
        upc_prefix: target.upc_prefix,
        brand_id: target.brand_id,
        brand_name: brandName || null,
        name: target.upc_prefix,
        product_line: target.upc_prefix,
        status: "pending" as const,
      };
    });

    for (let i = 0; i < insertPayload.length; i += WRITE_BATCH_SIZE) {
      const batch = insertPayload.slice(i, i + WRITE_BATCH_SIZE);
      const { data: created, error: insertError } = await supabase
        .from("cohort_batches")
        .insert(batch)
        .select("id, name, upc_prefix, brand_id");

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
        const key = `${item.upc_prefix}:${item.brand_id || "null"}`;
        result.set(key, {
          id: item.id,
          name: item.name,
          upc_prefix: item.upc_prefix,
          brand_id: item.brand_id,
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
 * Assign products to cohorts based on UPC prefix grouping and brand identity.
 * Updates products_ingestion.cohort_id and inserts/upserts cohort_members.
 *
 * Errors are collected and returned; the function does its best to
 * assign everything it can even if individual batches fail.
 */
export async function assignProductsToCohorts(
  supabase: SupabaseClient,
  upcs: string[],
  prefixLength: number = DEFAULT_PREFIX_LENGTH,
): Promise<CohortAssignmentResult> {
  if (upcs.length === 0) {
    return { assigned: 0, ungrouped: 0, cohortCount: 0, errors: [] };
  }

  const errors: string[] = [];
  const grouped = groupUpcsByPrefix(upcs, prefixLength);
  const ungroupedUpcs = grouped.get(UNGROUPED_PREFIX) ?? [];
  grouped.delete(UNGROUPED_PREFIX);

  // 1. Fetch existing brand_id for these UPCs from products_ingestion
  const { data: productsData, error: fetchError } = await supabase
    .from("products_ingestion")
    .select("upc, brand_id")
    .in("upc", upcs);

  if (fetchError) {
    console.error(
      "[assignProductsToCohorts] Failed to fetch product brands:",
      fetchError,
    );
    errors.push(`Failed to fetch product brands: ${fetchError.message}`);
  }

  const upcBrandMap = new Map<string, string | null>();
  if (productsData) {
    for (const p of productsData) {
      upcBrandMap.set(p.upc, p.brand_id);
    }
  }

  // 2. Build target (upc_prefix, brand_id) pairs for missing cohort batches
  const targets: CohortBatchTarget[] = [];
  for (const [prefix, prefixUpcs] of grouped.entries()) {
    const prefixBrands = new Set<string | null>();
    for (const upc of prefixUpcs) {
      prefixBrands.add(upcBrandMap.get(upc) || null);
    }
    for (const brandId of prefixBrands) {
      targets.push({ upc_prefix: prefix, brand_id: brandId });
    }
  }

  // 3. Ensure cohort batches exist for all targets
  let cohortMap: Map<string, CohortBatch>;
  try {
    cohortMap = await ensureCohortBatches(supabase, targets);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { assigned: 0, ungrouped: upcs.length, cohortCount: 0, errors: [...errors, message] };
  }

  // Ensure ungrouped cohort exists if needed
  let ungroupedCohortId: string | null = null;
  if (ungroupedUpcs.length > 0) {
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

  // Build UPC -> cohort_id mapping
  const upcToCohortId = new Map<string, string>();
  for (const [prefix, prefixUpcs] of grouped.entries()) {
    for (const upc of prefixUpcs) {
      const brandId = upcBrandMap.get(upc) || null;
      const key = `${prefix}:${brandId || "null"}`;
      const cohort = cohortMap.get(key);
      if (!cohort) {
        errors.push(`Cohort not found for prefix ${prefix} and brand ${brandId}`);
        continue;
      }
      upcToCohortId.set(upc, cohort.id);
    }
  }
  for (const upc of ungroupedUpcs) {
    if (ungroupedCohortId) {
      upcToCohortId.set(upc, ungroupedCohortId);
    }
  }

  // Update products_ingestion grouped by cohort_id so .update().in() works
  const upcsByCohortId = new Map<string, string[]>();
  for (const [upc, cohortId] of upcToCohortId.entries()) {
    const existing = upcsByCohortId.get(cohortId);
    if (existing) {
      existing.push(upc);
    } else {
      upcsByCohortId.set(cohortId, [upc]);
    }
  }

  for (const [cohortId, upcList] of upcsByCohortId.entries()) {
    for (let i = 0; i < upcList.length; i += WRITE_BATCH_SIZE) {
      const batch = upcList.slice(i, i + WRITE_BATCH_SIZE);
      const { error: updateError } = await supabase
        .from("products_ingestion")
        .update({ cohort_id: cohortId })
        .in("upc", batch);

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
  const memberRows = Array.from(upcToCohortId.entries()).map(
    ([upc, cohortId], index) => ({
      cohort_id: cohortId,
      product_upc: upc,
      upc_prefix: extractUpcPrefix(upc, prefixLength) || UNGROUPED_PREFIX,
      sort_order: index,
    }),
  );

  for (let i = 0; i < memberRows.length; i += WRITE_BATCH_SIZE) {
    const batch = memberRows.slice(i, i + WRITE_BATCH_SIZE);
    const { error: memberError } = await supabase
      .from("cohort_members")
      .upsert(batch, { onConflict: "cohort_id,product_upc" });

    if (memberError) {
      console.error(
        "[assignProductsToCohorts] Failed to upsert cohort_members:",
        memberError,
      );
      errors.push(`Failed to insert cohort members: ${memberError.message}`);
    }
  }

  const assigned = upcToCohortId.size;
  const cohortCount = targets.length + (ungroupedUpcs.length > 0 ? 1 : 0);

  return { assigned, ungrouped: ungroupedUpcs.length, cohortCount, errors };
}
