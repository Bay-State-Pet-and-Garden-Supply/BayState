/**
 * Prompt Evidence Helpers
 *
 * Shared source filtering, trust ranking, and evidence construction
 * used by both DeepSeek (text-only) and Gemini (multimodal) prompt builders.
 *
 * Extracted from batch-service.ts to avoid duplication while preserving
 * existing DeepSeek behavior byte-for-byte.
 */

import { normalizeProductSources } from '@/lib/product-sources';

// =============================================================================
// Constants
// =============================================================================

const RELEVANT_FIELDS = [
  'title',
  'brand',
  'weight',
  'size',
  'package_weight',
  'package-weight',
  'count',
  'pack',
  'attributes',
  'description',
  'category',
  'categories',
  'flavor',
  'color',
  'unit',
  'quantity',
  'ingredients',
  'material',
  'dimensions',
  'specifications',
  'pet_type',
  'lifestage',
  'features',
  'upc',
  'item_number',
  'manufacturer_part_number',
  'case_pack',
  'unit_of_measure',
  'size_options',
  'confidence',
  'image_text',
];

const MAX_PROMPT_SOURCES = 4;
const MAX_PROMPT_FALLBACK_FIELDS = 4;
const MAX_PROMPT_ARRAY_ITEMS = 8;
const MAX_PROMPT_NESTED_KEYS = 8;

const EXCLUDED_FROM_LLM = new Set([
  'ratings',
  'reviews_count',
  'availability',
  'scraped_at',
  'search_keywords',
  'is_taxable',
  'taxable',
  'is_special_order',
  'special_order',
  'specialorder',
  'selected_images',
  'manual_selection',
]);

const MARKETPLACE_SOURCE_FRAGMENTS = ['amazon', 'ebay', 'etsy', 'walmart', 'marketplace', 'seller', 'ai_search', 'shop'];
const TRUSTED_SOURCE_FRAGMENTS = [
  'shopsite_input',
  'bradley',
  'central-pet',
  'central_pet',
  'orgill',
  'doitbest',
  'do_it_best',
  'manufacturer',
  'catalog',
  'distributor',
  'official_brand',
  'official-brand',
];

// =============================================================================
// Types
// =============================================================================

type SourceTrustLevel = 'canonical' | 'trusted' | 'standard' | 'marketplace';

export interface PromptSourceEvidence {
  source: string;
  trust: SourceTrustLevel;
  fields: Record<string, unknown>;
}

// =============================================================================
// Field Filtering (preserved from batch-service.ts)
// =============================================================================

function hasRelevantKeyName(key: string): boolean {
  const normalized = key.toLowerCase();
  const relevantFragments = [
    'name', 'brand', 'weight', 'size', 'attribute', 'description', 'category',
    'flavor', 'colour', 'color', 'unit', 'quantity', 'material', 'ingredient',
    'dimension', 'spec', 'title', 'confidence', 'categories', 'pet', 'age',
    'life', 'stage', 'animal', 'breed', 'feature', 'page', 'upc', 'item_number',
    'manufacturer_part', 'case_pack', 'uom', 'count', 'pack',
  ];
  return relevantFragments.some((fragment) => normalized.includes(fragment));
}

function isExcludedKeyName(key: string): boolean {
  const normalized = key.toLowerCase();
  if (normalized === 'image_text') return false;
  return (
    normalized.includes('image') ||
    normalized.includes('url') ||
    normalized.includes('search_keyword') ||
    normalized.includes('searchkeyword') ||
    normalized.includes('taxable') ||
    normalized.includes('special_order') ||
    normalized.includes('specialorder') ||
    normalized.includes('special order') ||
    normalized.includes('manual') ||
    normalized === 'scraped_at' ||
    normalized === '_scraped_at' ||
    normalized.startsWith('_')
  );
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function getPromptTextLimit(fieldName: string): number {
  switch (fieldName.toLowerCase()) {
    case 'title':
    case 'name':
      return 180;
    case 'brand':
      return 80;
    case 'description':
      return 2000;
    case 'specifications':
      return 2000;
    case 'dimensions':
      return 140;
    default:
      return 120;
  }
}

function truncatePromptText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const truncated = trimmed.slice(0, maxLength).replace(/\s+\S*$/, '').trimEnd();
  return `${truncated || trimmed.slice(0, maxLength).trimEnd()}…`;
}

function sanitizePrimitivePromptValue(fieldName: string, value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.startsWith('http')) {
      return undefined;
    }
    return truncatePromptText(trimmed, getPromptTextLimit(fieldName));
  }
  return isEmptyValue(value) ? undefined : value;
}

