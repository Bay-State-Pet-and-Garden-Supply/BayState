/**
 * Product Source-Backed Fallback Extractor
 *
 * Deterministic utility to extract evidence-backed product information from
 * normalized and enriched source data. Used as a safety net when consolidated
 * fields are empty — walks nested enrichment shapes (extracted.core,
 * extracted.facets, approved_sources, source_results, per-source records)
 * and returns only source-traceable values.
 *
 * Protected operational fields (price, stock, tax, special_order, min_qty)
 * are NEVER extracted from marketplace or enrichment data.
 *
 * Confidence is scoped by source trust level:
 *   - Trusted (distributor/manufacturer/shopsite): ~0.92
 *   - Standard: ~0.85
 *   - Marketplace (amazon/ebay/walmart/etsy): ~0.82
 *   - Heuristic/pattern-inferred: ~0.75
 */

import {
  normalizeProductSources,
  extractImageCandidatesFromSources,
  type CanonicalProductSourceRecord,
} from '@/lib/product-sources';

// =============================================================================
// Types
// =============================================================================

export interface FallbackCore {
  name?: string;
  brand?: string;
  description?: string;
  weight_lbs?: string;
  search_keywords?: string;
}

export interface FallbackFacet {
  definition_slug: string;
  value: string;
  confidence_score: number;
  evidence_source: string;
}

export interface FallbackMedia {
  url: string;
  role: string;
  source: string;
  confidence_score: number;
}

export interface FallbackEvidence {
  source_urls: string[];
  selected_images: string[];
}

export interface SourceBackedFallbacks {
  core: FallbackCore;
  facets: FallbackFacet[];
  media: FallbackMedia[];
  evidence: FallbackEvidence;
  profileHints: string[];
}

// =============================================================================
// Constants
// =============================================================================

const MARKETPLACE_FRAGMENTS = ['amazon', 'ebay', 'etsy', 'walmart', 'marketplace', 'seller', 'ai_search', 'shop'];
const TRUSTED_FRAGMENTS = [
  'shopsite_input', 'bradley', 'central-pet', 'central_pet',
  'orgill', 'doitbest', 'do_it_best', 'manufacturer',
  'catalog', 'distributor', 'official_brand', 'official-brand',
];

const CONFIDENCE = {
  TRUSTED: 0.92,
  STANDARD: 0.85,
  MARKETPLACE: 0.82,
  HEURISTIC: 0.75,
} as const;

const PROTECTED_FIELDS = new Set([
  'price', 'stock_status', 'availability', 'is_special_order',
  'minimum_quantity', 'is_taxable', 'taxable',
]);

/** Keys within a source record that are safe to treat as free-text evidence */
/** Keys within extracted.core that are safe to extract */
const CORE_EXTRACT_KEYS = new Set([
  'name', 'brand_name', 'brand', 'description', 'weight_lbs', 'search_keywords',
]);

// =============================================================================
// Helpers
// =============================================================================

type TrustLevel = 'trusted' | 'standard' | 'marketplace';

function getSourceTrust(sourceName: string): TrustLevel {
  const n = sourceName.toLowerCase();
  // Canonical trust — shopsite_input is the single source of truth, never marketplace
  if (n === 'shopsite_input') return 'trusted';
  // Trusted sources checked BEFORE marketplace to avoid substring collisions
  // (e.g., 'shopsite' contains 'shop', 'distributor' is trusted not marketplace)
  if (TRUSTED_FRAGMENTS.some((f) => n.includes(f))) return 'trusted';
  if (MARKETPLACE_FRAGMENTS.some((f) => n.includes(f))) return 'marketplace';
  return 'standard';
}

function sourceConfidence(sourceName: string): number {
  const trust = getSourceTrust(sourceName);
  if (trust === 'trusted') return CONFIDENCE.TRUSTED;
  if (trust === 'marketplace') return CONFIDENCE.MARKETPLACE;
  return CONFIDENCE.STANDARD;
}

function evidencePath(sourceName: string, path: string): string {
  return `source:${sourceName}:${path}`;
}

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

function dedupeStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}

