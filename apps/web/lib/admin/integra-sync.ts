import { parseRegisterWorkbook, type RegisterWorkbookProduct } from "@/lib/admin/register-file";
import { assignProductsToCohorts } from "@/lib/admin/cohort-utils";
import { createClient } from "@/lib/supabase/server";
import type {
  ReconciliationIssue,
  IntegraReconciliationResult,
} from "@/lib/admin/integrations/reconciliation-types";

export interface IntegraProduct {
  upc: string;
  name: string;
  price: number;
}

export interface SyncAnalysis {
  totalInFile: number;
  existingOnWebsite: number;
  newProducts: IntegraProduct[];
}

const INITIAL_ONBOARDING_PIPELINE_STATUS = "imported";

/**
 * Parses an Integra Excel export.
 * Mapping:
 * - UPC_NO -> upc
 * - LIST_PRICE -> price
 * - DESCRIPTION1 + DESCRIPTION2 -> name
 */
async function parseIntegraExcel(
  buffer: ArrayBuffer,
): Promise<IntegraProduct[]> {
  return parseRegisterWorkbook(buffer).map((product) => ({
    upc: product.upc,
    name: product.name,
    price: product.price,
  }));
}

/**
 * Compares Integra products against the live website products.
 */
async function analyzeIntegraSync(
  integraProducts: IntegraProduct[],
): Promise<SyncAnalysis> {
  const supabase = await createClient();

  // Fetch all existing UPCs from website
  const upcsInFile = integraProducts.map((p) => p.upc);

  const { data: existingProducts, error } = await supabase
    .from("products")
    .select("upc")
    .in("upc", upcsInFile);

  if (error) {
    console.error("Error fetching existing products:", error);
    throw new Error("Failed to verify existing products");
  }

  const existingUpcSet = new Set(existingProducts?.map((p) => p.upc) || []);

  const newProducts = integraProducts.filter((p) => !existingUpcSet.has(p.upc));

  return {
    totalInFile: integraProducts.length,
    existingOnWebsite: existingUpcSet.size,
    newProducts,
  };
}

/**
 * Inserts missing products into the onboarding pipeline (products_ingestion).
 */
export async function addToOnboarding(
  products: IntegraProduct[],
): Promise<{ success: boolean; count: number; cohorts?: { assigned: number; ungrouped: number; cohortCount: number; errors: string[] } }> {
  const supabase = await createClient();

  // Remove duplicate UPCs
  const uniqueMap = new Map<string, IntegraProduct>();
  for (const p of products) {
    if (!uniqueMap.has(p.upc)) uniqueMap.set(p.upc, p); // keep first occurrence
  }
  const uniqueProducts = Array.from(uniqueMap.values());

  const onboardingData = uniqueProducts.map((p) => ({
    upc: p.upc,
    input: {
      name: p.name,
      price: p.price,
    },
    pipeline_status: INITIAL_ONBOARDING_PIPELINE_STATUS,
    updated_at: new Date().toISOString(),
  }));

  if (uniqueProducts.length !== products.length) {
    console.warn(
      `[integra-sync] removed ${products.length - uniqueProducts.length} duplicate UPCs before upsert`,
    );
  }

  // Use upsert to avoid duplicate key errors if some products are already in onboarding.
  const { error } = await supabase
    .from("products_ingestion")
    .upsert(onboardingData, { onConflict: "upc" });

  if (error) {
    console.error("Error adding to onboarding:", error);
    return { success: false, count: 0 };
  }

  let cohorts;
  try {
    cohorts = await assignProductsToCohorts(supabase, uniqueProducts.map(p => p.upc));
  } catch (cohortError) {
    console.warn("[integra-sync] cohort assignment failed (non-fatal):", cohortError);
  }

  return { success: true, count: uniqueProducts.length, cohorts };
}

// ---------------------------------------------------------------------------
// PR 4: Durable Integra reconciliation service
// ---------------------------------------------------------------------------

/**
 * Create an integration_sync_runs row for an Integra reconciliation.
 */
