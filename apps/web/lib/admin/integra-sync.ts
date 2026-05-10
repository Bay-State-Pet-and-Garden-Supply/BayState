import { parseRegisterWorkbook, type RegisterWorkbookProduct } from "@/lib/admin/register-file";
import { createClient } from "@/lib/supabase/server";
import { assignProductsToCohorts } from "@/lib/admin/cohort-utils";
import type {
  ReconciliationIssue,
  ReconciliationIssueType,
  IntegraReconciliationResult,
} from "@/lib/admin/integrations/reconciliation-types";

export interface IntegraProduct {
  sku: string;
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
 * - SKU_NO -> sku
 * - LIST_PRICE -> price
 * - DESCRIPTION1 + DESCRIPTION2 -> name
 */
export async function parseIntegraExcel(
  buffer: ArrayBuffer,
): Promise<IntegraProduct[]> {
  return parseRegisterWorkbook(buffer).map((product) => ({
    sku: product.sku,
    name: product.name,
    price: product.price,
  }));
}

/**
 * Compares Integra products against the live website products.
 */
export async function analyzeIntegraSync(
  integraProducts: IntegraProduct[],
): Promise<SyncAnalysis> {
  const supabase = await createClient();

  // Fetch all existing SKUs from website
  // We might want to do this in batches if there are thousands,
  // but for now we'll fetch them all or at least the ones in the file.
  const skusInFile = integraProducts.map((p) => p.sku);

  const { data: existingProducts, error } = await supabase
    .from("products")
    .select("sku")
    .in("sku", skusInFile);

  if (error) {
    console.error("Error fetching existing products:", error);
    throw new Error("Failed to verify existing products");
  }

  const existingSkuSet = new Set(existingProducts?.map((p) => p.sku) || []);

  const newProducts = integraProducts.filter((p) => !existingSkuSet.has(p.sku));

  return {
    totalInFile: integraProducts.length,
    existingOnWebsite: existingSkuSet.size,
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

  // Remove duplicate SKUs — Postgres will error if the same conflict target
  // appears more than once in the same INSERT ... ON CONFLICT statement.
  const uniqueMap = new Map<string, IntegraProduct>();
  for (const p of products) {
    if (!uniqueMap.has(p.sku)) uniqueMap.set(p.sku, p); // keep first occurrence
  }
  const uniqueProducts = Array.from(uniqueMap.values());

  const onboardingData = uniqueProducts.map((p) => ({
    sku: p.sku,
    input: {
      name: p.name,
      price: p.price,
    },
    pipeline_status: INITIAL_ONBOARDING_PIPELINE_STATUS,
    updated_at: new Date().toISOString(),
  }));

  if (uniqueProducts.length !== products.length) {
    console.warn(
      `[integra-sync] removed ${products.length - uniqueProducts.length} duplicate SKUs before upsert`,
    );
  }

  // Use upsert to avoid duplicate key errors if some products are already in onboarding.
  const { error } = await supabase
    .from("products_ingestion")
    .upsert(onboardingData, { onConflict: "sku" });

  if (error) {
    console.error("Error adding to onboarding:", error);
    return { success: false, count: 0 };
  }

  let cohorts;
  try {
    cohorts = await assignProductsToCohorts(supabase, uniqueProducts.map(p => p.sku));
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
export async function createIntegraReconciliationSyncRun(input: {
  fileName?: string;
  rowCount: number;
  createdBy?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('integration_sync_runs')
    .insert({
      source_type: 'integra',
      source_system: 'integra_register',
      sync_kind: 'inventory',
      status: 'running',
      file_name: input.fileName || null,
      row_count: input.rowCount,
      created_by: input.createdBy || null,
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
export async function completeIntegraReconciliationSyncRun(
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
export async function analyzeIntegraReconciliation(
  workbookProducts: RegisterWorkbookProduct[]
): Promise<Omit<IntegraReconciliationResult, 'syncRunId'>> {
  const supabase = await createClient();

  // Fetch all website products (SKU → product mapping)
  const { data: websiteProducts } = await supabase
    .from('products')
    .select('id, sku, name, price, quantity, stock_status');

  const websiteBySku = new Map(
    (websiteProducts || []).map(p => [p.sku, p])
  );

  const issues: ReconciliationIssue[] = [];
  const seenSkus = new Set<string>();
  let matchedProducts = 0;
  let unchangedProducts = 0;

  for (const wp of workbookProducts) {
    // Check for duplicate SKUs in file
    if (seenSkus.has(wp.sku)) {
      issues.push({
        sku: wp.sku,
        productId: null,
        issueType: 'duplicate_sku',
        severity: 'medium',
        registerName: wp.name,
        websiteName: null,
        registerPrice: wp.price,
        websitePrice: null,
        registerQuantity: wp.quantityOnHand,
        websiteQuantity: null,
        recommendedAction: 'Review duplicate SKU entries in Integra export',
        rawRegisterPayload: { ...wp },
      });
      continue;
    }
    seenSkus.add(wp.sku);

    const websiteProduct = websiteBySku.get(wp.sku);

    if (!websiteProduct) {
      // Register-only product
      issues.push({
        sku: wp.sku,
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
        sku: wp.sku,
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
        sku: wp.sku,
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
        sku: wp.sku,
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
      if (!seenSkus.has(wp.sku)) {
        issues.push({
          sku: wp.sku,
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
export async function persistReconciliationIssues(
  syncRunId: string,
  issues: ReconciliationIssue[]
): Promise<{ insertedCount: number; errorCount: number }> {
  const supabase = await createClient();
  const rows = issues.map(issue => ({
    sync_run_id: syncRunId,
    sku: issue.sku,
    product_id: issue.productId,
    register_name: issue.registerName,
    website_name: issue.websiteName,
    register_price: issue.registerPrice,
    website_price: issue.websitePrice,
    register_quantity: issue.registerQuantity,
    website_quantity: issue.websiteQuantity,
    issue_type: issue.issueType,
    severity: issue.severity,
    status: 'open',
    recommended_action: issue.recommendedAction,
    raw_register_payload: issue.rawRegisterPayload || {},
    metadata: {},
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
 */
export async function pushRegisterOnlyIssuesToPipeline(
  issueIds: string[]
): Promise<{ success: boolean; count: number; errors: string[] }> {
  const supabase = await createClient();
  const errors: string[] = [];
  let count = 0;

  const { data: issues, error: fetchError } = await supabase
    .from('inventory_reconciliation_items')
    .select('*')
    .in('id', issueIds)
    .eq('issue_type', 'register_only')
    .eq('status', 'open');

  if (fetchError || !issues) {
    return { success: false, count: 0, errors: ['Failed to fetch issues'] };
  }

  for (const issue of issues) {
    const { error: insertError } = await supabase
      .from('products_ingestion')
      .upsert({
        sku: issue.sku,
        name: issue.register_name || issue.sku,
        price: issue.register_price || undefined,
        input: {
          name: issue.register_name || issue.sku,
          price: issue.register_price,
          sku: issue.sku,
          source: 'integra',
          sync_run_id: issue.sync_run_id,
          reconciliation_item_id: issue.id,
        },
        pipeline_status: 'imported',
      }, { onConflict: 'sku' });

    if (insertError) {
      errors.push(`Failed to push ${issue.sku}: ${insertError.message}`);
    } else {
      await supabase
        .from('inventory_reconciliation_items')
        .update({ status: 'pushed_to_pipeline', resolved_at: new Date().toISOString() })
        .eq('id', issue.id);
      count++;
    }
  }

  return { success: errors.length === 0, count, errors };
}