// =================================================================
// Pattern dictionaries (subset of detail-enrichment patterns)
// =============================================================================

const PET_TYPE_PATTERNS: Record<string, RegExp> = {
  Dog: /\b(dog|dogs?|puppy|puppies|canine)\b/i,
  Cat: /\b(cat|cats?|kitten|kittens|feline)\b/i,
  Bird: /\b(bird|birds?|parrot|parakeet|avian)\b/i,
  Fish: /\b(fish|fishes|aquarium|aquatic|pond|koi|goldfish)\b/i,
  Reptile: /\b(reptile|snake|lizard|turtle|tortoise|gecko)\b/i,
  Horse: /\b(horse|horses?|equine|pony|equestrian)\b/i,
  'Small Animal': /\b(rabbit|hamster|guinea pig|gerbil|ferret|chinchilla)\b/i,
  Livestock: /\b(chicken|poultry|goat|sheep|cattle|cow|pig|swine)\b/i,
};

const FOOD_FORM_PATTERNS: Record<string, RegExp> = {
  Dry: /\b(dry|kibble)\b/i,
  Wet: /\b(wet|canned|pate|paté|loaf|stew|gravy|broth)\b/i,
  Raw: /\b(raw|frozen raw)\b/i,
  'Freeze-Dried': /\b(freeze[- ]?dried|lyophilized)\b/i,
  Dehydrated: /\b(dehydrated|air[- ]?dried)\b/i,
  Topper: /\b(topper|mix[- ]?in|mixer)\b/i,
};

