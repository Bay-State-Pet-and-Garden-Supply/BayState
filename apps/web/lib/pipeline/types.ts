/**
 * Pipeline Types
 * Distinguishes persisted ingestion statuses from derived admin tabs.
 */

/** Persisted pipeline statuses stored in the database. */
export const PERSISTED_PIPELINE_STATUSES = [
  "imported",
  "scraped",
  "finalized",
  "failed",
] as const;

export type PersistedPipelineStatus =
  (typeof PERSISTED_PIPELINE_STATUSES)[number];

/** UI-only tabs derived from other records or active work in progress. */
export const DERIVED_PIPELINE_TABS = [
  "monitoring",
  "consolidating",
  "published",
  "images",
  "export",
] as const;

export type PipelineTab = (typeof DERIVED_PIPELINE_TABS)[number];

/** Legacy review tab retained until the admin UI finishes converging on canonical names. */
export const LEGACY_PIPELINE_TABS = ["consolidated"] as const;

export type LegacyPipelineTab = (typeof LEGACY_PIPELINE_TABS)[number];

/** Combined set for UI rendering and migration compatibility. */
export const ALL_PIPELINE_STATUSES = [
  ...PERSISTED_PIPELINE_STATUSES,
  ...DERIVED_PIPELINE_TABS,
] as const;

export const DISPLAYABLE_PIPELINE_STATUSES = [
  ...ALL_PIPELINE_STATUSES,
  ...LEGACY_PIPELINE_TABS,
  "scraping",
  "finalizing",
] as const;

export type PipelineStatus =
  | PersistedPipelineStatus
  | "monitoring"
  | "published";

const PERSISTED_PIPELINE_STATUS_SET = new Set<string>(
  PERSISTED_PIPELINE_STATUSES
);

const DERIVED_PIPELINE_TAB_SET = new Set<string>(DERIVED_PIPELINE_TABS);

const ALL_PIPELINE_STATUS_SET = new Set<string>(DISPLAYABLE_PIPELINE_STATUSES);

export function isPersistedStatus(
  value: string
): value is PersistedPipelineStatus {
  return PERSISTED_PIPELINE_STATUS_SET.has(value);
}

export function isDerivedTab(value: string): value is PipelineTab {
  return DERIVED_PIPELINE_TAB_SET.has(value);
}

/**
 * 5-tab UI workflow tabs.
 * These are DERIVED tabs based on persisted status + active jobs.
 * The 'scraping' tab shows products being scraped (imported status + active scrape job).
 * The 'consolidating' tab shows products being consolidated (finalized status + active consolidation).
 * The 'finalizing' tab shows products ready for final review (finalized + no active work).
 */
export const PIPELINE_TABS = [
  "imported",
  "scraping",
  "scraped",
  "consolidating",
  "finalizing",
] as const;

export type PipelineTab5 = (typeof PIPELINE_TABS)[number];

/**
 * Set for fast tab membership checks
 */
const PIPELINE_TAB_5_SET = new Set<string>(PIPELINE_TABS);

/**
 * Derives the UI tab from product status and active job states.
 *
 * Logic:
 * - 'imported' → product is waiting for scraping
 * - 'scraping' → product has 'imported' status + active scrape job
 * - 'scraped' → product has 'scraped' status + no active scrape job
 * - 'consolidating' → product has 'finalized' status + active consolidation job
 * - 'finalizing' → product has 'finalized' status + no active consolidation
 */
export function statusToTab(
  status: PersistedPipelineStatus,
  hasActiveScrapeJob: boolean,
  hasActiveConsolidation: boolean
): PipelineTab5 {
  switch (status) {
    case "imported":
      return hasActiveScrapeJob ? "scraping" : "imported";
    case "scraped":
      return "scraped";
    case "finalized":
      return hasActiveConsolidation ? "consolidating" : "finalizing";
    case "failed":
      return "imported";
    default:
      return "imported";
  }
}

/**
 * Returns Supabase query filter for a given tab.
 * Used to filter products displayed in each UI tab.
 */
