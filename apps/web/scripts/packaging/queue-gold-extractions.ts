/**
 * Queue Gold Packaging Extractions
 *
 * Loads the gold dataset (or candidates) and inserts product_packaging_extractions
 * rows for benchmarking the packaging vision pipeline.
 *
 * Usage:
 *   bun run scripts/packaging/queue-gold-extractions.ts --dry-run
 *   bun run scripts/packaging/queue-gold-extractions.ts --rerun
 *   bun run scripts/packaging/queue-gold-extractions.ts --source=gold_dataset.candidates.json
 *   bun run scripts/packaging/queue-gold-extractions.ts --limit=10
 */

import { createAdminClient } from '../../lib/supabase/server';
import { readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

interface GoldEntry {
  id: string;
  upc?: string;
  image_urls?: string[];
  [key: string]: unknown;
}

interface ExtractionsPayload {
  upc: string;
  status: string;
  trigger: string;
  prompt_version: string;
  schema_version: string;
  image_urls: string[];
  max_attempts: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SOURCE = 'gold_dataset.json';
const PROMPT_VERSION = 'packaging-ocr-then-parse-v1';
const SCHEMA_VERSION = 'packaging-extraction-v1';

// =============================================================================
// Helpers
// =============================================================================

function generateId(upc: string): string {
  return crypto.createHash('md5').update(upc).digest('hex').slice(0, 12);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rerun = args.includes('--rerun');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
  const sourceArg = args.find((a) => a.startsWith('--source='));
  const sourceFile = sourceArg ? sourceArg.split('=')[1] : DEFAULT_SOURCE;

  // Resolve source path (could be in web or scraper benchmark dirs)
  const possiblePaths = [
    path.resolve(__dirname, '../../../apps/scraper/benchmarks/packaging_vision', sourceFile),
    path.resolve(__dirname, '../../../apps/scraper/benchmarks/packaging_vision/gold_dataset.candidates.json'),
    path.resolve(__dirname, '../../../apps/scraper/benchmarks/packaging_vision/gold_dataset.json'),
  ];

  let dataset: { entries: GoldEntry[] };
  for (const p of possiblePaths) {
    try {
      dataset = JSON.parse(readFileSync(p, 'utf-8'));
      console.log(`Loaded ${dataset.entries.length} entries from ${p}`);
      break;
    } catch {
      continue;
    }
  }

  if (!dataset!) {
    console.error('Could not find gold dataset file. Tried:', possiblePaths.join(', '));
    process.exit(1);
  }

  let entries = dataset.entries;
  if (!Number.isFinite(limit)) {
    entries = entries.slice(0, limit);
  }

  const supabase = await createAdminClient();
  const toInsert: ExtractionsPayload[] = [];
  let skippedExisting = 0;
  let missingData = 0;

  for (const entry of entries) {
    const upc = (entry.upc || entry.upc || '').trim();
    const imageUrls = (entry.image_urls || []).filter(
      (u: unknown) => typeof u === 'string' && u.match(/^https?:\/\//),
    );

    if (!upc || imageUrls.length === 0) {
      missingData++;
      continue;
    }

    // Skip if non-stale successful extraction exists (unless --rerun)
    if (!rerun) {
      const { data: existing } = await supabase
        .from('product_packaging_extractions')
        .select('id')
        .eq('upc', upc)
        .eq('status', 'succeeded')
        .eq('is_stale', false)
        .limit(1)
        .maybeSingle();

      if (existing) {
        skippedExisting++;
        continue;
      }
    }

    toInsert.push({
      upc,
      status: 'queued',
      trigger: 'gold_eval',
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      image_urls: imageUrls.slice(0, 2),
      max_attempts: 2,
    });
  }

  if (dryRun) {
    console.log(`\n[Dry Run] Would insert ${toInsert.length} extractions:`);
    console.log(`  Skipped (existing): ${skippedExisting}`);
    console.log(`  Skipped (missing data): ${missingData}`);
    console.log(`\nFirst 5:`);
    for (const item of toInsert.slice(0, 5)) {
      console.log(`  ${item.upc} → ${item.image_urls.length} image(s)`);
    }
    return;
  }

  if (toInsert.length === 0) {
    console.log('Nothing to insert. Use --rerun to reprocess existing entries.');
    return;
  }

  // Batch insert
  const { data: inserted, error } = await supabase
    .from('product_packaging_extractions')
    .insert(toInsert)
    .select('id, upc');

  if (error) {
    console.error('Failed to insert extractions:', error.message);
    process.exit(1);
  }

  console.log(`\nQueued ${inserted?.length || 0} packaging extractions:`);
  if (inserted) {
    for (const row of inserted.slice(0, 10)) {
      console.log(`  ${row.id?.slice(0, 8)}... → UPC ${row.upc}`);
    }
  }
  console.log(`\nSkipped: ${skippedExisting} existing, ${missingData} missing data`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
