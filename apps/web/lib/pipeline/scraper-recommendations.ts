/**
 * Scraper Recommendations Engine
 *
 * Given a brand name, returns ranked scraper recommendations based on
 * historical affinity data from brand_scraper_affinity.
 *
 * Confidence tiers:
 *   high:     ≥5 attempts AND ≥60% hit rate
 *   medium:   ≥3 attempts AND ≥40% hit rate
 *   low:      <3 attempts OR <40% hit rate (but has some history)
 *   untested: no history for this brand
 */

import { createClient } from '@/lib/supabase/server';

export type RecommendationConfidence = 'high' | 'medium' | 'low' | 'untested';

export interface ScraperRecommendation {
  /** Scraper slug (matches scraper_configs.slug) */
  scraper_slug: string;
  /** Human-readable scraper name */
  scraper_name: string;
  /** Historical hit rate for this brand (0.0–1.0) */
  hit_rate: number;
  /** Number of times this scraper has been tried for this brand */
  total_attempts: number;
  /** Number of successful extractions */
  successful_extractions: number;
  /** Confidence tier */
  confidence: RecommendationConfidence;
  /** Human-readable explanation */
  reason: string;
  /** Average non-null fields per successful extraction */
  avg_fields_extracted: number;
  /** Average images per successful extraction */
  avg_images_found: number;
  /** Whether this scraper is pre-selected (high/medium confidence) */
  preselected: boolean;
}

function classifyConfidence(
  totalAttempts: number,
  hitRate: number
): RecommendationConfidence {
  if (totalAttempts >= 5 && hitRate >= 0.6) {
    return 'high';
  }
  if (totalAttempts >= 3 && hitRate >= 0.4) {
    return 'medium';
  }
  return 'low';
}

function buildReason(
  confidence: RecommendationConfidence,
  totalAttempts: number,
  hitRate: number,
  scraperName: string
): string {
  const pct = Math.round(hitRate * 100);

  switch (confidence) {
    case 'high':
      return `${scraperName} has a ${pct}% success rate over ${totalAttempts} attempts for this brand.`;
    case 'medium':
      return `${scraperName} shows promise with ${pct}% success rate (${totalAttempts} attempts). More data needed.`;
    case 'low':
      return `${scraperName} has limited or low success (${pct}% over ${totalAttempts} attempts).`;
    case 'untested':
      return `${scraperName} has not been tested for this brand yet.`;
  }
}

const CONFIDENCE_SORT_ORDER: Record<RecommendationConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
  untested: 3,
};

/**
 * Returns ranked scraper recommendations for a given brand.
 *
 * Fetches affinity data for the brand, then fills in any scrapers
 * that have no history as "untested". Always includes ai_search
 * as a fallback.
 */
