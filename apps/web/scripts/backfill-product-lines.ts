/**
 * Backfill Product Lines
 *
 * Classifies all non-published products into manufacturer product lines.
 * Used during the big-bang migration to the group-based consolidation architecture.
 *
 * Usage:
 *   bun run scripts/backfill-product-lines.ts              # real run
 *   bun run scripts/backfill-product-lines.ts --dry-run    # report counts only
 *   bun run scripts/backfill-product-lines.ts --limit=50   # process only 50 products
 *   bun run scripts/backfill-product-lines.ts --status=processed  # only 'processed' products
 */

import { createAdminClient } from '../lib/supabase/server';
import {
  submitProductLineClassificationBatch,
  getBatchStatus,
  processBatchQueue,
} from '../lib/consolidation/batch-service';
import { finalizeClassificationBatch } from '../lib/consolidation/grouping-service';

interface BackfillOptions {
  dryRun?: boolean;
  limit?: number;
  status?: string;
  batchSize?: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: args.includes('--dry-run'),
    batchSize: 20,
  };

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--status=')) {
      options.status = arg.split('=')[1];
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    }
  }

  console.log('=== Product Line Backfill ===');
  console.log(`Dry run: ${options.dryRun || false}`);
  console.log(`Limit: ${options.limit || 'none'}`);
  console.log(`Status filter: ${options.status || 'all non-published'}`);
  console.log(`Batch size: ${options.batchSize}`);

  const supabase = await createAdminClient();

  // Count target products
  let countQuery = supabase
    .from('products_ingestion')
    .select('upc', { count: 'exact', head: true })
    .is('exported_at', null) // non-published
    .is('product_line_id', null) // not yet classified
    .not('pipeline_status', 'in', '("publishing")'); // not actively publishing

  if (options.status) {
    countQuery = countQuery.eq('pipeline_status', options.status);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error('Failed to count products:', countError.message);
    process.exit(1);
  }

  console.log(`\n${count || 0} non-published products need classification`);

  if (options.dryRun) {
    console.log('Dry run complete. No changes made.');
    process.exit(0);
  }

  if (!count || count === 0) {
    console.log('No products to classify. Exiting.');
    process.exit(0);
  }

  // Fetch products to classify
  const effectiveLimit = options.limit || count;

  let fetchQuery = supabase
    .from('products_ingestion')
    .select('upc, sources, input, pipeline_status')
    .is('exported_at', null)
    .is('product_line_id', null)
    .not('pipeline_status', 'in', '("publishing")')
    .limit(effectiveLimit);

  if (options.status) {
    fetchQuery = fetchQuery.eq('pipeline_status', options.status);
  }

  const { data: products, error: fetchError } = await fetchQuery;

  if (fetchError || !products) {
    console.error('Failed to fetch products:', fetchError?.message);
    process.exit(1);
  }

  console.log(`\nClassifying ${products.length} products...`);

  // Submit classification batch
  const productsWithSources = products.map(p => ({
    upc: p.upc,
    sources: (p.sources || {}) as Record<string, unknown>,
    input: p.input as Record<string, unknown> | null,
  }));

  const submitResult = await submitProductLineClassificationBatch(productsWithSources, {
    description: `Backfill classification for ${productsWithSources.length} products`,
  });

  if (!submitResult.success) {
    console.error('Failed to submit classification batch:', (submitResult as any).error);
    process.exit(1);
  }

  const batchId = submitResult.batch_id;
  console.log(`Batch ${batchId} created with ${submitResult.product_count} items`);
  console.log('Processing classification items...');

  // Process items
  let totalProcessed = 0;
  const maxIterations = Math.ceil(products.length / 5) + 5;

  for (let i = 0; i < maxIterations; i++) {
    const result = await processBatchQueue(batchId, { limit: 10 });

    if ('success' in result && !result.success) {
      console.error(`Processing error: ${result.error}`);
      break;
    }

    if ('processed' in result) {
      totalProcessed += result.processed;
      console.log(`  Progress: ${totalProcessed}/${products.length} (${result.completed} completed, ${result.failed} failed)`);

      if (result.status.is_complete || result.status.is_failed || result.processed === 0) {
        break;
      }
    }
  }

  // Get final status
  const batchStatus = await getBatchStatus(batchId);
  if ('success' in batchStatus && !batchStatus.success) {
    console.error('Failed to get batch status:', batchStatus.error);
    process.exit(1);
  }

  if ('is_complete' in batchStatus) {
    const s = batchStatus;
    console.log(`\nClassification complete: ${s.completed_requests} completed, ${s.failed_requests} failed`);

    // Finalize: apply assignments
    console.log('\nFinalizing classification assignments...');
    const finalizeResult = await finalizeClassificationBatch(batchId);

    console.log(`\nFinalize results:`);
    console.log(`  Total classified: ${finalizeResult.totalClassified}`);
    console.log(`  Assigned to product lines: ${finalizeResult.assignedCount}`);
    console.log(`  Ungrouped (singletons): ${finalizeResult.ungroupedCount}`);
    console.log(`  Product lines created: ${finalizeResult.productLinesCount}`);
    console.log(`  Needs review: ${finalizeResult.reviewRequiredCount}`);

    if (finalizeResult.errors.length > 0) {
      console.log(`\nErrors (${finalizeResult.errors.length}):`);
      finalizeResult.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
    }
  }

  console.log('\nBackfill complete.');
}

main().catch(console.error);
