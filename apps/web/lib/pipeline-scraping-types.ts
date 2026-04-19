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
    jobType?: 'standard' | 'ai_search';
    /** Explicit enrichment method - takes precedence over jobType */
    enrichment_method?: 'scrapers' | 'ai_search';
    aiSearchConfig?: {
        product_name?: string;
        brand?: string;
        max_search_results?: number;
        max_steps?: number;
        confidence_threshold?: number;
        llm_provider?: 'openai';
        llm_model?: string;
        llm_base_url?: string | null;
        prefer_manufacturer?: boolean;
        fallback_to_static?: boolean;
        max_concurrency?: number;
        extraction_strategy?: 'llm' | 'llm_free' | 'auto';
        cache_enabled?: boolean;
        max_retries?: number;
        timeout?: number;
    };
    /** Maximum cost in USD for AI Search jobs (default: 5.00, max: 10.00) */
    maxAISearchCostUsd?: number;
    /** Brand name from cohort assignment — injected into context items that lack a brand */
    cohortBrand?: string;
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    plannedChunkCount?: number;
    error?: string;
}
