/**
 * Queue Shadow Packaging Extractions
 *
 * Queries products_ingestion for products with consolidated images and
 * queues packaging extraction jobs (shadow mode) for production catalog
 * products. Uses the same image scoring heuristics as select-gold-candidates.ts.
 *
 * Usage:
 *   bun run scripts/packaging/queue-shadow-extractions.ts
 *   bun run scripts/packaging/queue-shadow-extractions.ts --limit=100
 *   bun run scripts/packaging/queue-shadow-extractions.ts --category="dog food|cat food"
 *   bun run scripts/packaging/queue-shadow-extractions.ts --pipeline-status=reviewing
 *   bun run scripts/packaging/queue-shadow-extractions.ts --dry-run
 *   bun run scripts/packaging/queue-shadow-extractions.ts --skip-existing
 *   bun run scripts/packaging/queue-shadow-extractions.ts --category --dry-run --limit=25
 */

import { createAdminClient } from '../../lib/supabase/server';
import crypto from 'crypto';

// =============================================================================
// Constants
// =============================================================================

const PROMPT_VERSION = 'packaging-ocr-then-parse-v1';
const SCHEMA_VERSION = 'packaging-extraction-v1';
const BATCH_SIZE = 50;

// =============================================================================
// Image URL scoring (mirrors select-gold-candidates.ts)
// =============================================================================

const NON_PACKAGING_TOKENS = [
  'logo', 'icon', 'banner', 'lifestyle', 'hero', 'swatch',
  'thumbnail', 'thumb', 'button', 'placeholder', 'spacer',
  'avatar', 'rating', 'star', 'arrow', 'cart', 'checkout',
  'background', 'pattern', 'bg-', 'footer', 'header',
];

const PACKAGING_TOKENS = [
  '/images/', '/products/', '/product/',
  'scene7', 'is/image', 'cdn', 'shopify',
  '_main', '_front', '_pkg', '_pack',
  'main.jpg', 'front.jpg',
];

function scoreImageUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 50;
  for (const token of PACKAGING_TOKENS) {
    if (lower.includes(token)) score += 15;
  }
  if (/amazon.*\/images\/[a-z]\//i.test(lower)) score += 10;
  if (/scene7|is\.image/i.test(lower)) score += 15;
  if (/cdn/i.test(lower)) score += 5;
  if (/\.jpg$|\.png$|\.webp$/i.test(url)) score += 5;
  for (const token of NON_PACKAGING_TOKENS) {
    if (lower.includes(token)) score = Math.max(0, score - 30);
  }
  if (/\b\d{2,3}x\d{2,3}\b/.test(lower)) score -= 10;
  if (/\b50x50\b|\b100x100\b|\bsm\b|\btn\b/.test(lower)) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function selectBestPackagingImages(urls: string[], max: number = 2): string[] {
  const scored = urls
    .filter((u) => typeof u === 'string' && u.match(/^https?:\/\//))
    .map((url) => ({ url, score: scoreImageUrl(url) }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.url);
}

// =============================================================================
// Helpers
// =============================================================================

function extractUrlsFromConsolidated(consolidated: Record<string, unknown> | null): string[] {
  if (!consolidated) return [];
  const images = consolidated.images as string[] | undefined;
  if (Array.isArray(images)) return images;
  const core = consolidated.core as Record<string, unknown> | undefined;
  if (core) {
    const coreImages = core.images as string[] | undefined;
    if (Array.isArray(coreImages)) return coreImages;
  }
  return [];
}

function parseArgs(): Record<string, unknown> {
  const args = process.argv.slice(2);
  return {
    limit: parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '50', 10),
    category: args.find((a) => a.startsWith('--category='))?.split('=')[1] ?? null,
    pipelineStatus: args.find((a) => a.startsWith('--pipeline-status='))?.split('=')[1] ?? null,
    dryRun: args.includes('--dry-run'),
    skipExisting: args.includes('--skip-existing'),
  };
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const opts = parseArgs();
  const limit = opts.limit as number;
  const category = opts.category as string | null;
  const pipelineStatus = opts.pipelineStatus as string | null;
  const dryRun = opts.dryRun as boolean;
  const skipExisting = opts.skipExisting as boolean;

  const supabase = await createAdminClient();
  const results: Array<{ upc: string; images: string[]; title: string | null; status: string | null }> = [];

  // Query products with consolidated data and images
  let query = supabase
    .from('products_ingestion')
    .select('upc, pipeline_status, input, consolidated')
    .not('consolidated', 'is', null)
    .order('updated_at', { ascending: false });

  if (pipelineStatus) {
    query = query.eq('pipeline_status', pipelineStatus);
  }

  const { data: products, error } = await query.limit(500);

  if (error) {
    console.error('Failed to query products_ingestion:', error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No products found');
    return;
  }

  console.log(`Evaluated ${products.length} products for shadow extraction eligibility`);

  for (const product of products) {
    if (results.length >= limit) break;

    const upc = product.upc;
    const consolidated = product.consolidated as Record<string, unknown> | null;
    const input = product.input as Record<string, unknown> | null;

    const name = (consolidated?.name as string) ||
      ((consolidated?.core as Record<string, unknown> | undefined)?.name as string) ||
      (input?.name as string) ||
      null;

    const status = product.pipeline_status as string | null;

    // Category filter: check if name matches category pattern
    if (category && name) {
      const lowerName = name.toLowerCase();
      const cats = category.toLowerCase().split('|');
      if (!cats.some((c) => lowerName.includes(c))) continue;
    }

    // Extract image URLs from consolidated.images
    const allUrls = extractUrlsFromConsolidated(consolidated);
    if (allUrls.length === 0) continue;

    // Score and select best packaging images
    const bestImages = selectBestPackagingImages(allUrls);
    if (bestImages.length === 0) continue;

    // Skip existing non-stale successful extractions
    if (skipExisting) {
      const { data: existing } = await supabase
        .from('product_packaging_extractions')
        .select('id')
        .eq('upc', upc)
        .eq('status', 'succeeded')
        .eq('is_stale', false)
        .limit(1)
        .maybeSingle();

      if (existing) continue;
    }

    results.push({ upc, images: bestImages, title: name, status });
  }

  if (dryRun) {
    console.log(`\n[Dry Run] Would queue ${results.length} shadow extractions:`);
    console.log(`  (from ${products.length} scanned products)`);
    console.log('');
    console.log('First 10:');
    for (const r of results.slice(0, 10)) {
      console.log(`  ${r.upc} [${r.status ?? '?'}] "${(r.title ?? '').slice(0, 60)}"`);
      for (const url of r.images) {
        console.log(`    ${url.slice(0, 100)}`);
      }
    }
    console.log(`\n... and ${Math.max(0, results.length - 10)} more`);
    return;
  }

  if (results.length === 0) {
    console.log('No products to queue. Adjust filters or --limit.');
    return;
  }

  // Batch insert
  const toInsert = results.map((r) => ({
    upc: r.upc,
    status: 'queued',
    trigger: 'consolidation',
    prompt_version: PROMPT_VERSION,
    schema_version: SCHEMA_VERSION,
    image_urls: r.images,
    max_attempts: 2,
  }));

  // Insert in batches to avoid payload size limits
  let totalInserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { data: inserted, error: insertError } = await supabase
      .from('product_packaging_extractions')
      .insert(batch)
      .select('id, upc');

    if (insertError) {
      console.error(`Batch ${i / BATCH_SIZE + 1} insert failed:`, insertError.message);
      continue;
    }

    if (inserted) {
      for (const row of inserted) {
        console.log(`  ${(row.id ?? '').slice(0, 8)}... → ${row.upc}`);
      }
      totalInserted += inserted.length;
    }
  }

  console.log(`\nQueued ${totalInserted} shadow packaging extractions`);
  console.log(`Failed: ${results.length - totalInserted}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
