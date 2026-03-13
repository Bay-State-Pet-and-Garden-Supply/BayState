/**
 * Enrichment Sources Registry
 * 
 * Unified registry of all enrichment sources (web scrapers).
 * This provides a single source of truth for what sources are available.
 */

import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
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
    id: 'central-pet',
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
 * Gets all available scraper sources with their current status from the local YAML configurations.
 */
export async function getScraperSources(): Promise<EnrichmentSource[]> {
  // Fetch configs from the local YAML files
  const configs = await getLocalScraperConfigs();

  const activeConfigs = new Map();
  if (configs) {
    for (const config of configs) {
      // Consider active or draft configs as eligible
      if (config.status === 'active' || config.status === 'draft') {
        activeConfigs.set(config.slug, {
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
    const yamlConfig = activeConfigs.get(source.id);
    handledSlugs.add(source.id);

    result.push({
      ...source,
      displayName: yamlConfig?.displayName || source.displayName,
      // Default to healthy if found in YAML, otherwise fallback
      status: yamlConfig ? 'healthy' : 'unknown',
      enabled: !!yamlConfig,
      lastFetchAt: undefined,
    });
  }

  // 2. Append any dynamic sources from YAML not in the hardcoded list (e.g. AI scrapers)
  for (const [slug, yamlConfig] of activeConfigs.entries()) {
    if (!handledSlugs.has(slug)) {
      const isAgentic = yamlConfig.scraperType === 'agentic';
      result.push({
        id: slug,
        displayName: yamlConfig.displayName || slug,
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
 * Gets all available enrichment sources (scrapers + AI discovery).
 */
export async function getAllSources(): Promise<EnrichmentSource[]> {
  const scraperSources = await getScraperSources();

  // Add AI Search as a built-in source
  const aiSearchSource: EnrichmentSource = {
    id: 'ai_search',
    displayName: 'AI Search',
    type: 'ai_search',
    requiresAuth: false,
    status: 'healthy',
    enabled: true,
    providesFields: ['name', 'brand', 'images', 'weight', 'description', 'specifications', 'upc'],
  };

  return [...scraperSources, aiSearchSource];
}

/**
 * Gets a single source by ID.
 */
export async function getSourceById(sourceId: string): Promise<EnrichmentSource | null> {
  const sources = await getAllSources();
  return sources.find((s) => s.id === sourceId) ?? null;
}