export async function getScraperRecommendations(
  brandName: string
): Promise<ScraperRecommendation[]> {
  if (!brandName || brandName.trim().length === 0) {
    return [];
  }

  const normalizedBrand = brandName.trim().toLowerCase();
  const supabase = await createClient();

  // Fetch affinity data for this brand
  const { data: affinityRows, error: affinityError } = await supabase
    .from('brand_scraper_affinity')
    .select('*')
    .eq('brand_name', normalizedBrand)
    .order('hit_rate', { ascending: false });

  if (affinityError) {
    console.error('[Recommendations] Failed to fetch affinity data:', affinityError);
  }

  // Fetch all available scrapers
  const { data: scraperRows, error: scraperError } = await supabase
    .from('scraper_configs')
    .select('slug, name');

  if (scraperError) {
    console.error('[Recommendations] Failed to fetch scraper configs:', scraperError);
  }

  const allScrapers = (scraperRows || []).map((row: { slug: string; name: string | null }) => ({
    slug: row.slug,
    name: row.name || row.slug,
  }));

  // Build affinity lookup
  const affinityBySlug = new Map<string, any>();
  (affinityRows || []).forEach((row) => {
    affinityBySlug.set(row.scraper_slug, row);
  });

  // Build recommendations for each scraper
  const recommendations: ScraperRecommendation[] = allScrapers.map((scraper) => {
    const affinity = affinityBySlug.get(scraper.slug);

    if (!affinity) {
      return {
        scraper_slug: scraper.slug,
        scraper_name: scraper.name,
        hit_rate: 0,
        total_attempts: 0,
        successful_extractions: 0,
        confidence: 'untested' as RecommendationConfidence,
        reason: buildReason('untested', 0, 0, scraper.name),
        avg_fields_extracted: 0,
        avg_images_found: 0,
        preselected: false,
      };
    }

    const hitRate = Number(affinity.hit_rate) || 0;
    const totalAttempts = affinity.total_attempts || 0;
    const confidence = classifyConfidence(totalAttempts, hitRate);

    return {
      scraper_slug: scraper.slug,
      scraper_name: scraper.name,
      hit_rate: hitRate,
      total_attempts: totalAttempts,
      successful_extractions: affinity.successful_extractions || 0,
      confidence,
      reason: buildReason(confidence, totalAttempts, hitRate, scraper.name),
      avg_fields_extracted: Number(affinity.avg_fields_extracted) || 0,
      avg_images_found: Number(affinity.avg_images_found) || 0,
      preselected: confidence === 'high' || confidence === 'medium',
    };
  });

  // Sort: high confidence first, then by hit rate within tier
  recommendations.sort((a, b) => {
    const tierDiff = CONFIDENCE_SORT_ORDER[a.confidence] - CONFIDENCE_SORT_ORDER[b.confidence];
    if (tierDiff !== 0) {
      return tierDiff;
    }
    return b.hit_rate - a.hit_rate;
  });

  // Ensure ai_search is always present as a fallback recommendation
  const hasAiSearch = recommendations.some((r) => r.scraper_slug === 'ai_search' || r.scraper_slug === 'ai-search');
  if (!hasAiSearch) {
    const aiAffinity = affinityBySlug.get('ai_search') || affinityBySlug.get('ai-search');
    const hitRate = aiAffinity ? Number(aiAffinity.hit_rate) || 0 : 0;
    const totalAttempts = aiAffinity?.total_attempts || 0;
    const confidence = aiAffinity ? classifyConfidence(totalAttempts, hitRate) : 'untested' as RecommendationConfidence;

    recommendations.push({
      scraper_slug: 'ai_search',
      scraper_name: 'AI Search',
      hit_rate: hitRate,
      total_attempts: totalAttempts,
      successful_extractions: aiAffinity?.successful_extractions || 0,
      confidence,
      reason: buildReason(confidence, totalAttempts, hitRate, 'AI Search'),
      avg_fields_extracted: Number(aiAffinity?.avg_fields_extracted) || 0,
      avg_images_found: Number(aiAffinity?.avg_images_found) || 0,
      preselected: confidence === 'high' || confidence === 'medium',
    });
  }

  return recommendations;
}

/**
 * Returns a summary of which brands have the most affinity data.
 * Useful for displaying global brand coverage in admin dashboards.
 */
export async function getBrandAffinitySummary(): Promise<
  Array<{
    brand_name: string;
    scrapers_tested: number;
    best_hit_rate: number;
    total_attempts: number;
  }>
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('brand_scraper_affinity')
    .select('brand_name, hit_rate, total_attempts')
    .order('brand_name');

  if (error) {
    console.error('[Recommendations] Failed to fetch brand summary:', error);
    return [];
  }

  // Aggregate per brand
  const byBrand = new Map<string, { scrapers: number; bestRate: number; attempts: number }>();
  (data || []).forEach((row) => {
    const existing = byBrand.get(row.brand_name) || { scrapers: 0, bestRate: 0, attempts: 0 };
    existing.scrapers++;
    existing.bestRate = Math.max(existing.bestRate, Number(row.hit_rate) || 0);
    existing.attempts += row.total_attempts || 0;
    byBrand.set(row.brand_name, existing);
  });

  return Array.from(byBrand.entries())
    .map(([brand, stats]) => ({
      brand_name: brand,
      scrapers_tested: stats.scrapers,
      best_hit_rate: stats.bestRate,
      total_attempts: stats.attempts,
    }))
    .sort((a, b) => b.total_attempts - a.total_attempts);
}