function sanitizeNestedComposite(
  value: unknown,
  fieldName: string = '',
  depth: number = 0
): unknown {
  if (depth > 3) return undefined;

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((entry) => sanitizeNestedComposite(entry, fieldName, depth + 1))
      .filter((entry) => !isEmptyValue(entry))
      .slice(0, MAX_PROMPT_ARRAY_ITEMS);
    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (!value || typeof value !== 'object') {
    return sanitizePrimitivePromptValue(fieldName, value);
  }

  const sanitizedObject: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) => {
    if (Object.keys(sanitizedObject).length >= MAX_PROMPT_NESTED_KEYS) return true;
    if (isExcludedKeyName(key) || EXCLUDED_FROM_LLM.has(key)) return false;
    const sanitizedValue = sanitizeNestedComposite(nestedValue, key, depth + 1);
    if (!isEmptyValue(sanitizedValue)) {
      sanitizedObject[key] = sanitizedValue;
    }
    return false;
  });

  return Object.keys(sanitizedObject).length > 0 ? sanitizedObject : undefined;
}

/**
 * Filter source data to include only relevant fields for prompt construction.
 * Preserved from batch-service.ts createBatchContent → filterSourceData.
 */
function filterSourceData(sourceData: Record<string, unknown>): Record<string, unknown> {
  const filteredData: Record<string, unknown> = {};

  RELEVANT_FIELDS.forEach((field) => {
    if (EXCLUDED_FROM_LLM.has(field)) return;
    if (!(field in sourceData) || isEmptyValue(sourceData[field])) return;

    const value = sourceData[field];
    const sanitizedValue =
      value && typeof value === 'object'
        ? sanitizeNestedComposite(value, field)
        : sanitizePrimitivePromptValue(field, value);
    if (!isEmptyValue(sanitizedValue)) {
      filteredData[field] = sanitizedValue;
    }
  });

  let fallbackFieldsAdded = 0;
  Object.entries(sourceData).forEach(([key, value]) => {
    if (
      fallbackFieldsAdded >= MAX_PROMPT_FALLBACK_FIELDS ||
      key in filteredData ||
      isExcludedKeyName(key) ||
      EXCLUDED_FROM_LLM.has(key) ||
      !hasRelevantKeyName(key)
    ) {
      return;
    }

    if (isEmptyValue(value)) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const sanitizedValue = sanitizePrimitivePromptValue(key, value);
      if (!isEmptyValue(sanitizedValue)) {
        filteredData[key] = sanitizedValue;
        fallbackFieldsAdded += 1;
      }
      return;
    }

    if (Array.isArray(value)) {
      const sanitizedValue = sanitizeNestedComposite(value, key);
      if (Array.isArray(sanitizedValue) && sanitizedValue.length > 0) {
        filteredData[key] = sanitizedValue;
        fallbackFieldsAdded += 1;
      }
    }
  });

  return filteredData;
}

// =============================================================================
// Source Trust Ranking (preserved from batch-service.ts)
// =============================================================================

function getSourceTrustLevel(sourceName: string): SourceTrustLevel {
  const normalized = sourceName.toLowerCase();

  if (normalized === 'shopsite_input') return 'canonical';
  if (MARKETPLACE_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) return 'marketplace';
  if (TRUSTED_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) return 'trusted';
  return 'standard';
}

function getPromptEvidenceSortRank(sourceName: string, trust: SourceTrustLevel): number {
  if (trust === 'canonical') return 0;
  if (sourceName.toLowerCase().includes('manufacturer')) return 1;
  switch (trust) {
    case 'trusted': return 2;
    case 'standard': return 3;
    case 'marketplace': return 4;
    default: return 5;
  }
}

/**
 * Build sorted, capped source evidence for prompt construction.
 * Preserved from batch-service.ts buildPromptSourceEvidence.
 */
export function buildPromptSourceEvidence(filteredSources: Record<string, unknown>): PromptSourceEvidence[] {
  const sourceEvidence = Object.entries(filteredSources)
    .filter(([, data]) => data && typeof data === 'object' && !Array.isArray(data))
    .map(([source, data]) => ({
      source,
      trust: getSourceTrustLevel(source),
      fields: data as Record<string, unknown>,
    }))
    .sort((left, right) => {
      const trustComparison =
        getPromptEvidenceSortRank(left.source, left.trust) -
        getPromptEvidenceSortRank(right.source, right.trust);
      if (trustComparison !== 0) return trustComparison;

      const fieldComparison = Object.keys(right.fields).length - Object.keys(left.fields).length;
      if (fieldComparison !== 0) return fieldComparison;

      return left.source.localeCompare(right.source);
    });

  return sourceEvidence.slice(0, MAX_PROMPT_SOURCES);
}

/**
 * Normalize product sources and filter each source's data.
 * Returns the filtered sources keyed by source name.
 */
export function filterAllSources(sources: Record<string, unknown>): Record<string, unknown> {
  const filteredSources: Record<string, unknown> = {};
  const normalizedSources = normalizeProductSources(sources);

  Object.entries(normalizedSources).forEach(([scraper, data]: [string, unknown]) => {
    if (data && typeof data === 'object') {
      const sourceData = data as Record<string, unknown>;
      const filteredData = filterSourceData(sourceData);
      if (Object.keys(filteredData).length > 0) {
        filteredSources[scraper] = filteredData;
      }
    }
  });

  return filteredSources;
}


