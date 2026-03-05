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

  // Fetch scraper status from scrapers table
  const { data: scrapers } = await supabase
    .from('scrapers')
    .select('name, status, disabled, last_tested');

  const scraperStatusMap = new Map(
    scrapers?.map((s) => [s.name, { status: s.status, disabled: s.disabled, lastTested: s.last_tested }]) ?? []
  );

  return SCRAPER_SOURCES.map((source) => {
    const dbStatus = scraperStatusMap.get(source.id);
    return {
      ...source,
      status: (dbStatus?.status as EnrichmentSource['status']) ?? 'unknown',
      enabled: !dbStatus?.disabled,
      lastFetchAt: dbStatus?.lastTested ?? undefined,
    };
  });
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
