/**
 * Enrichment Sources Registry
 * 
 * Unified registry of all enrichment sources (web scrapers).
 * This provides a single source of truth for what sources are available.
 */

import { createClient } from '@/lib/supabase/server';
import type { EnrichmentSource, EnrichableField, SourceType } from './types';

/**
 * Static scraper source definitions.
 * These correspond to YAML configs in BayStateScraper/scrapers/configs/
 */
const SCRAPER_SOURCES: Omit<EnrichmentSource, 'status' | 'enabled' | 'lastFetchAt'>[] = [
  {
    id: 'amazon',
    displayName: 'Amazon',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'brand', 'images', 'weight', 'description'],
  },
  {
    id: 'walmart',
    displayName: 'Walmart',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'brand', 'description', 'images', 'weight', 'upc'],
  },
  {
    id: 'phillips',
    displayName: 'Phillips Pet Food',
    type: 'scraper',
    requiresAuth: true,
    providesFields: ['name', 'brand', 'upc', 'images', 'weight'],
  },
  {
    id: 'bradley',
    displayName: 'Bradley Caldwell',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'brand', 'weight', 'images'],
  },
  {
    id: 'central_pet',
    displayName: 'Central Pet',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'brand', 'weight', 'images'],
  },
  {
    id: 'coastal',
    displayName: 'Coastal Pet',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'brand', 'images'],
  },
  {
    id: 'mazuri',
    displayName: 'Mazuri',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'brand', 'weight', 'images', 'ingredients'],
  },
  {
    id: 'orgill',
    displayName: 'Orgill',
    type: 'scraper',
    requiresAuth: true,
    providesFields: ['name', 'brand', 'weight', 'images'],
  },
  {
    id: 'petfoodex',
    displayName: 'Pet Food Experts',
    type: 'scraper',
    requiresAuth: true,
    providesFields: ['name', 'brand', 'weight', 'images'],
  },
  {
    id: 'baystatepet',
    displayName: 'Bay State Pet (Self)',
    type: 'scraper',
    requiresAuth: false,
    providesFields: ['name', 'description', 'images'],
  },
];

/**
 * Gets all available scraper sources with their current status from the database.
 */
export async function getScraperSources(): Promise<EnrichmentSource[]> {
  const supabase = await createClient();

  // Fetch published configs from the new scraper_configs table
  const { data: configs } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      scraper_type,
      scraper_config_versions!fk_current_version (
        status
      )
    `);

  const publishedConfigs = new Map();
  if (configs) {
    for (const config of configs) {
      const versionStatus = (config.scraper_config_versions as any)?.status;
      // Consider published or active configs as eligible
      if (versionStatus === 'published' || versionStatus === 'active') {
        publishedConfigs.set(config.slug, {
          displayName: config.display_name,
          scraperType: config.scraper_type,
        });
      }
    }
  }

  const result: EnrichmentSource[] = [];
  const handledSlugs = new Set<string>();

  // 1. Process known static sources
  for (const source of SCRAPER_SOURCES) {
    const dbConfig = publishedConfigs.get(source.id);
    handledSlugs.add(source.id);
    
    result.push({
      ...source,
      displayName: dbConfig?.displayName || source.displayName,
      // Default to healthy if published in new DB, otherwise fallback
      status: dbConfig ? 'healthy' : 'unknown',
      enabled: !!dbConfig,
      lastFetchAt: undefined,
    });
  }

  // 2. Append any dynamic sources from DB not in the hardcoded list (e.g. AI scrapers)
  for (const [slug, dbConfig] of publishedConfigs.entries()) {
    if (!handledSlugs.has(slug)) {
      const isAgentic = dbConfig.scraperType === 'agentic';
      result.push({
        id: slug,
        displayName: dbConfig.displayName || slug,
        type: 'scraper',
        requiresAuth: false,
        status: 'healthy',
        enabled: true,
        // Provide standard fields; agentic scrapers typically can extract many fields
        providesFields: isAgentic 
          ? ['name', 'brand', 'images', 'weight', 'description', 'specifications'] 
          : ['name', 'brand', 'images'],
      });
    }
  }

  return result;
}

/**
 * Gets all available enrichment sources (scrapers only).
 */
export async function getAllSources(): Promise<EnrichmentSource[]> {
  return getScraperSources();
}

/**
 * Gets a single source by ID.
 */
export async function getSourceById(sourceId: string): Promise<EnrichmentSource | null> {
  const sources = await getAllSources();
  return sources.find((s) => s.id === sourceId) ?? null;
}