async function createIntegraReconciliationSyncRun(input: {
  fileName?: string;
  rowCount: number;
  createdBy?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data: externalSource, error: externalSourceError } = await supabase
    .from('external_sources')
    .select('id')
    .eq('key', 'integra')
    .maybeSingle();

  if (externalSourceError) {
    throw new Error(`Failed to resolve external source: ${externalSourceError.message}`);
  }

  const externalSourceId = externalSource?.id ?? null;
  const { data, error } = await supabase
    .from('integration_sync_runs')
    .insert({
      external_source_id: externalSourceId,
      source_type: 'integra',
      source_system: 'integra_register',
      sync_kind: 'inventory',
      status: 'running',
      file_name: input.fileName || null,
      row_count: input.rowCount,
      created_by: input.createdBy || null,
      metadata: {
        initiated_from: 'runIntegraReconciliation',
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create sync run: ${error?.message}`);
  }
  return data.id;
}

/**
 * Complete a sync run with final counts.
 */
async function completeIntegraReconciliationSyncRun(
  syncRunId: string,
  result: {
    success: boolean;
    insertedCount: number;
    updatedCount: number;
    errorCount: number;
    errorSummary?: string;
  }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('integration_sync_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: result.success ? 'completed' : (result.errorCount > 0 && result.insertedCount > 0 ? 'partial' : 'failed'),
      inserted_count: result.insertedCount,
      updated_count: result.updatedCount,
      error_count: result.errorCount,
      error_summary: result.errorSummary || null,
    })
    .eq('id', syncRunId);
  if (error) console.error('Failed to complete sync run:', error.message);
}

/**
 * Analyze Integra workbook data and produce reconciliation issues.
 * Compares register products against the website catalog.
 */
async function analyzeIntegraReconciliation(
  workbookProducts: RegisterWorkbookProduct[]
): Promise<Omit<IntegraReconciliationResult, 'syncRunId'>> {
  const supabase = await createClient();

  // Fetch all website products (UPC → product mapping)
  const { data: websiteProducts } = await supabase
    .from('products')
    .select('id, upc, name, price, quantity, stock_status');

  const websiteByUpc = new Map(
    (websiteProducts || []).map(p => [p.upc, p])
  );

  const issues: ReconciliationIssue[] = [];
  const seenUpcs = new Set<string>();
  let matchedProducts = 0;
  let unchangedProducts = 0;

  for (const wp of workbookProducts) {
    // Check for duplicate UPCs in file
    if (seenUpcs.has(wp.upc)) {
      issues.push({
        upc: wp.upc,
        productId: null,
        issueType: 'duplicate_upc',
        severity: 'medium',
        registerName: wp.name,
        websiteName: null,
        registerPrice: wp.price,
        websitePrice: null,
        registerQuantity: wp.quantityOnHand,
        websiteQuantity: null,
        recommendedAction: 'Review duplicate UPC entries in Integra export',
        rawRegisterPayload: { ...wp },
      });
      continue;
    }
    seenUpcs.add(wp.upc);

    const websiteProduct = websiteByUpc.get(wp.upc);

    if (!websiteProduct) {
      // Register-only product
      issues.push({
        upc: wp.upc,
        productId: null,
        issueType: 'register_only',
        severity: 'high',
        registerName: wp.name,
        websiteName: null,
        registerPrice: wp.price,
        websitePrice: null,
        registerQuantity: wp.quantityOnHand,
        websiteQuantity: null,
        recommendedAction: 'Add to product pipeline for onboarding',
        rawRegisterPayload: { ...wp },
      });
      continue;
    }

    matchedProducts++;
    const productIssues: ReconciliationIssue[] = [];

    // Check price mismatch
    const registerPrice = Math.round(wp.price * 100) / 100;
    const websitePrice = Math.round((websiteProduct.price || 0) * 100) / 100;
    if (registerPrice !== websitePrice) {
      productIssues.push({
        upc: wp.upc,
        productId: websiteProduct.id,
        issueType: 'price_mismatch',
        severity: registerPrice === 0 ? 'high' : 'medium',
        registerName: wp.name,
        websiteName: websiteProduct.name,
        registerPrice,
        websitePrice,
        registerQuantity: wp.quantityOnHand,
        websiteQuantity: websiteProduct.quantity,
        recommendedAction: registerPrice === 0
          ? 'Register price is $0 — verify product pricing'
          : `Update website price from $${websitePrice} to $${registerPrice}`,
        rawRegisterPayload: { ...wp },
      });
    }

    // Check quantity mismatch
    if (wp.quantityOnHand !== websiteProduct.quantity) {
      productIssues.push({
        upc: wp.upc,
        productId: websiteProduct.id,
        issueType: 'quantity_mismatch',
        severity: 'low',
        registerName: wp.name,
        websiteName: websiteProduct.name,
        registerPrice,
        websitePrice,
        registerQuantity: wp.quantityOnHand,
        websiteQuantity: websiteProduct.quantity,
        recommendedAction: `Update website quantity from ${websiteProduct.quantity} to ${wp.quantityOnHand}`,
        rawRegisterPayload: { ...wp },
      });
    }

    // Check stock status mismatch
    const registerStockStatus = wp.quantityOnHand > 0 ? 'in_stock' : 'out_of_stock';
    if (websiteProduct.stock_status && registerStockStatus !== websiteProduct.stock_status) {
      productIssues.push({
        upc: wp.upc,
        productId: websiteProduct.id,
        issueType: 'stock_status_mismatch',
        severity: 'medium',
        registerName: wp.name,
        websiteName: websiteProduct.name,
        registerPrice,
        websitePrice,
        registerQuantity: wp.quantityOnHand,
        websiteQuantity: websiteProduct.quantity,
        recommendedAction: `Update stock status from ${websiteProduct.stock_status} to ${registerStockStatus}`,
        rawRegisterPayload: { ...wp },
      });
    }

    if (productIssues.length > 0) {
      issues.push(...productIssues);
    } else {
      unchangedProducts++;
    }
  }

  // Detect website-only products (in catalog but not in register file)
  if (workbookProducts.length > 10 && websiteProducts) {
    for (const wp of websiteProducts) {
      if (!seenUpcs.has(wp.upc)) {
        issues.push({
          upc: wp.upc,
          productId: wp.id,
          issueType: 'website_only',
          severity: 'low',
          registerName: null,
          websiteName: wp.name,
          registerPrice: null,
          websitePrice: wp.price,
          registerQuantity: null,
          websiteQuantity: wp.quantity,
          recommendedAction: 'Product exists on website but not in register export — verify if still carried',
        });
        if (issues.filter(i => i.issueType === 'website_only').length >= 50) break;
      }
    }
  }

  const registerOnlyCount = issues.filter(i => i.issueType === 'register_only').length;
  const websiteOnlyCount = issues.filter(i => i.issueType === 'website_only').length;
  const priceMismatchCount = issues.filter(i => i.issueType === 'price_mismatch').length;
  const quantityMismatchCount = issues.filter(i => i.issueType === 'quantity_mismatch').length;
  const stockStatusMismatchCount = issues.filter(i => i.issueType === 'stock_status_mismatch').length;

  return {
    totalInFile: workbookProducts.length,
    matchedProducts,
    unchangedProducts,
    registerOnlyCount,
    websiteOnlyCount,
    priceMismatchCount,
    quantityMismatchCount,
    stockStatusMismatchCount,
    issues,
  };
}

/**
 * Persist reconciliation issues to the database.
 */
async function persistReconciliationIssues(
  reconciliationId: string,
  issues: ReconciliationIssue[]
): Promise<{ insertedCount: number; errorCount: number }> {
  const supabase = await createClient();
  const rows = issues.map(issue => ({
    reconciliation_id: reconciliationId,
    upc: issue.upc,
    product_id: issue.productId,
    register_price: issue.registerPrice,
    website_price: issue.websitePrice,
    register_quantity: issue.registerQuantity,
    website_quantity: issue.websiteQuantity,
    issue_type: issue.issueType,
    status: 'open',
    notes: issue.registerName || null,
  }));

  let insertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('inventory_reconciliation_items')
      .insert(batch);
    if (error) {
      console.error(`Failed to insert reconciliation batch ${i}:`, error.message);
      errorCount += batch.length;
    } else {
      insertedCount += batch.length;
    }
  }

  return { insertedCount, errorCount };
}

/**
 * Full reconciliation pipeline: parse → analyze → persist → return result.
 */
export async function runIntegraReconciliation(input: {
  buffer: ArrayBuffer;
  fileName?: string;
  createdBy?: string | null;
}): Promise<IntegraReconciliationResult> {
  const workbookProducts = await parseRegisterWorkbook(input.buffer);
  if (!workbookProducts || workbookProducts.length === 0) {
    throw new Error('No products found in the uploaded file');
  }

  const syncRunId = await createIntegraReconciliationSyncRun({
    fileName: input.fileName,
    rowCount: workbookProducts.length,
    createdBy: input.createdBy,
  });

  const analysis = await analyzeIntegraReconciliation(workbookProducts);
  const { insertedCount, errorCount } = await persistReconciliationIssues(syncRunId, analysis.issues);

  await completeIntegraReconciliationSyncRun(syncRunId, {
    success: errorCount === 0,
    insertedCount,
    updatedCount: 0,
    errorCount,
    errorSummary: errorCount > 0 ? `${errorCount} issues failed to persist` : undefined,
  });

  return { syncRunId, ...analysis };
}

/**
 * Push selected register-only reconciliation items to the product pipeline.
 * Can be called with either a list of specific issueIds OR a syncRunId to push all open register-only issues for that run.
 */
export async function pushRegisterOnlyIssuesToPipeline(
  params: { issueIds?: string[]; syncRunId?: string }
): Promise<{ success: boolean; count: number; errors: string[] }> {
  // Use admin client to bypass RLS for this bulk operation
  const { createAdminClient, createClient } = await import('@/lib/supabase/server');
  const userClient = await createClient();
  const supabase = await createAdminClient();
  const errors: string[] = [];
  let count = 0;

  // Verify the user is an admin or staff member
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return { success: false, count: 0, errors: ['Unauthorized: No active session'] };
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return { success: false, count: 0, errors: ['Unauthorized: Staff access required'] };
  }

  let query = supabase
    .from('inventory_reconciliation_items')
    .select('*')
    .eq('issue_type', 'register_only')
    .eq('status', 'open');

  if (params.syncRunId) {
    query = query.eq('reconciliation_id', params.syncRunId);
  } else if (params.issueIds && params.issueIds.length > 0) {
    query = query.in('id', params.issueIds);
  } else {
    return { success: false, count: 0, errors: ['No issues or sync run ID provided'] };
  }

  const { data: issues, error: fetchError } = await query;

  if (fetchError || !issues) {
    console.error('Failed to fetch issues from inventory_reconciliation_items:', fetchError);
    return { success: false, count: 0, errors: [`Failed to fetch issues: ${fetchError?.message || 'No issues returned'}`] };
  }

  console.log(`[pushToPipeline] Fetching ${issues.length} issues for run ${params.syncRunId || 'custom list'}`);

  for (const issue of issues) {
    const { error: insertError } = await supabase
      .from('products_ingestion')
      .upsert({
        upc: issue.upc,
        input: {
          name: issue.notes || issue.upc,
          price: issue.register_price,
          upc: issue.upc,
          source: 'integra',
          sync_run_id: issue.reconciliation_id,
          reconciliation_item_id: issue.id,
        },
        pipeline_status: 'imported',
      }, { onConflict: 'upc' });

    if (insertError) {
      errors.push(`Failed to push ${issue.upc}: ${insertError.message}`);
    } else {
      await supabase
        .from('inventory_reconciliation_items')
        .update({ status: 'pushed_to_pipeline', resolved_at: new Date().toISOString() })
        .eq('id', issue.id);
      count++;
    }
  }

  // Assign successfully pushed products to cohorts
  if (count > 0) {
    const pushedUpcs = issues.map(i => i.upc).filter(upc => !errors.some(e => e.includes(upc)));
    if (pushedUpcs.length > 0) {
      try {
        const cohortResult = await assignProductsToCohorts(supabase, pushedUpcs);
        if (cohortResult.errors.length > 0) {
          errors.push(...cohortResult.errors);
        }
        console.log(`[pushToPipeline] Assigned ${cohortResult.assigned} products to ${cohortResult.cohortCount} cohorts`);
      } catch (cohortError) {
        console.warn("[pushToPipeline] Cohort assignment failed (non-fatal):", cohortError);
        errors.push(`Cohort assignment failed: ${cohortError instanceof Error ? cohortError.message : String(cohortError)}`);
      }
    }
  }

  return { success: errors.length === 0, count, errors };
}