export function tabToQueryFilter(tab: PipelineTab5): {
  status?: PersistedPipelineStatus;
  scrapeJobActive?: boolean;
  consolidationActive?: boolean;
} {
  switch (tab) {
    case "imported":
      return { status: "imported", scrapeJobActive: false };
    case "scraping":
      return { status: "imported", scrapeJobActive: true };
    case "scraped":
      return { status: "scraped" };
    case "consolidating":
      return { status: "finalized", consolidationActive: true };
    case "finalizing":
      return { status: "finalized", consolidationActive: false };
    default:
      return { status: "imported" };
  }
}

export function isPipelineStatus(value: string): value is PipelineStage {
  return ALL_PIPELINE_STATUS_SET.has(value);
}

export type PipelineStage = PipelineStatus | "scraping" | "consolidating" | "finalizing" | "images" | "export";

type StageConfigKey =
  | PipelineStage
  | PersistedPipelineStatus
  | PipelineTab;

/**
 * Selected image with metadata
 */
export interface SelectedImage {
  url: string;
  selectedAt: string;
}

/**
 * Product in the ingestion pipeline
 * Represents the full lifecycle of a product from import to publication
 */
export interface PipelineProduct {
  id?: string;
  /** Unique product identifier (matches SKU) */
  sku: string;
  /** Raw imported data */
  input: {
    name?: string;
    price?: number;
  } | null;
  /** Scraped data from multiple sources keyed by source ID */
  sources: Record<string, unknown>;
  /** AI-consolidated product data from all sources */
  consolidated: {
    name?: string;
    description?: string;
    price?: number;
    images?: string[];
    brand_id?: string;
    is_featured?: boolean;
  } | null;
  pipeline_status: PersistedPipelineStatus;
  /** Image URLs from scraping */
  image_candidates?: string[];
  /** Selected images with metadata */
  selected_images?: SelectedImage[];
  /** Confidence score from AI consolidation (0-1) */
  confidence_score?: number;
  /** Error message if processing failed */
  error_message?: string;
  /** Number of retry attempts */
  retry_count?: number;
  /** Record creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Aggregate count of products per status
 */
export interface StatusCount {
  /** Pipeline status value */
  status: PipelineStage;
  /** Number of products in this status */
  count: number;
}

/**
 * Configuration for displaying a pipeline stage
 */
export interface StageConfig {
  /** Human-readable stage label */
  label: string;
  /** Hex color for UI display */
  color: string;
  /** Brief description of the stage */
  description: string;
}

/**
 * Stage display configurations
 * Maps each pipeline status to its UI representation
 */
export const STAGE_CONFIG: Record<StageConfigKey, StageConfig> = {
  imported: {
    label: "Imported",
    color: "#6B7280",
    description: "Product data has been imported into the system",
  },
  monitoring: {
    label: "Monitoring",
    color: "#F59E0B",
    description: "Track active scraper jobs and progress",
  },
  scraped: {
    label: "Scraped",
    color: "#3B82F6",
    description: "Product data has been scraped from source websites",
  },
  consolidating: {
    label: "Consolidating",
    color: "#8B5CF6",
    description: "Track active AI consolidation batches",
  },
  finalized: {
    label: "Finalized",
    color: "#F59E0B",
    description: "Product data is ready for downstream publishing workflows",
  },
  failed: {
    label: "Failed",
    color: "#DC2626",
    description: "Product processing failed and needs admin retry",
  },
  published: {
    label: "Published",
    color: "#008850",
    description: "Product is live on the storefront",
  },
  images: {
    label: "Images",
    color: "#06B6D4",
    description: "Manage selected product images before export",
  },
  export: {
    label: "Export",
    color: "#6366F1",
    description: "Prepare finalized products for export workflows",
  },
  scraping: {
    label: "Scraping",
    color: "#3B82F6",
    description: "Products currently being scraped",
  },
  finalizing: {
    label: "Finalizing",
    color: "#F59E0B",
    description: "Products ready for final review",
  },
} as const;