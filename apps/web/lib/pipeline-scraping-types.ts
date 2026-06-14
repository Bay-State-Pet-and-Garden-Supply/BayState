
/**
 * Options for source cascade scraping jobs.
 */
export interface ScrapeOptions {
    /** Workers per runner (default: 3) */
    maxWorkers?: number;
    /** Run in test mode */
    testMode?: boolean;
    maxRunners?: number;
    /** Maximum retry attempts before terminal failure (default: 3) */
    maxAttempts?: number;
    /** Number of UPCs per chunk (default: 50) */
    chunkSize?: number;
    /**
     * Retry mode for the extraction run.
     * - "all" (default): run every enabled source in the cascade
     * - "failed_or_untried": only run sources that previously errored or were never attempted
     */
    retryMode?: "all" | "failed_or_untried";
    /**
     * Current pipeline status of the products being submitted.
     * Controls which products are eligible for status transition.
     */
    requestedFromStatus?: "imported" | "processed" | "needs_attention" | "extracting";
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    plannedChunkCount?: number;
    error?: string;
    /** UPCs that could not be included (e.g. missing brand, no cascade) */
    skippedUpcs?: Array<{ upc: string; reason: string }>;
}