const DIMENSION_RE = /(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*inches/i;
const WEIGHT_OZ_RE = /(\d+\.?\d*)\s*ounces/i;
const WEIGHT_LB_RE = /(\d+\.?\d*)\s*(?:lb|pound)s?\b/i;

// =============================================================================
// Internal traversals
// =============================================================================

/**
 * Walk a single normalized source record for protected-free text/core values.
 */
function extractCoreFromSource(
  sourceName: string,
  sourceData: CanonicalProductSourceRecord | Record<string, unknown>,
): FallbackCore {
  const out: FallbackCore = {};

  // Direct fields
  for (const key of ['name', 'title', 'description', 'brand', 'brand_name', 'search_keywords', 'weight'] as const) {
    if (PROTECTED_FIELDS.has(key)) continue;
    const v = sourceData[key];
    if (hasText(v)) {
      const canon = key === 'title' ? 'name' : key === 'brand_name' ? 'brand' : key;
      if (canon === 'name' && !out.name) out.name = v;
      else if (canon === 'brand' && !out.brand) out.brand = v;
      else if (key === 'description' && !out.description) out.description = v;
      else if (key === 'search_keywords' && !out.search_keywords) out.search_keywords = v;
    }
  }

  // Weight from direct field
  const rawWeight = sourceData.weight;
  if (!out.weight_lbs && hasText(rawWeight)) {
    const w = normalizeWeight(rawWeight);
    if (w) out.weight_lbs = w;
  }

  return out;
}

function normalizeWeight(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase();
  // Already in lbs
  const lbMatch = trimmed.match(WEIGHT_LB_RE);
  if (lbMatch) return lbMatch[1];
  // Convert ounces to lbs
  const ozMatch = trimmed.match(WEIGHT_OZ_RE);
  if (ozMatch) {
    const oz = parseFloat(ozMatch[1]);
    if (Number.isFinite(oz)) return (oz / 16).toFixed(4);
  }
  // Plain number — assume lbs
  const num = parseFloat(trimmed);
  if (Number.isFinite(num)) return String(num);
  return undefined;
}

/**
 * Extract features (string[] or newline-separated string) as "features" facets.
 */
function extractFeaturesAsFacets(
  features: unknown,
  confidence: number,
  evidenceSrc: string,
): FallbackFacet[] {
  if (Array.isArray(features)) {
    return features.filter(hasText).map((val, i) => ({
      definition_slug: 'features',
      value: val,
      confidence_score: confidence,
      evidence_source: `${evidenceSrc}.features[${i}]`,
    }));
  }
  if (hasText(features)) {
    return features.split('\n').filter(hasText).map((val, i) => ({
      definition_slug: 'features',
      value: val,
      confidence_score: confidence,
      evidence_source: `${evidenceSrc}.features[${i}]`,
    }));
  }
  return [];
}

/**
 * Parse combined dimension/weight strings like "10.83 x 6.57 x 2.05 inches; 5 ounces"
 * into individual facets.
 */
function parseDimensionString(
  raw: string,
  confidence: number,
  evidenceSrc: string,
): FallbackFacet[] {
  const result: FallbackFacet[] = [];
  const trimmed = raw.trim();
  // Dimensions
  const dimMatch = trimmed.match(DIMENSION_RE);
  if (dimMatch) {
    result.push({
      definition_slug: 'dimensions',
      value: `${dimMatch[1]} x ${dimMatch[2]} x ${dimMatch[3]} inches`,
      confidence_score: confidence,
      evidence_source: evidenceSrc,
    });
  }
  // Weight (ounces)
  const ozMatch = trimmed.match(WEIGHT_OZ_RE);
  if (ozMatch) {
    const oz = parseFloat(ozMatch[1]);
    if (Number.isFinite(oz)) {
      result.push({
        definition_slug: 'package_weight',
        value: (oz / 16).toFixed(4),
        confidence_score: confidence,
        evidence_source: evidenceSrc,
      });
    }
  }
  // Weight (lbs)
  const lbMatch = trimmed.match(WEIGHT_LB_RE);
  if (lbMatch) {
    result.push({
      definition_slug: 'package_weight',
      value: lbMatch[1],
      confidence_score: confidence,
      evidence_source: evidenceSrc,
    });
  }
  return result;
}

// =============================================================================
// Media extraction
// =============================================================================

function extractMediaFromSource(
  sourceName: string,
  sourceData: Record<string, unknown>,
): FallbackMedia[] {
  const conf = sourceConfidence(sourceName);
  const images = extractImageCandidatesFromSourcePayload(sourceData);
  return images.map((url) => ({
    url,
    role: 'product_image',
    source: sourceName,
    confidence_score: conf,
  }));
}

function extractImageCandidatesFromSourcePayload(
  payload: Record<string, unknown>,
): string[] {
  // Collect from common image fields
  const candidates: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && (v.startsWith('http') || v.startsWith('//'))) {
      candidates.push(v);
    }
  };

  // Direct strings
  ['image', 'images', 'image_url', 'image_urls', 'selected_images'].forEach((k) => {
    const v = payload[k];
    if (Array.isArray(v)) v.forEach(push);
    else push(v);
  });

  // Media array (objects with url)
  if (Array.isArray(payload.media)) {
    for (const m of payload.media) {
      if (isRecord(m)) push(m.url);
    }
  }

  // Deduplicate
  return dedupeStrings(candidates).slice(0, 12);
}

// =============================================================================
// Nested enrichment traversal
// =============================================================================

/**
 * Walk the enriched source envelope to find evidence inside
 * extracted.core, extracted.facets, approved_sources, and source_results.
 */
