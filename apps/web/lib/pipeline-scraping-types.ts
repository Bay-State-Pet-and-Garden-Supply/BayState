export interface PlannedScrapeChunk {
    chunk_index: number;
    skus: string[];
    scrapers: string[];
    planned_work_units: number;
    sku_slice_index?: number;
    site_group_key?: string;
    site_group_label?: string;
    site_domain?: string | null;
    scraper_count?: number;
}

export interface PlannedScrapeJob {
    chunks: PlannedScrapeChunk[];
    metadata: Record<string, unknown>;
    plannedChunkCount: number;
    plannedWorkUnits: number;
}

export interface OfficialBrandCohortContext {
    id: string;
    brandId: string;
    brandName: string;
    officialDomains?: string[];
    preferredDomains?: string[];
}

/**
 * Options for scraping jobs.
 */
export interface ScrapeOptions {
    /** Workers per runner (default: 3) */
    maxWorkers?: number;
    /** Run in test mode */
    testMode?: boolean;
    /** Specific scrapers to use (empty = all) */
    scrapers?: string[];
    maxRunners?: number;
    /** Maximum retry attempts before terminal failure (default: 3) */
    maxAttempts?: number;
    /** Number of SKUs per chunk (default: 50) */
    chunkSize?: number;
    jobType?: 'standard' | 'official_brand' | 'deep_research';
    /** Explicit enrichment method - takes precedence over jobType */
    enrichment_method?: 'scrapers' | 'official_brand' | 'deep_research';
    /** Official Brand phase. Discovery is the default for Official Brand. */
    officialBrandPhase?: 'url_discovery' | 'extraction';
    /** Official Brand extraction targets keyed by SKU. Bypasses URL discovery. */
    officialBrandUrlsBySku?: Record<string, string>;
    /** Source of each extraction target, used for candidate audit rows and callback reconciliation. */
    officialBrandUrlSourceBySku?: Record<string, 'manual' | 'serper'>;
    /** Brand name from cohort assignment — injected into context items that lack a brand */
    cohortBrand?: string;
    /** Cohort-scoped context for Official Brand jobs */
    officialBrandCohort?: OfficialBrandCohortContext;
    /** Cohort-scoped context for Deep Research jobs */
    deepResearchCohort?: OfficialBrandCohortContext;
    /** Maximum fallback URLs to attempt during Official Brand extraction (default: 3) */
    officialBrandMaxFallbacks?: number;
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    plannedChunkCount?: number;
    error?: string;
}
