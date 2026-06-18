/**
 * Select Gold Candidates for Packaging Vision Benchmark
 *
 * Queries products_ingestion for products with consolidated images,
 * scores image URLs for packaging relevance, and outputs a candidate
 * dataset for human review.
 *
 * Usage:
 *   bun run scripts/packaging/select-gold-candidates.ts
 *   bun run scripts/packaging/select-gold-candidates.ts --limit=50
 *   bun run scripts/packaging/select-gold-candidates.ts --dry-run
 *
 * Output: apps/scraper/benchmarks/packaging_vision/gold_dataset.candidates.json
 */

import { createAdminClient } from '../../lib/supabase/server';
import { writeFileSync } from 'fs';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

interface CandidateEntry {
  id: string;
  upc: string;
  current_title: string | null;
  image_urls: string[];
  pipeline_status: string | null;
  tags: string[];
}

interface CandidateDataset {
  schema_version: string;
  description: string;
  generated_at: string;
  entries: CandidateEntry[];
}

// =============================================================================
// Image URL scoring
// =============================================================================

/** Low-value URL tokens that indicate non-packaging images. */
const NON_PACKAGING_TOKENS = [
  'logo', 'icon', 'banner', 'lifestyle', 'hero', 'swatch',
  'thumbnail', 'thumb', 'button', 'placeholder', 'spacer',
  'avatar', 'rating', 'star', 'arrow', 'cart', 'checkout',
  'background', 'pattern', 'bg-', 'footer', 'header',
];

/** High-value URL tokens that indicate packaging/product images. */
const PACKAGING_TOKENS = [
  '/images/', '/products/', '/product/',
  'scene7', 'is/image', 'cdn', 'shopify',
  '_main', '_front', '_pkg', '_pack',
  'main.jpg', 'front.jpg',
];

/** Product categories likely to benefit from packaging OCR. */
const TARGET_CATEGORIES = [
  'dog food', 'cat food', 'pet food', 'dog treat', 'cat treat',
  'pet treat', 'dog supplement', 'cat supplement', 'pet supplement',
  'dog litter', 'cat litter', 'pet litter',
  'dog bedding', 'pet bedding',
  'lawn', 'garden', 'fertilizer', 'seed', 'grass',
  'pest control', 'insecticide', 'herbicide',
  'cleaner', 'cleaning', 'chemical',
  'bird', 'wildlife', 'feed',
  'horse', 'equine', 'livestock',
  'reptile', 'aquarium', 'fish',
];

/**
 * Score a single image URL for packaging relevance.
 * Returns 0-100 where higher is more likely to be a product packaging image.
 */
function scoreImageUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 50; // neutral base

  // Positive signals
  for (const token of PACKAGING_TOKENS) {
    if (lower.includes(token)) score += 15;
  }
  if (/amazon.*\/images\/[a-z]\//i.test(lower)) score += 10;
  if (/scene7|is\.image/i.test(lower)) score += 15;
  if (/cdn/i.test(lower)) score += 5;
  if (/\.jpg$|\.png$|\.webp$/i.test(url)) score += 5;

  // Negative signals
  for (const token of NON_PACKAGING_TOKENS) {
    if (lower.includes(token)) score = Math.max(0, score - 30);
  }

  // Penalize very small image tokens (thumbnails, icons)
  if (/\b\d{2,3}x\d{2,3}\b/.test(lower)) score -= 10;
  if (/\b50x50\b|\b100x100\b|\bsm\b|\btn\b/.test(lower)) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Select the best 1-2 packaging images from an array of URLs.
 */
function selectBestPackagingImages(urls: string[], max: number = 2): string[] {
  const scored = urls
    .filter((u) => typeof u === 'string' && u.match(/^https?:\/\//))
    .map((url) => ({ url, score: scoreImageUrl(url) }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((s) => s.url);
}

/**
 * Check if a consolidated name suggests a packaging-OCR-beneficial category.
 */
function isTargetCategory(name: string | null): boolean {
  if (!name) return true; // include unknowns
  const lower = name.toLowerCase();
  return TARGET_CATEGORIES.some((cat) => lower.includes(cat));
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 200;
  const dryRun = args.includes('--dry-run');

  const supabase = await createAdminClient();

  // Query products with consolidated images
  const { data: products, error } = await supabase
    .from('products_ingestion')
    .select('upc, pipeline_status, input, consolidated, sources')
    .not('consolidated', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('Failed to query products_ingestion:', error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No products found');
    return;
  }

  console.log(`Evaluated ${products.length} products`);

  const candidates: CandidateEntry[] = [];

  for (const product of products) {
    if (candidates.length >= limit) break;

    const upc = product.upc;
    const consolidated = product.consolidated as Record<string, unknown> | null;
    if (!consolidated) continue;

    const input = product.input as Record<string, unknown> | null;
    const name = (consolidated?.name as string) ||
                 ((consolidated?.core as Record<string, unknown> | null)?.name as string) ||
                 (input?.name as string) ||
                 null;

    const pipelineStatus = product.pipeline_status as string | null;

    // Extract image URLs from consolidated.images
    const consolidatedImages = consolidated.images as string[] | undefined;
    let allImageUrls: string[] = [];

    if (Array.isArray(consolidatedImages)) {
      allImageUrls.push(...consolidatedImages);
    }

    // If no consolidated images, try sources
    if (allImageUrls.length === 0) {
      const sources = product.sources as Record<string, unknown> | null;
      if (sources) {
        for (const [, sourceData] of Object.entries(sources)) {
          if (sourceData && typeof sourceData === 'object') {
            const sd = sourceData as Record<string, unknown>;
            const imgs = sd.images ?? sd.image_urls ?? sd.image_url ?? sd.image;
            if (Array.isArray(imgs)) {
              for (const img of imgs) {
                if (typeof img === 'string') allImageUrls.push(img);
              }
            }
          }
        }
      }
    }

    if (allImageUrls.length === 0) continue;

    // Select best 1-2 packaging images
    const bestImages = selectBestPackagingImages(allImageUrls);

    if (bestImages.length === 0) continue;

    // Build tags
    const tags: string[] = [];
    if (pipelineStatus) tags.push(pipelineStatus);
    if (isTargetCategory(name)) tags.push('target-category');
    if (bestImages.some((u) => u.includes('amazon'))) tags.push('amazon-image');
    if (bestImages.some((u) => /scene7|is\.image/i.test(u))) tags.push('scene7-image');
    if (bestImages.some((u) => /cdn/i.test(u))) tags.push('cdn-image');

    candidates.push({
      id: `candidate-${upc}`,
      upc,
      current_title: name,
      image_urls: bestImages,
      pipeline_status: pipelineStatus,
      tags,
    });
  }

  const dataset: CandidateDataset = {
    schema_version: 'packaging-vision-gold-dataset-v1',
    description: 'AI-generated candidate entries for packaging vision gold dataset review',
    generated_at: new Date().toISOString(),
    entries: candidates,
  };

  const outputPath = path.resolve(
    __dirname, '../../../apps/scraper/benchmarks/packaging_vision/gold_dataset.candidates.json',
  );

  if (dryRun) {
    console.log(`\n[Dry Run] Would write ${candidates.length} candidates to:`);
    console.log(`  ${outputPath}`);
    console.log(`Category breakdown:`);
    const byPipeline = new Map<string, number>();
    for (const c of candidates) {
      const status = c.pipeline_status || 'unknown';
      byPipeline.set(status, (byPipeline.get(status) || 0) + 1);
    }
    for (const [status, count] of byPipeline) {
      console.log(`  ${status}: ${count}`);
    }
    console.log(`\nSample candidates (first 5):`);
    for (const c of candidates.slice(0, 5)) {
      console.log(`  ${c.upc}: "${(c.current_title || '').slice(0, 60)}" [${c.tags.join(', ')}]`);
      for (const url of c.image_urls) {
        console.log(`    ${url.slice(0, 100)}`);
      }
    }
    return;
  }

  writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf-8');
  console.log(`Wrote ${candidates.length} candidates to ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