function extractFromEnriched(
  enriched: Record<string, unknown>,
): { core: FallbackCore; facets: FallbackFacet[]; media: FallbackMedia[]; evidence: FallbackEvidence } {
  const core: FallbackCore = {};
  const facets: FallbackFacet[] = [];
  const media: FallbackMedia[] = [];
  const sourceUrls: string[] = [];
  const images: string[] = [];

  const enrichedConf = CONFIDENCE.MARKETPLACE; // enriched is marketplace unless we know better
  const enrichEvidence = (path: string) => evidencePath('enriched', path);

  // --- extracted.core ---
  const extractedCore = isRecord(enriched.extracted) && isRecord((enriched.extracted as Record<string, unknown>).core)
    ? (enriched.extracted as Record<string, unknown>).core as Record<string, unknown>
    : null;

  if (extractedCore) {
    for (const key of CORE_EXTRACT_KEYS) {
      if (PROTECTED_FIELDS.has(key)) continue;
      if (!core.name && key === 'name') core.name = safeStr(extractedCore.name);
      if (!core.brand && key === 'brand_name') core.brand = safeStr(extractedCore.brand_name);
      if (!core.description && key === 'description') core.description = safeStr(extractedCore.description);
      if (!core.weight_lbs && key === 'weight_lbs') core.weight_lbs = safeStr(extractedCore.weight_lbs);
      if (!core.search_keywords && key === 'search_keywords') core.search_keywords = safeStr(extractedCore.search_keywords);
    }
    // Also check direct brand
    if (!core.brand) {
      const b = safeStr(extractedCore.brand);
      if (b) core.brand = b;
    }
  }

  // --- extracted.facets ---
  const extractedFacets = isRecord(enriched.extracted) && Array.isArray((enriched.extracted as Record<string, unknown>).facets)
    ? (enriched.extracted as Record<string, unknown>).facets as unknown[]
    : null;

  if (extractedFacets) {
    for (const f of extractedFacets) {
      if (!isRecord(f)) continue;
      const slug = safeStr(f.definition_slug);
      const val = safeStr(f.value);
      if (slug && val && !PROTECTED_FIELDS.has(slug)) {
        // Parse combined dimension/weight strings
        if (slug === 'dimensions' && !facets.some((x) => x.definition_slug === 'dimensions')) {
          const parsed = parseDimensionString(val, enrichedConf, enrichEvidence('extracted.facets.dimensions'));
          facets.push(...parsed);
        } else {
          // Allow multiple 'features' entries; deduplicate other slugs
          const isMultiValued = slug === 'features';
          if (isMultiValued || !facets.some((x) => x.definition_slug === slug)) {
            facets.push({
              definition_slug: slug,
              value: val,
              confidence_score: enrichedConf,
              evidence_source: enrichEvidence('extracted.facets'),
            });
          }
        }
      }
    }
  }

  // --- extracted.media ---
  const extractedMedia = isRecord(enriched.extracted) && Array.isArray((enriched.extracted as Record<string, unknown>).media)
    ? (enriched.extracted as Record<string, unknown>).media as unknown[]
    : null;

  if (extractedMedia) {
    for (const m of extractedMedia) {
      if (isRecord(m) && typeof m.url === 'string' && m.url.length > 0) {
        media.push({
          url: m.url,
          role: safeStr(m.role) || 'product_image',
          source: 'enrichment',
          confidence_score: enrichedConf,
        });
      }
    }
  }

  // --- approved_sources ---
  const approvedSources = isRecord(enriched.approved_sources)
    ? enriched.approved_sources as Record<string, unknown>
    : {};

  for (const [srcName, srcSnapshot] of Object.entries(approvedSources)) {
    if (!isRecord(srcSnapshot)) continue;
    const srcConf = sourceConfidence(srcName);
    const srcEvidence = evidencePath(srcName, 'extracted');

    // extracted.core in approved source
    const snapshotCore = isRecord((srcSnapshot as Record<string, unknown>).extracted) &&
      isRecord(((srcSnapshot as Record<string, unknown>).extracted as Record<string, unknown>).core)
      ? ((srcSnapshot as Record<string, unknown>).extracted as Record<string, unknown>).core as Record<string, unknown>
      : null;

    if (snapshotCore) {
      if (!core.name) core.name = safeStr(snapshotCore.name);
      if (!core.brand) core.brand = safeStr(snapshotCore.brand_name) || safeStr(snapshotCore.brand);
      if (!core.description) core.description = safeStr(snapshotCore.description);
      if (!core.weight_lbs) core.weight_lbs = safeStr(snapshotCore.weight_lbs) || safeStr(snapshotCore.weight);
    }

    // extracted.facets in approved source
    const snapshotFacets = isRecord((srcSnapshot as Record<string, unknown>).extracted) &&
      Array.isArray(((srcSnapshot as Record<string, unknown>).extracted as Record<string, unknown>).facets)
      ? ((srcSnapshot as Record<string, unknown>).extracted as Record<string, unknown>).facets as unknown[]
      : null;

    if (snapshotFacets) {
      for (const f of snapshotFacets) {
        if (!isRecord(f)) continue;
        const slug = safeStr(f.definition_slug);
        const val = safeStr(f.value);
        if (slug && val && !PROTECTED_FIELDS.has(slug) && !facets.some((x) => x.definition_slug === slug)) {
          facets.push({
            definition_slug: slug,
            value: val,
            confidence_score: srcConf,
            evidence_source: `${srcEvidence}.facets`,
          });
        }
      }
    }

    // Media from approved source
    const snapshotImages = isRecord((srcSnapshot as Record<string, unknown>).extracted) &&
      Array.isArray(((srcSnapshot as Record<string, unknown>).extracted as Record<string, unknown>).media)
      ? ((srcSnapshot as Record<string, unknown>).extracted as Record<string, unknown>).media as unknown[]
      : null;
    if (snapshotImages) {
      for (const m of snapshotImages) {
        if (isRecord(m) && typeof m.url === 'string' && m.url.length > 0) {
          media.push({
            url: m.url,
            role: safeStr(m.role) || 'product_image',
            source: srcName,
            confidence_score: srcConf,
          });
        }
      }
    }
  }

  // --- source_results ---
  const sourceResults = Array.isArray(enriched.source_results)
    ? enriched.source_results as Record<string, unknown>[]
    : [];

  for (const sr of sourceResults) {
    const srSlug = safeStr(sr.sourceSlug) || 'unknown';
    const srConf = sourceConfidence(srSlug);
    const srEvidence = evidencePath(srSlug, 'product');

    // product.core
    const srProduct = isRecord(sr.product) ? sr.product as Record<string, unknown> : null;
    const srCore = srProduct && isRecord(srProduct.core) ? srProduct.core as Record<string, unknown> : null;
    if (srCore) {
      if (!core.name) core.name = safeStr(srCore.name);
      if (!core.brand) core.brand = safeStr(srCore.brand_name) || safeStr(srCore.brand);
      if (!core.description) core.description = safeStr(srCore.description);
      if (!core.weight_lbs) core.weight_lbs = safeStr(srCore.weight_lbs) || safeStr(srCore.weight);
    }

    // product.facets
    const srFacets = srProduct && Array.isArray(srProduct.facets) ? srProduct.facets as unknown[] : null;
    if (srFacets) {
      for (const f of srFacets) {
        if (!isRecord(f)) continue;
        const slug = safeStr(f.definition_slug);
        const val = safeStr(f.value);
        if (slug && val && !PROTECTED_FIELDS.has(slug) && !facets.some((x) => x.definition_slug === slug)) {
          facets.push({
            definition_slug: slug,
            value: val,
            confidence_score: srConf,
            evidence_source: `${srEvidence}.facets`,
          });
        }
      }
    }

    // Media from source_result
    const srMedia = srProduct && Array.isArray(srProduct.media) ? srProduct.media as unknown[] : null;
    if (srMedia) {
      for (const m of srMedia) {
        if (isRecord(m) && typeof m.url === 'string' && m.url.length > 0) {
          media.push({
            url: m.url,
            role: safeStr(m.role) || 'product_image',
            source: srSlug,
            confidence_score: srConf,
          });
        }
      }
    }

    // URL
    const url = safeStr(sr.evidenceUrl);
    if (url) sourceUrls.push(url);

    // Raw images from source_result fields
    if (srProduct) {
      for (const imgKey of ['image_urls', 'images'] as const) {
        const v = srProduct[imgKey];
        if (Array.isArray(v)) {
          for (const u of v) if (hasText(u)) images.push(u);
        }
      }
    }
  }

  return {
    core,
    facets,
    media,
    evidence: { source_urls: dedupeStrings(sourceUrls), selected_images: dedupeStrings(images) },
  };
}

