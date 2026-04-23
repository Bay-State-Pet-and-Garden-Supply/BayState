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
    jobType?: 'standard' | 'official_brand';
    /** Explicit enrichment method - takes precedence over jobType */
    enrichment_method?: 'scrapers' | 'official_brand';
    /** Brand name from cohort assignment — injected into context items that lack a brand */
    cohortBrand?: string;
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    plannedChunkCount?: number;
    error?: string;
}
