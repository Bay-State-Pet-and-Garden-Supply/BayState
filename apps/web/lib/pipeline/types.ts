/**
 * Pipeline types
 * Distinguishes persisted ingestion statuses from admin workflow stages.
 */

/** Canonical statuses persisted in products_ingestion.pipeline_status. */
export const PERSISTED_PIPELINE_STATUSES = [
  "imported",
  "scraped",
  "finalized",
  "failed",
] as const;

export type PersistedPipelineStatus =
  (typeof PERSISTED_PIPELINE_STATUSES)[number];

/** Main admin workflow tabs shown in the live pipeline UI. */
export const PIPELINE_TABS = [
  "imported",
  "scraping",
  "scraped",
  "consolidating",
  "finalizing",
  "failed",
  "published",
] as const;

export type PipelineStage = (typeof PIPELINE_TABS)[number];
export type PipelineTab = PipelineStage;

/** Tabs that are derived from persisted status plus active work or publish state. */
export const DERIVED_PIPELINE_TABS = [
  "scraping",
  "consolidating",
  "finalizing",
  "published",
] as const;

export type DerivedPipelineTab = (typeof DERIVED_PIPELINE_TABS)[number];

/** Status-like labels that appear in badges, counts, or actions. */
export type PipelineStatus = PersistedPipelineStatus | "published";

/** Displayable status or stage labels used by shared UI primitives. */
export type PipelineDisplayStatus = PersistedPipelineStatus | PipelineStage;

const PERSISTED_PIPELINE_STATUS_SET = new Set<string>(
  PERSISTED_PIPELINE_STATUSES,
);

const DERIVED_PIPELINE_TAB_SET = new Set<string>(DERIVED_PIPELINE_TABS);
const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_TABS);

export function isPersistedStatus(
  value: string,
): value is PersistedPipelineStatus {
  return PERSISTED_PIPELINE_STATUS_SET.has(value);
}

export function isDerivedTab(value: string): value is DerivedPipelineTab {
  return DERIVED_PIPELINE_TAB_SET.has(value);
}

export function isPipelineStage(value: string): value is PipelineStage {
  return PIPELINE_STAGE_SET.has(value);
}

/**
 * Returns the persisted status needed to hydrate a route stage, if any.
 */
export function getStageDataStatus(
  stage: PipelineStage,
): PersistedPipelineStatus | null {
  switch (stage) {
    case "imported":
      return "imported";
    case "scraped":
      return "scraped";
    case "finalizing":
      return "finalized";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

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
  /** Product line / Cohort identifier for batch processing */
  product_line?: string | null;
  /** ID of the cohort batch this product belongs to */
  cohort_id?: string | null;
  /** Record creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Aggregate count of products per persisted status plus the derived published tab.
 */
export interface StatusCount {
  /** Pipeline status value */
  status: PipelineStatus;
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

type StageConfigKey = PersistedPipelineStatus | PipelineStage;

/**
 * Stage display configurations
 * Maps each pipeline status or stage to its UI representation.
 */
export const STAGE_CONFIG: Record<StageConfigKey, StageConfig> = {
  imported: {
    label: "Imported",
    color: "#6B7280",
    description: "Products imported into the system and waiting for scraping",
  },
  scraping: {
    label: "Scraping",
    color: "#3B82F6",
    description: "Products currently assigned to active scraper jobs",
  },
  scraped: {
    label: "Scraped",
    color: "#3B82F6",
    description: "Products with completed scrape results ready for consolidation",
  },
  consolidating: {
    label: "Consolidating",
    color: "#8B5CF6",
    description: "Products in active AI consolidation batches",
  },
  finalized: {
    label: "Finalized",
    color: "#F59E0B",
    description: "Products ready for downstream publishing workflows",
  },
  finalizing: {
    label: "Finalizing",
    color: "#F59E0B",
    description: "Products ready for final review and publishing actions",
  },
  published: {
    label: "Published",
    color: "#008850",
    description: "Products already published to the storefront",
  },
  failed: {
    label: "Failed",
    color: "#DC2626",
    description: "Products that failed processing and need manual retry",
  },
} as const;