// =============================================================================
// Per-source traversal
// =============================================================================

function extractFromPerSource(
  sourceName: string,
  sourceData: CanonicalProductSourceRecord | Record<string, unknown>,
): { core: FallbackCore; facets: FallbackFacet[]; media: FallbackMedia[] } {
  const core = extractCoreFromSource(sourceName, sourceData);
  const conf = sourceConfidence(sourceName);
  const evidenceSrc = evidencePath(sourceName, '');
  const facets: FallbackFacet[] = [];
  const media = extractMediaFromSource(sourceName, sourceData);

  // Features
  const features = (sourceData as Record<string, unknown>).features;
  facets.push(...extractFeaturesAsFacets(features, conf, evidenceSrc));

  // Dimensions string
  const dims = safeStr(sourceData.dimensions);
  if (dims) {
    facets.push(...parseDimensionString(dims, conf, `${evidenceSrc}.dimensions`));
  }

  // UPC / item_number (not protected — useful product info)
  const upc = safeStr(sourceData.upc) || safeStr(sourceData.item_number);
  if (upc && !facets.some((f) => f.definition_slug === 'upc')) {
    facets.push({ definition_slug: 'upc', value: upc, confidence_score: conf, evidence_source: evidenceSrc });
  }

  // Weight as facet if not already in core
  const rawWeight = safeStr(sourceData.weight);
  if (rawWeight && !core.weight_lbs) {
    const w = normalizeWeight(rawWeight);
    if (w) core.weight_lbs = w;
  }

  return { core, facets, media };
}

