/**
 * Pipeline Types
 * Type definitions for the five-stage product ingestion pipeline
 */

/** Pipeline stage status values */
export const PIPELINE_STATUS_VALUES = [
  "imported",
  "monitoring",
  "scraped",
  "consolidated",
  "finalized",
  "published",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUS_VALUES)[number];

/**
 * Extended pipeline stages used in the UI pipeline tab flow.
 * Includes a transient consolidating monitoring stage.
 */
export type PipelineStage = PipelineStatus | "consolidating";

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
  pipeline_status: PipelineStatus;
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

/**
 * Stage display configurations
 * Maps each pipeline status to its UI representation
 */
export const STAGE_CONFIG: Record<PipelineStatus, StageConfig> = {
  imported: {
    label: "Imported",
    color: "#6B7280",
    description: "Product data has been imported into the system",
  },
  monitoring: {
    label: "Scraping",
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
  consolidated: {
    label: "Consolidated",
    color: "#8B5CF6",
    description: "Data from multiple sources has been merged by AI",
  },
  finalized: {
    label: "Finalized",
    color: "#F59E0B",
    description: "Product data has been reviewed and finalized",
  },
  published: {
    label: "Published",
    color: "#008850",
    description: "Product is live on the storefront",
  },
} as const;
