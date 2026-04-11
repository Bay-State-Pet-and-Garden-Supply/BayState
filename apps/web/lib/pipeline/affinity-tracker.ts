/**
 * Affinity Tracker
 *
 * Records brand-scraper success/failure data after scrape jobs complete.
 * This data feeds the recommendation engine (scraper-recommendations.ts).
 *
 * Usage: Call `recordAffinityFromScrapeResults()` from scraper callback handlers
 * after storing scrape results in products_ingestion.sources.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';

interface AffinityResult {
  /** Whether the extraction returned meaningful product data */
  success: boolean;
  /** Count of non-null data fields returned (name, brand, weight, images, etc.) */
  fieldsExtracted: number;
  /** Count of images found */
  imagesFound: number;
}

interface AffinityRecordInput {
  brandName: string;
  scraperSlug: string;
  results: AffinityResult[];
}

/**
 * Records scraper affinity data for a brand based on scrape results.
 * Upserts into brand_scraper_affinity, incrementing counters and recalculating hit rate.
 */
export async function recordAffinityFromScrapeResults(
  inputs: AffinityRecordInput[]
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }

  const supabase = await createAdminClient();

  for (const input of inputs) {
    const { brandName, scraperSlug, results } = input;

    if (!brandName || !scraperSlug || results.length === 0) {
      continue;
    }

    const normalizedBrand = brandName.trim().toLowerCase();
    const totalAttempts = results.length;
    const successfulResults = results.filter((r) => r.success);
    const successCount = successfulResults.length;
    const avgFields =
      successCount > 0
        ? successfulResults.reduce((sum, r) => sum + r.fieldsExtracted, 0) / successCount
        : 0;
    const avgImages =
      successCount > 0
        ? successfulResults.reduce((sum, r) => sum + r.imagesFound, 0) / successCount
        : 0;

    try {
      // Fetch existing row to merge counters
      const { data: existing } = await supabase
        .from('brand_scraper_affinity')
        .select('total_attempts, successful_extractions, avg_fields_extracted, avg_images_found')
        .eq('brand_name', normalizedBrand)
        .eq('scraper_slug', scraperSlug)
        .single();

      const prevAttempts = existing?.total_attempts ?? 0;
      const prevSuccesses = existing?.successful_extractions ?? 0;
      const prevAvgFields = existing?.avg_fields_extracted ?? 0;
      const prevAvgImages = existing?.avg_images_found ?? 0;

      const newTotalAttempts = prevAttempts + totalAttempts;
      const newTotalSuccesses = prevSuccesses + successCount;
      const newHitRate = newTotalAttempts > 0 ? newTotalSuccesses / newTotalAttempts : 0;

      // Weighted running average for quality metrics
      const newAvgFields =
        newTotalSuccesses > 0
          ? (prevAvgFields * prevSuccesses + avgFields * successCount) / newTotalSuccesses
          : 0;
      const newAvgImages =
        newTotalSuccesses > 0
          ? (prevAvgImages * prevSuccesses + avgImages * successCount) / newTotalSuccesses
          : 0;

      const upsertPayload = {
        brand_name: normalizedBrand,
        scraper_slug: scraperSlug,
        total_attempts: newTotalAttempts,
        successful_extractions: newTotalSuccesses,
        hit_rate: Math.round(newHitRate * 10000) / 10000,
        avg_fields_extracted: Math.round(newAvgFields * 100) / 100,
        avg_images_found: Math.round(newAvgImages * 100) / 100,
        last_attempt_at: new Date().toISOString(),
        ...(successCount > 0 ? { last_success_at: new Date().toISOString() } : {}),
      };

      const { error } = await supabase
        .from('brand_scraper_affinity')
        .upsert(upsertPayload, { onConflict: 'brand_name,scraper_slug' });

      if (error) {
        console.error(
          `[Affinity Tracker] Failed to upsert affinity for brand="${normalizedBrand}", scraper="${scraperSlug}":`,
          error
        );
      }
    } catch (err) {
      console.error(
        `[Affinity Tracker] Error recording affinity for brand="${normalizedBrand}", scraper="${scraperSlug}":`,
        err
      );
    }
  }
}

/**
 * Extracts brand name from a cohort or product context for affinity tracking.
 * Checks cohort brand_name first, then falls back to product catalog.
 */
export async function resolveBrandForCohort(cohortId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from('cohort_batches')
    .select('brand_name, brand_id, brands(name)')
    .eq('id', cohortId)
    .single();

  if (!cohort) {
    return null;
  }

  // Prefer explicit brand_name, fall back to joined brand record
  if (cohort.brand_name) {
    return cohort.brand_name;
  }

  const brandRecord = Array.isArray(cohort.brands) ? cohort.brands[0] : cohort.brands;
  if (brandRecord && typeof brandRecord === 'object' && 'name' in brandRecord) {
    return (brandRecord as { name: string }).name;
  }

  return null;
}

/**
 * Convenience: Given a completed scrape job with cohort context, record affinity
 * for all scrapers used against the cohort's brand.
 */
export async function recordAffinityForCohortJob(
  cohortId: string,
  scraperSlugs: string[],
  perScraperResults: Record<string, AffinityResult[]>
): Promise<void> {
  const brandName = await resolveBrandForCohort(cohortId);
  if (!brandName) {
    return;
  }

  const inputs: AffinityRecordInput[] = scraperSlugs
    .filter((slug) => perScraperResults[slug] && perScraperResults[slug].length > 0)
    .map((slug) => ({
      brandName,
      scraperSlug: slug,
      results: perScraperResults[slug],
    }));

  await recordAffinityFromScrapeResults(inputs);
}
