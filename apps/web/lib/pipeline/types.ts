/**
 * Pipeline types
 * 8-stage pipeline: imported → extracting → processed → grouping → merging → reviewing → publishing → failed
 * awaiting_brand is a persisted sub-status of imported for products without a brand —
 * those products appear in the imported tab, not as a separate tab.
 */

import type { Brand } from "@/lib/types";

/** Canonical workflow states persisted in products_ingestion.pipeline_status. */
export const PERSISTED_PIPELINE_STATUSES = [
  "imported",
  "awaiting_brand",
  "extracting",
  "processed",
  "grouping",
  "merging",
  "reviewing",
  "publishing",
  "failed",
  "needs_attention",
] as const;

export type PersistedPipelineStatus =
  (typeof PERSISTED_PIPELINE_STATUSES)[number];

/**
 * Main admin workflow tabs shown in the live pipeline UI.
 * awaiting_brand is not a tab — those products live in the imported tab.
 */
export const PIPELINE_TABS = [
  "imported",
  "extracting",
  "processed",
  "grouping",
  "merging",
  "reviewing",
  "publishing",
  "failed",
  "needs_attention",
] as const;

export type PipelineStage = (typeof PIPELINE_TABS)[number];

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

  return isPipelineStage(value) ? value : null;
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
  /** Unique product identifier (Universal Product Code) */
  upc: string;
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
  /** @deprecated Per-product source selection is obsolete. Use per-brand Source Cascade. */
  enrichment_config?: {
    enabled_sources?: string[];
    official_domains?: string[];
  } | null;
  /** AI-consolidated product data from all sources */
  consolidated: {
    core?: {
      name?: string | null;
      brand_name?: string | null;
      brand_id?: string | null;
      description?: string | null;
      price?: number | null;
      weight_lbs?: number | null;
      category_id?: string | null;
      canonical_category_breadcrumb?: string | null;
      search_keywords?: string | null;
      confidence_score?: number | null;
      stock_status?: string | null;
      availability?: string | null;
      minimum_quantity?: number | null;
      is_special_order?: boolean | null;
      is_taxable?: boolean | null;
    } | null;
    facets?: Array<{
      definition_slug: string;
      value: string;
      confidence_score?: number | null;
      evidence_source?: string | null;
    }> | null;
    media?: Array<{
      url: string;
      role?: string | null;
      source?: string | null;
      confidence_score?: number | null;
    }> | null;
    evidence?: {
      source_urls?: string[];
      selected_images?: string[];
      image_text?: string | null;
      extraction_notes?: string | null;
    } | null;

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
  /** Durable brand ID foreign key for extraction eligibility */
  brand_id?: string | null;
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
  /** FK to product_lines.id for canonical product line assignment */
  product_line_id?: string | null;
  /** Classification confidence (0.0-1.0). Below 0.80 = ungrouped singleton */
  product_line_confidence?: number | null;
  /** How this assignment was made: ai, manual, or migration */
  product_line_assignment_source?: 'ai' | 'manual' | 'migration' | null;
  /** Raw LLM output label before dedup normalization */
  product_line_raw_label?: string | null;
  /** LLM rationale for classification */
  product_line_rationale?: string | null;
  /** Flag for operator review (ambiguous dedup, manual override, etc.) */
  product_line_review_required?: boolean | null;
  /** ID of the cohort batch this product belongs to (legacy) */
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
  awaiting_brand: {
    label: "Awaiting Brand",
    color: "#9CA3AF",
    description: "Imported products without a brand. Assign a brand before moving them into Extracting.",
  },
  imported: {
    label: "Imported",
    color: "#6B7280",
    description: "New products waiting for brand assignment, source setup, or extraction.",
  },
  extracting: {
    label: "Extracting",
    color: "#2563EB",
    description: "Live extraction jobs are running or queued for these products.",
  },
  processed: {
    label: "Processed",
    color: "#3B82F6",
    description: "Extraction is complete. Review source data here before sending products to Merging.",
  },
  grouping: {
    label: "Grouping",
    color: "#7C3AED",
    description: "AI is classifying products into manufacturer product lines. Review and adjust groups before consolidation.",
  },
  merging: {
    label: "Merging",
    color: "#8B5CF6",
    description: "AI merge jobs are combining source data into draft product records.",
  },
  reviewing: {
    label: "Reviewing",
    color: "#F59E0B",
    description: "Merged drafts are waiting for operator review before Publishing.",
  },
  publishing: {
    label: "Publishing",
    color: "#008850",
    description: "Approved products are ready to publish to ShopSite and export files.",
  },
  needs_attention: {
    label: "Needs Attention",
    color: "#F97316",
    description: "Some sources errored during extraction. Review and retry failed sources before continuing.",
  },
  failed: {
    label: "Failed",
    color: "#DC2626",
    description: "Products or jobs here need manual recovery before they can continue.",
  },
} as const;
