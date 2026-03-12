/**
 * Enrichment Types
 * 
 * Core type definitions for the product enrichment system.
 * 
 * CRITICAL: Price and SKU are PROTECTED fields that NEVER come from enrichment.
 * They are always sourced from the original import (products_ingestion.input).
 */

/**
 * Fields that are NEVER modified by enrichment - they come from the original import only.
 * This is a business-critical constraint to ensure pricing integrity.
 */
export const PROTECTED_FIELDS = ['price', 'sku', 'cost', 'msrp'] as const;
export type ProtectedField = (typeof PROTECTED_FIELDS)[number];

/**
 * Fields that CAN be enriched from external sources.
 */
export const ENRICHABLE_FIELDS = [
  'name',
  'description',
  'brand',
  'images',
  'weight',
  'dimensions',
  'ingredients',
  'specifications',
  'category',
  'product_type',
  'upc',
  'stock_status',
] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

/**
 * Source types for enrichment data.
 */
export type SourceType = 'scraper' | 'ai_search';

/**
 * Represents an enrichment source (web scraper).
 */
export interface EnrichmentSource {
  /** Unique identifier (e.g., 'amazon', 'phillips') */
  id: string;
  /** Human-readable name */
  displayName: string;
  /** Type of source */
  type: SourceType;
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Current status */
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  /** Whether this source is globally enabled */
  enabled: boolean;
  /** Fields this source typically provides */
  providesFields: EnrichableField[];
  /** Last successful fetch timestamp */
  lastFetchAt?: string;
}

/**
 * Per-product enrichment configuration stored in products_ingestion.enrichment_config
 */
export interface EnrichmentConfig {
  /**
   * Array of source IDs enabled for this product.
   * If empty or undefined, all sources are enabled (default behavior).
   */
  enabled_sources?: string[];

  /**
   * Field-level source overrides.
   * When multiple sources provide the same field, this specifies which source "wins".
   * Key: field name (from ENRICHABLE_FIELDS)
   * Value: source ID that should be used for this field
   * 
   * IMPORTANT: PROTECTED_FIELDS (price, sku, cost, msrp) cannot be in this map.
   */
  field_overrides?: Partial<Record<EnrichableField, string>>;

  /**
   * Timestamp of last manual edit to enrichment config.
   */
  last_manual_edit?: string;

  /**
   * Optional notes from admin about enrichment decisions.
   */
  notes?: string;
}

/**
 * Enrichment data from a single source for a product.
 */
export interface SourceEnrichmentData {
  sourceId: string;
  sourceType: SourceType;
  fetchedAt: string;
  data: Partial<Record<EnrichableField, unknown>>;
  /** Raw data from the source (for debugging/display) */
  raw?: Record<string, unknown>;
}

/**
 * Aggregated enrichment data for a product from all sources.
 */
export interface ProductEnrichmentSummary {
  sku: string;
  /** Data from web scrapers (keyed by scraper name) */
  scraperSources: Record<string, SourceEnrichmentData>;
  /** Current enrichment config */
  config: EnrichmentConfig;
  /** Fields with conflicts (multiple sources providing different values) */
  conflicts: EnrichableField[];
  /** The "Golden Record" - resolved enrichment data */
  resolved: Partial<Record<EnrichableField, { value: unknown; source: string }>>;
}

/**
 * Request to update enrichment config for a product.
 */
export interface UpdateEnrichmentConfigRequest {
  sku: string;
  config: Partial<EnrichmentConfig>;
}

/**
 * Request to trigger a targeted scrape for specific sources.
 */
export interface TargetedScrapeRequest {
  sku: string;
  sources: string[];
}

/**
 * Checks if a field is protected from enrichment.
 */
export function isProtectedField(field: string): field is ProtectedField {
  return PROTECTED_FIELDS.includes(field as ProtectedField);
}

/**
 * Checks if a field can be enriched.
 */
export function isEnrichableField(field: string): field is EnrichableField {
  return ENRICHABLE_FIELDS.includes(field as EnrichableField);
}

/**
 * Validates an enrichment config, ensuring no protected fields are in overrides.
 */
export function validateEnrichmentConfig(config: EnrichmentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.field_overrides) {
    for (const field of Object.keys(config.field_overrides)) {
      if (isProtectedField(field)) {
        errors.push(`Cannot override protected field: ${field}. Price and SKU always come from original import.`);
      }
      if (!isEnrichableField(field)) {
        errors.push(`Unknown enrichable field: ${field}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
