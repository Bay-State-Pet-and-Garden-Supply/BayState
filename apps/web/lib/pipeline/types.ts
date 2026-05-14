/**
 * Pipeline types
 * The durable workflow states are the same states shown in the admin UI.
 * Simplified 8-stage pipeline: imported → url_review → extracting → processed → merging → reviewing → publishing → failed
 */

import type { Brand } from "@/lib/types";

/** Canonical workflow states persisted in products_ingestion.pipeline_status. */
export const PERSISTED_PIPELINE_STATUSES = [
  "imported",
  "url_review",
  "extracting",
  "processed",
  "merging",
  "reviewing",
  "publishing",
  "failed",
] as const;

export type PersistedPipelineStatus =
  (typeof PERSISTED_PIPELINE_STATUSES)[number];

/** Main admin workflow tabs shown in the live pipeline UI. */
export const PIPELINE_TABS = [
  "imported",
  "url_review",
  "extracting",
  "processed",
  "merging",
  "reviewing",
  "publishing",
  "failed",
] as const;

export type PipelineStage = (typeof PIPELINE_TABS)[number];
type PipelineTab = PipelineStage;

/** No pipeline tabs are derived; the workflow vocabulary is canonical everywhere. */
const DERIVED_PIPELINE_TABS = [] as const;

type DerivedPipelineTab = (typeof DERIVED_PIPELINE_TABS)[number];

/** Status-like labels that appear in badges, counts, or actions. */
export type PipelineStatus = PersistedPipelineStatus;

/** Displayable status or stage labels used by shared UI primitives. */
export type PipelineDisplayStatus = PersistedPipelineStatus;

const PERSISTED_PIPELINE_STATUS_SET = new Set<string>(
  PERSISTED_PIPELINE_STATUSES,
);

const DERIVED_PIPELINE_TAB_SET = new Set<string>(DERIVED_PIPELINE_TABS);
const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_TABS);
const LEGACY_PIPELINE_STAGE_ALIASES = {
  finalized: "reviewing",
  finalizing: "reviewing",
  export: "publishing",
  published: "publishing",
  scraped: "processed",
  consolidating: "merging",
  exporting: "publishing",
  searching: "url_review",
  scraping: "extracting",
  needs_fallback_review: "url_review",
} as const;

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

export function normalizePipelineStage(
  value: string | null | undefined,
): PipelineStage | null {
  if (!value) {
    return null;
  }

  if (isPipelineStage(value)) {
    return value;
  }

  return (
    LEGACY_PIPELINE_STAGE_ALIASES[
      value as keyof typeof LEGACY_PIPELINE_STAGE_ALIASES
    ] ?? null
  );
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
 * Represents the full lifecycle of a product from import to export
 */
export interface PipelineProduct {
  id?: string;
  /** Unique product identifier (matches SKU) */
  sku: string;
  /** Raw imported data */
  input: {
    name?: string;
    description?: string;
    price?: number;
    weight?: string | number;
    stock_status?: string;
    gtin?: string;
    availability?: string;
    minimum_quantity?: number | string;
    is_special_order?: boolean;
    in_store_pickup?: boolean;
    pickup_only?: boolean;
    is_taxable?: boolean;
    search_keywords?: string;
    brand?: string;
    legacy_filename?: string;
    pet_type?: string;
    life_stage?: string;
    lifestage?: string;
    pet_size?: string;
    special_diet?: string;
    health_feature?: string;
    food_form?: string;
    flavor?: string;
    product_feature?: string;
    size?: string;
    color?: string;
    packaging_type?: string;
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
    brand?: string;
    category?: string;
    is_featured?: boolean;
    weight?: string | number | null;
    stock_status?: string;
    is_special_order?: boolean;
    is_taxable?: boolean;
    in_store_pickup?: boolean;
    pickup_only?: boolean;
    search_keywords?: string;
    gtin?: string;
    availability?: string;
    minimum_quantity?: number | string;
    legacy_filename?: string;
    pet_type?: string;
    life_stage?: string;
    lifestage?: string;
    pet_size?: string;
    special_diet?: string;
    health_feature?: string;
    food_form?: string;
    flavor?: string;
    product_feature?: string;
    size?: string;
    color?: string;
    packaging_type?: string;
  } | null;
  pipeline_status: PersistedPipelineStatus;
  exported_at?: string | null;
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
  /** Interpolated name from the associated cohort batch */
  cohort_name?: string | null;
  /** Brand name from the associated cohort batch */
  cohort_brand_name?: string | null;
  /** Brand ID from the associated cohort batch */
  cohort_brand_id?: string | null;
  /** Brand record from the associated cohort batch */
  cohort_brands?: Brand | null;
  /** Record creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Aggregate count of products per workflow tab or persisted status.
 */
export interface StatusCount {
  /** Pipeline stage or status value */
  status: PipelineDisplayStatus;
  /** Number of products in this status */
  count: number;
}

/**
 * Configuration for displaying a pipeline stage
 */
interface StageConfig {
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
    description: "Products imported into the system and awaiting URL assignment",
  },
  url_review: {
    label: "URL Review",
    color: "#A855F7",
    description: "Review and confirm extraction target URLs before enrichment",
  },
  extracting: {
    label: "Extracting",
    color: "#2563EB",
    description: "Products currently being enriched via AI extraction",
  },
  processed: {
    label: "Processed",
    color: "#3B82F6",
    description: "Products with completed enrichment results ready for consolidation",
  },
  merging: {
    label: "Merging",
    color: "#8B5CF6",
    description: "Products in active AI consolidation batches",
  },
  reviewing: {
    label: "Reviewing",
    color: "#F59E0B",
    description: "Products awaiting final review before storefront publication",
  },
  publishing: {
    label: "Publishing",
    color: "#008850",
    description: "Products published to the storefront and queued for downstream exports",
  },
  failed: {
    label: "Failed",
    color: "#DC2626",
    description: "Products that failed processing and need manual retry",
  },
} as const;
