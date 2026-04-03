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

export function isPipelineStatus(value: string): value is PipelineStage {
  return ALL_PIPELINE_STATUS_SET.has(value);
}

export type PipelineStage = PipelineStatus | "consolidating" | "images" | "export";

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
} as const;
