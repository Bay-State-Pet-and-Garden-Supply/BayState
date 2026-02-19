/**
 * Enrichment Module
 * 
 * Centralized product data enrichment management.
 * Handles source selection, conflict resolution, and per-product configuration.
 * 
 * CRITICAL CONSTRAINT:
 * Price and SKU are NEVER modified by enrichment.
 * They always come from the original import (products_ingestion.input).
 */

// Types
export {
  PROTECTED_FIELDS,
  ENRICHABLE_FIELDS,
  isProtectedField,
  isEnrichableField,
  validateEnrichmentConfig,
  type ProtectedField,
  type EnrichableField,
  type SourceType,
  type EnrichmentSource,
  type EnrichmentConfig,
  type SourceEnrichmentData,
  type ProductEnrichmentSummary,
  type UpdateEnrichmentConfigRequest,
  type TargetedScrapeRequest,
} from './types';

// Sources
export {
  getScraperSources,
  getAllSources,
  getSourceById,
} from './sources';

// Config operations
export {
  getEnrichmentConfig,
  updateEnrichmentConfig,
  toggleSourcesForProduct,
  setFieldSourceOverride,
  clearFieldSourceOverride,
  getProductEnrichmentSummary,
  getProductEnrichmentSummaries,
} from './config';

// Client-side hooks
export { useEnrichmentRealtime } from './useEnrichmentRealtime';
