"use server";

import { createClient } from "@/lib/supabase/server";

export interface BrandScraperMapping {
  id: string;
  brand_id: string;
  scraper_config_id: string;
  scraper_slug: string;
  scraper_name: string;
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MappingInput {
  scraperConfigId: string;
  priority: number;
  notes?: string;
  isActive?: boolean;
}

interface ScraperConfigRef {
  slug: string;
  display_name: string | null;
}

interface BrandScraperMappingRow {
  id: string;
  brand_id: string;
  scraper_config_id: string;
  scraper_configs: ScraperConfigRef | ScraperConfigRef[] | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// Returns all mappings for a brand, ordered by priority DESC, then created_at ASC
export async function getBrandScraperMappings(
  brandId: string,
): Promise<BrandScraperMapping[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_scraper_mappings")
    .select("*, scraper_configs!inner(slug, display_name)")
    .eq("brand_id", brandId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to get brand scraper mappings: ${error.message}`);
  }

  return ((data as BrandScraperMappingRow[] | null) ?? []).map((row) => {
    const cfg = Array.isArray(row.scraper_configs)
      ? row.scraper_configs[0]
      : row.scraper_configs;
    return {
      id: row.id,
      brand_id: row.brand_id,
      scraper_config_id: row.scraper_config_id,
      scraper_slug: cfg?.slug ?? "",
      scraper_name: cfg?.display_name || cfg?.slug || "",
      priority: row.priority,
      is_active: row.is_active,
      notes: row.notes,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

// Transactionally replaces all mappings for a brand
export async function setBrandScraperMappings(
  brandId: string,
  mappings: MappingInput[],
  userId: string,
): Promise<void> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("brand_scraper_mappings")
    .delete()
    .eq("brand_id", brandId);

  if (deleteError) {
    throw new Error(
      `Failed to clear existing mappings: ${deleteError.message}`,
    );
  }

  if (mappings.length === 0) return;

  const { error: insertError } = await supabase
    .from("brand_scraper_mappings")
    .insert(
      mappings.map((m) => ({
        brand_id: brandId,
        scraper_config_id: m.scraperConfigId,
        priority: m.priority,
        is_active: m.isActive ?? true,
        notes: m.notes ?? null,
        created_by: userId,
        updated_by: userId,
      })),
    );

  if (insertError) {
    throw new Error(`Failed to insert mappings: ${insertError.message}`);
  }
}

export interface MergedScraperRecommendation {
  scraper_slug: string;
  scraper_name: string;
  hit_rate: number;
  total_attempts: number;
  successful_extractions: number;
  confidence: "high" | "medium" | "low" | "untested" | "mapped";
  reason: string;
  avg_fields_extracted: number;
  avg_images_found: number;
  preselected: boolean;
  is_explicit: boolean;
  is_active: boolean;
}

interface AffinityRow {
  scraper_slug: string;
  brand_name: string;
  hit_rate: number;
  total_attempts: number;
  successful_extractions: number;
  avg_fields_extracted: number;
  avg_images_found: number;
}

interface ScraperConfigRow {
  id: string;
  slug: string;
  display_name: string | null;
}

function confidenceFromHitRate(
  hitRate: number,
  totalAttempts: number,
): {
  confidence: MergedScraperRecommendation["confidence"];
  reason: string;
} {
  if (hitRate >= 0.8) {
    return {
      confidence: "high",
      reason: `Strong historical performance (${Math.round(hitRate * 100)}% success)`,
    };
  }
  if (hitRate >= 0.5) {
    return {
      confidence: "medium",
      reason: `Moderate historical performance (${Math.round(hitRate * 100)}% success)`,
    };
  }
  if (hitRate > 0) {
    return {
      confidence: "low",
      reason: `Limited historical performance (${Math.round(hitRate * 100)}% success)`,
    };
  }
  return {
    confidence: "low",
    reason: `No successful extractions in ${totalAttempts} attempts`,
  };
}

export async function getScraperRecommendationsWithMappings(
  brandName: string,
  brandId?: string,
): Promise<MergedScraperRecommendation[]> {
  const supabase = await createClient();
  const normalizedBrandName = brandName.toLowerCase().trim();

  const explicitPromise = brandId
    ? supabase
        .from("brand_scraper_mappings")
        .select("*, scraper_configs!inner(slug, display_name)")
        .eq("brand_id", brandId)
    : Promise.resolve({ data: [], error: null });

  const affinityPromise = supabase
    .from("brand_scraper_affinity")
    .select("*")
    .eq("brand_name", normalizedBrandName);

  const scrapersPromise = supabase
    .from("scraper_configs")
    .select("id, slug, display_name");

  const [
    { data: explicitData, error: explicitError },
    { data: affinityData, error: affinityError },
    { data: scrapersData, error: scrapersError },
  ] = await Promise.all([explicitPromise, affinityPromise, scrapersPromise]);

  if (explicitError) {
    throw new Error(
      `Failed to load explicit mappings: ${explicitError.message}`,
    );
  }
  if (affinityError) {
    throw new Error(
      `Failed to load affinity stats: ${affinityError.message}`,
    );
  }
  if (scrapersError) {
    throw new Error(
      `Failed to load scraper configs: ${scrapersError.message}`,
    );
  }

  const allScrapers = (scrapersData as ScraperConfigRow[] | null) ?? [];
  const scraperById = new Map(allScrapers.map((s) => [s.id, s]));
  const scraperBySlug = new Map(allScrapers.map((s) => [s.slug, s]));

  const affinityBySlug = new Map(
    ((affinityData as AffinityRow[] | null) ?? []).map((a) => [a.scraper_slug, a]),
  );

  const explicitRows = (explicitData as BrandScraperMappingRow[] | null) ?? [];
  const explicitActive: Array<{
    row: BrandScraperMappingRow;
    scraper: ScraperConfigRow;
  }> = [];
  const explicitInactiveSlugs = new Set<string>();

  for (const row of explicitRows) {
    const cfg = Array.isArray(row.scraper_configs)
      ? row.scraper_configs[0]
      : row.scraper_configs;
    if (!cfg) continue;
    const scraper = scraperById.get(row.scraper_config_id);
    if (!scraper) continue;

    if (row.is_active) {
      explicitActive.push({ row, scraper });
    } else {
      explicitInactiveSlugs.add(scraper.slug);
    }
  }

  explicitActive.sort((a, b) => {
    if (b.row.priority !== a.row.priority) {
      return b.row.priority - a.row.priority;
    }
    return (
      new Date(a.row.created_at).getTime() -
      new Date(b.row.created_at).getTime()
    );
  });

  const result: MergedScraperRecommendation[] = [];
  const seenSlugs = new Set<string>();

  for (const { scraper } of explicitActive) {
    seenSlugs.add(scraper.slug);
    const affinity = affinityBySlug.get(scraper.slug);
    result.push({
      scraper_slug: scraper.slug,
      scraper_name: scraper.display_name || scraper.slug,
      hit_rate: affinity?.hit_rate ?? 0,
      total_attempts: affinity?.total_attempts ?? 0,
      successful_extractions: affinity?.successful_extractions ?? 0,
      confidence: "mapped",
      reason: "Explicitly mapped by admin",
      avg_fields_extracted: affinity?.avg_fields_extracted ?? 0,
      avg_images_found: affinity?.avg_images_found ?? 0,
      preselected: true,
      is_explicit: true,
      is_active: true,
    });
  }

  for (const [slug, affinity] of affinityBySlug) {
    if (seenSlugs.has(slug) || explicitInactiveSlugs.has(slug)) continue;
    const scraper = scraperBySlug.get(slug);
    if (!scraper) continue;

    seenSlugs.add(slug);
    const { confidence, reason } = confidenceFromHitRate(
      affinity.hit_rate,
      affinity.total_attempts,
    );

    result.push({
      scraper_slug: scraper.slug,
      scraper_name: scraper.display_name || scraper.slug,
      hit_rate: affinity.hit_rate,
      total_attempts: affinity.total_attempts,
      successful_extractions: affinity.successful_extractions,
      confidence,
      reason,
      avg_fields_extracted: affinity.avg_fields_extracted,
      avg_images_found: affinity.avg_images_found,
      preselected: false,
      is_explicit: false,
      is_active: false,
    });
  }

  for (const scraper of allScrapers) {
    if (seenSlugs.has(scraper.slug) || explicitInactiveSlugs.has(scraper.slug))
      continue;
    seenSlugs.add(scraper.slug);
    result.push({
      scraper_slug: scraper.slug,
      scraper_name: scraper.display_name || scraper.slug,
      hit_rate: 0,
      total_attempts: 0,
      successful_extractions: 0,
      confidence: "untested",
      reason: "No historical data for this brand",
      avg_fields_extracted: 0,
      avg_images_found: 0,
      preselected: false,
      is_explicit: false,
      is_active: false,
    });
  }

  return result;
}