// =============================================================================
// Search keywords generation
// =============================================================================

function generateSearchKeywords(
  name?: string,
  brand?: string,
  facets?: FallbackFacet[],
): string | undefined {
  const tokens: string[] = [];
  const addTokens = (text?: string) => {
    if (!text) return;
    text.split(/[\s,;]+/).forEach((t) => {
      const clean = t.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
      if (clean.length > 1) tokens.push(clean);
    });
  };
  addTokens(name);
  addTokens(brand);
  if (facets) {
    for (const f of facets) {
      if (['animal_type', 'life_stage', 'breed_size', 'food_form', 'diet_type', 'flavor', 'primary_protein', 'claims'].includes(f.definition_slug)) {
        addTokens(f.value);
      }
    }
  }
  const result = dedupeStrings(tokens);
  return result.length > 0 ? result.join(', ') : undefined;
}

// =============================================================================
// Profile hints
// =============================================================================



function deduceProfileHints(
  facets: FallbackFacet[],
  core: FallbackCore,
  allText: string,
): string[] {
  const hints: string[] = [];

  // Build a map of current facets by slug
  const facetMap = new Map(facets.map((f) => [f.definition_slug, f.value]));
  const hasFoodForm = facetMap.has('food_form');
  const hasTreatType = facetMap.has('treat_type');
  const hasDietType = facetMap.has('diet_type');
  const animalType = facetMap.get('animal_type') || '';

  // Animal food: has food_form + animal_type
  if (hasFoodForm && animalType) {
    hints.push('animal_food', animalType.toLowerCase());
  }

  // Treats: has treat_type or is treat-related
  if (hasTreatType) {
    hints.push('animal_treats_chews');
    if (animalType) hints.push(animalType.toLowerCase());
  }

  // Heuristic from text
  const text = (core.name || '') + ' ' + (core.description || '') + ' ' + allText;

  // Food matching
  const foodFormVal = facetMap.get('food_form');
  if (!foodFormVal) {
    for (const [, re] of Object.entries(FOOD_FORM_PATTERNS)) {
      if (re.test(text) && !hasFoodForm) {
        hints.push('animal_food');
        break;
      }
    }
  }

  // Pet type from text
  if (!animalType) {
    for (const [val, re] of Object.entries(PET_TYPE_PATTERNS)) {
      if (re.test(text)) {
        hints.push(val.toLowerCase());
        break;
      }
    }
  }

  // Grain-free / high-protein are food signals
  if (hasDietType && /\b(grain-free|high-protein|limited ingredient)\b/i.test(facetMap.get('diet_type') || '')) {
    if (!hints.includes('animal_food')) hints.push('animal_food');
  }

  return dedupeStrings(hints);
}

// =============================================================================
// Main export
// =============================================================================

/**
 * Collect deterministic source-backed fallback values from raw product sources.
 *
 * Walks normalized sources, enriched payloads (extracted.core/facets,
 * approved_sources, source_results), and per-source records to find
 * evidence-backed product information. Returns only values that are
 * traceable to a specific source — never hallucinated.
 *
 * Protected fields (price, stock, tax, special_order, min_qty) are
 * NEVER included in the output regardless of source content.
 *
 * @param sources - Raw sources object from products_ingestion
 * @param input   - Optional raw input record (shopsite/legacy fields)
 * @returns       - Structured fallback values with confidence/evidence
 */
export function collectSourceBackedFallbacks(
  sources: Record<string, unknown>,
  input?: Record<string, unknown>,
): SourceBackedFallbacks {
  const allTextParts: string[] = [];
  const allFacets: FallbackFacet[] = [];
  const allMedia: FallbackMedia[] = [];
  const allSelectedImages: string[] = [];
  const allSourceUrls: string[] = [];
  const fallbackCore: FallbackCore = {};

  // Priority: shopsite/input first (canonical trust)
  if (input) {
    if (!fallbackCore.name) fallbackCore.name = safeStr(input.name);
    if (!fallbackCore.brand) fallbackCore.brand = safeStr(input.brand);
    if (!fallbackCore.description) fallbackCore.description = safeStr(input.description);
    if (!fallbackCore.weight_lbs) {
      const w = safeStr(input.weight);
      if (w) {
        const nw = normalizeWeight(w);
        if (nw) fallbackCore.weight_lbs = nw;
      }
    }
    if (fallbackCore.name) allTextParts.push(fallbackCore.name);
    if (fallbackCore.description) allTextParts.push(fallbackCore.description);
  }

  // Normalize and walk all sources
  const normalized = normalizeProductSources(sources);
  const sourceEntries = Object.entries(normalized);

  // --- Separate enriched from per-source data ---
  const enrichedEntry = sourceEntries.find(([name]) => name === 'enriched');
  const perSourceEntries = sourceEntries.filter(([name]) => name !== 'enriched' && name !== '_input');

  // --- Walk enriched first ---
  if (enrichedEntry) {
    const [, enrichedData] = enrichedEntry;
    const enrichedExtracted = extractFromEnriched(enrichedData as Record<string, unknown>);

    // Core from enriched
    if (enrichedExtracted.core.name && !fallbackCore.name) fallbackCore.name = enrichedExtracted.core.name;
    if (enrichedExtracted.core.brand && !fallbackCore.brand) fallbackCore.brand = enrichedExtracted.core.brand;
    if (enrichedExtracted.core.description && !fallbackCore.description) fallbackCore.description = enrichedExtracted.core.description;
    if (enrichedExtracted.core.weight_lbs && !fallbackCore.weight_lbs) fallbackCore.weight_lbs = enrichedExtracted.core.weight_lbs;
    if (enrichedExtracted.core.search_keywords && !fallbackCore.search_keywords) fallbackCore.search_keywords = enrichedExtracted.core.search_keywords;

    // Facets from enriched
    allFacets.push(...enrichedExtracted.facets);

    // Media from enriched
    allMedia.push(...enrichedExtracted.media);

    // Evidence
    allSourceUrls.push(...enrichedExtracted.evidence.source_urls);
    allSelectedImages.push(...enrichedExtracted.evidence.selected_images);

    // Text for heuristic
    if (enrichedExtracted.core.name) allTextParts.push(enrichedExtracted.core.name);
    if (enrichedExtracted.core.description) allTextParts.push(enrichedExtracted.core.description);
    for (const f of enrichedExtracted.facets) allTextParts.push(f.value);
  }

  // --- Walk per-source records ---
  for (const [srcName, srcData] of perSourceEntries) {
    if (srcName === 'enriched') continue;
    if (!isRecord(srcData)) continue;

    const extracted = extractFromPerSource(srcName, srcData as Record<string, unknown>);

    // Core — prioritize by trust
    const trust = getSourceTrust(srcName);
    const shouldOverride = (
      trust === 'trusted' ||
      (trust === 'standard' && !fallbackCore.name) ||
      (trust === 'marketplace' && !fallbackCore.name)
    );

    if (shouldOverride || !fallbackCore.name) {
      if (extracted.core.name && !fallbackCore.name) fallbackCore.name = extracted.core.name;
    }
    if ((shouldOverride || !fallbackCore.brand) && extracted.core.brand && !fallbackCore.brand) {
      fallbackCore.brand = extracted.core.brand;
    }
    if ((shouldOverride || !fallbackCore.description) && extracted.core.description && !fallbackCore.description) {
      fallbackCore.description = extracted.core.description;
    }
    if ((shouldOverride || !fallbackCore.weight_lbs) && extracted.core.weight_lbs && !fallbackCore.weight_lbs) {
      fallbackCore.weight_lbs = extracted.core.weight_lbs;
    }

    // Text for heuristic
    if (extracted.core.name) allTextParts.push(extracted.core.name);
    if (extracted.core.description) allTextParts.push(extracted.core.description);

    // Facets
    allFacets.push(...extracted.facets);

    // Media
    allMedia.push(...extracted.media);
  }

  // --- Deduplicate facets (first source wins within same slug, but allow multiple features) ---
  const seenSlugs = new Set<string>();
  const dedupedFacets: FallbackFacet[] = [];
  for (const f of allFacets) {
    if (f.definition_slug === 'features') {
      // Features are bullet points — keep all of them
      dedupedFacets.push(f);
    } else if (!seenSlugs.has(f.definition_slug)) {
      seenSlugs.add(f.definition_slug);
      dedupedFacets.push(f);
    }
  }

  // --- Also deduplicate per-source features (same check) ---
  const seenFeatureValues = new Set<string>();
  for (let i = 0; i < dedupedFacets.length; i++) {
    if (dedupedFacets[i].definition_slug === 'features') {
      if (seenFeatureValues.has(dedupedFacets[i].value)) {
        dedupedFacets.splice(i, 1);
        i--;
      } else {
        seenFeatureValues.add(dedupedFacets[i].value);
      }
    }
  }

  // --- Deduplicate media ---
  const seenUrls = new Set<string>();
  const dedupedMedia: FallbackMedia[] = [];
  for (const m of allMedia) {
    if (!seenUrls.has(m.url)) {
      seenUrls.add(m.url);
      dedupedMedia.push(m);
    }
  }

  const dedupedSelectedImages = dedupeStrings(allSelectedImages);

  // --- Fallback to image candidates if no media/images from traverse ---
  let finalSelectedImages = dedupedSelectedImages;
  if (finalSelectedImages.length === 0) {
    // Use global image extraction
    const candidates = extractImageCandidatesFromSources(sources, 12);
    finalSelectedImages = [...candidates];
  }

  // If still no images and media is empty, create media from selected_images
  if (dedupedMedia.length === 0 && finalSelectedImages.length > 0) {
    for (const url of finalSelectedImages.slice(0, 12)) {
      dedupedMedia.push({
        url,
        role: 'product_image',
        source: 'source_fallback',
        confidence_score: CONFIDENCE.STANDARD,
      });
    }
  }

  // --- Generate search keywords ---
  if (!fallbackCore.search_keywords) {
    fallbackCore.search_keywords = generateSearchKeywords(
      fallbackCore.name,
      fallbackCore.brand,
      dedupedFacets,
    );
  }

  // --- Profile hints ---
  const allText = allTextParts.filter(Boolean).join(' ');
  const profileHints = deduceProfileHints(dedupedFacets, fallbackCore, allText);

  // --- Evidence URLs ---
  const dedupedSourceUrls = dedupeStrings(allSourceUrls);

  return {
    core: {
      name: fallbackCore.name,
      brand: fallbackCore.brand,
      description: fallbackCore.description,
      weight_lbs: fallbackCore.weight_lbs,
      search_keywords: fallbackCore.search_keywords,
    },
    facets: dedupedFacets,
    media: dedupedMedia,
    evidence: {
      source_urls: dedupedSourceUrls,
      selected_images: finalSelectedImages,
    },
    profileHints,
  };
}
