/**
 * Apply Service for Product Consolidation
 */

import { createAdminClient } from '@/lib/supabase/server';
import { getConsolidationConfig } from './openai-client';
import {
    validateRequiredConsolidationFields,
    validateConsolidationTaxonomy,
} from './taxonomy-validator';
import { parseTaxonomyValues } from '@/lib/taxonomy';
import {
    cleanBrandLabel,
    createBrandResolver,
    normalizeLookupKey,
} from './brand-resolver';
import { collectSourceBackedFallbacks } from '@/lib/product-source-fallbacks';
import { assembleProductFacets } from './facet-assembler';
import {
    extractSelectedImageUrls,
    resolveProductMedia,
    toStringUrlArray,
} from './media-resolver';
import { tryDisambiguateDuplicateNames } from './duplicate-detector';
import { retrieveResults, findBatchJobRow, type BatchRowLookup } from './batch-service';
import type {
    ApplyResultsResponse,
    BatchErrorResponse,
    ConsolidationResult,
} from './types';

// =============================================================================
// Helper Constants & Types
// =============================================================================

type AnimalSignal = 'dog' | 'cat' | 'horse' | 'bird' | 'small-pet';

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

const ANIMAL_SIGNAL_RULES: Array<{ label: AnimalSignal; patterns: RegExp[] }> = [
    { label: 'dog', patterns: [/\bdog\b/i, /\bpuppy\b/i, /\bcanine\b/i] },
    { label: 'cat', patterns: [/\bcat\b/i, /\bkitten\b/i, /\bfeline\b/i] },
    { label: 'horse', patterns: [/\bhorse\b/i, /\bhorses\b/i, /\bequine\b/i] },
    { label: 'bird', patterns: [/\bbird\b/i, /\bavian\b/i, /\bparrot\b/i] },
    {
        label: 'small-pet',
        patterns: [/\bsmall pet\b/i, /\bhamster\b/i, /\bgerbil\b/i, /\bguinea pig\b/i, /\brabbit\b/i, /\bferret\b/i],
    },
];

const EXCLUDED_FROM_CONSOLIDATED_MERGE = new Set([
    'is_taxable',
    'taxable',
]);

interface PendingConsolidationRow {
    upc: string;
    next_fields: Record<string, unknown>;
    pipeline_status: 'processed' | 'reviewing';
    confidence_score: number | null;
    error_message: string | null;
    outcome: 'finalized' | 'rejected';
    name_key?: string;
    existing_consolidated?: Record<string, unknown>;
}

// =============================================================================
// Helper Functions
// =============================================================================

type SourceTrustLevel = 'canonical' | 'trusted' | 'standard' | 'marketplace';

function getSourceTrustLevel(sourceName: string): SourceTrustLevel {
    const normalized = sourceName.toLowerCase();

    if (normalized === 'shopsite_input') {
        return 'canonical';
    }

    if (MARKETPLACE_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        return 'marketplace';
    }

    if (TRUSTED_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        return 'trusted';
    }

    return 'standard';
}

function collectAnimalSignalsFromValue(
    value: unknown,
    detected: Set<AnimalSignal>,
    depth: number = 0
): void {
    if (depth > 5 || value === null || value === undefined) {
        return;
    }

    if (typeof value === 'string') {
        for (const rule of ANIMAL_SIGNAL_RULES) {
            if (rule.patterns.some((pattern) => pattern.test(value))) {
                detected.add(rule.label);
            }
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => {
            collectAnimalSignalsFromValue(entry, detected, depth + 1);
        });
        return;
    }

    if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((entry) => {
            collectAnimalSignalsFromValue(entry, detected, depth + 1);
        });
    }
}

// Inline helper to import and call normalizeProductSources to avoid direct dependency issues
function getNormalizedSources(sources: Record<string, unknown>): Record<string, any> {
    const { normalizeProductSources } = require('@/lib/product-sources');
    return normalizeProductSources(sources);
}

function collectExpectedAnimalSignals(
    input: Record<string, unknown>,
    sources: Record<string, unknown>
): Set<AnimalSignal> {
    const detected = new Set<AnimalSignal>();

    collectAnimalSignalsFromValue(input, detected);

    for (const [sourceName, sourcePayload] of Object.entries(getNormalizedSources(sources))) {
        if (getSourceTrustLevel(sourceName) === 'marketplace') {
            continue;
        }

        collectAnimalSignalsFromValue(sourcePayload, detected);
    }

    return detected;
}

function collectOutputAnimalSignals(nextFields: Record<string, unknown>): Set<AnimalSignal> {
    const detected = new Set<AnimalSignal>();
    const category = typeof nextFields.category === 'string'
        ? nextFields.category
        : typeof (nextFields.core as any)?.canonical_category_breadcrumb === 'string'
            ? (nextFields.core as any).canonical_category_breadcrumb
            : null;
    collectAnimalSignalsFromValue(category, detected);
    return detected;
}

function summarizeAnimalSignals(signals: Iterable<AnimalSignal>): string {
    return Array.from(signals).sort().join(', ');
}

export function normalizeConsolidatedRecord(record: any): any {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return { core: {}, facets: [], media: [], evidence: {} };
    }
    if ('core' in record) {
        return record;
    }
    return {
        core: {
            name: record.name,
            brand_name: record.brand_name || record.brand,
            brand_id: record.brand_id,
            description: record.description,
            price: record.price,
            weight_lbs: typeof record.weight === 'string' ? parseFloat(record.weight) || undefined : (typeof record.weight_lbs === 'number' ? record.weight_lbs : undefined),
            canonical_category_breadcrumb: record.canonical_category_breadcrumb || record.category,
            search_keywords: record.search_keywords,
            confidence_score: record.confidence_score,
            facet_profile: record.facet_profile,
            stock_status: record.stock_status,
            availability: record.availability,
            minimum_quantity: record.minimum_quantity,
            is_special_order: record.is_special_order,
            is_taxable: record.is_taxable,
            gtin: record.gtin,
        },
        facets: [],
        media: Array.isArray(record.images) ? record.images.map((url: string, idx: number) => ({
            url,
            role: idx === 0 ? 'main' : 'gallery',
            source: 'scraped',
            confidence_score: 1.0,
        })) : [],
        evidence: {
            selected_images: Array.isArray(record.images) ? record.images : [],
        }
    };
}

export function mergeNestedCandidates(current: any, next: any): any {
    const normCurrent = normalizeConsolidatedRecord(current);
    const normNext = normalizeConsolidatedRecord(next);

    const mergedCore = {
        ...(normCurrent.core || {}),
        ...(normNext.core || {}),
    };

    // Prune excluded fields from merged core
    for (const key of EXCLUDED_FROM_CONSOLIDATED_MERGE) {
        delete (mergedCore as any)[key];
    }

    const facetMap = new Map<string, any>();
    const currentFacets = Array.isArray(normCurrent.facets) ? normCurrent.facets : [];
    const nextFacets = Array.isArray(normNext.facets) ? normNext.facets : [];
    
    for (const f of currentFacets) {
        if (f.definition_slug) {
            facetMap.set(f.definition_slug, f);
        }
    }
    for (const f of nextFacets) {
        if (f.definition_slug) {
            facetMap.set(f.definition_slug, f);
        }
    }
    const mergedFacets = Array.from(facetMap.values());

    const mediaMap = new Map<string, any>();
    const currentMedia = Array.isArray(normCurrent.media) ? normCurrent.media : [];
    const nextMedia = Array.isArray(normNext.media) ? normNext.media : [];
    
    for (const m of currentMedia) {
        if (m.url) {
            mediaMap.set(m.url, m);
        }
    }
    for (const m of nextMedia) {
        if (m.url) {
            mediaMap.set(m.url, m);
        }
    }
    const mergedMedia = Array.from(mediaMap.values());

    const mergedEvidence = {
        ...(normCurrent.evidence || {}),
        ...(normNext.evidence || {}),
    };

    return {
        core: mergedCore,
        facets: mergedFacets,
        media: mergedMedia,
        evidence: mergedEvidence,
    };
}

function parseBatchMetadata(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    try {
        if (typeof value === 'string' && value.trim().length > 0) {
            return JSON.parse(value);
        }
    } catch {
        // Safe fallback
    }
    return {};
}

// =============================================================================
// Apply Results Orchestration
// =============================================================================

export async function applyResults(batchId: string): Promise<ApplyResultsResponse | BatchErrorResponse> {
    const results = await retrieveResults(batchId);
    return applyConsolidationResults(results, batchId);
}

export async function applyConsolidationResults(
    resultsInput: ConsolidationResult[] | BatchErrorResponse,
    batchIdentifier?: string
): Promise<ApplyResultsResponse | BatchErrorResponse> {
    const results = resultsInput;

    if ('success' in results && !results.success) {
        return results;
    }

    if (!Array.isArray(results)) {
        return { success: false, error: 'Invalid results format' };
    }

    const supabase = await createAdminClient();
    const config = await getConsolidationConfig();
    const confidenceThreshold =
        typeof config.confidence_threshold === 'number' && Number.isFinite(config.confidence_threshold)
            ? config.confidence_threshold
            : 0.7;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    let matchedBrandCount = 0;
    let unresolvedBrandCount = 0;
    let preservedExistingFieldCount = 0;
    let overwrittenFieldCount = 0;

    let batchJobRow: BatchRowLookup | null = null;
    if (batchIdentifier) {
        const lookup = await findBatchJobRow(batchIdentifier);
        if (lookup.lookupError) {
            return { success: false, error: `Failed to load batch metadata: ${lookup.lookupError}` };
        }
        batchJobRow = lookup.row;
    }

    const resultUpcs = Array.from(new Set(results.map((result) => result.upc).filter((upc) => upc && upc.length > 0)));

    let existingRows: Array<{
        upc: string;
        consolidated: unknown;
        sources: unknown;
        input: unknown;
        image_candidates: unknown;
        selected_images: unknown;
        brand_id: string | null;
    }> = [];
    if (resultUpcs.length > 0) {
        const existingRowsResponse = await supabase
            .from('products_ingestion')
            .select('upc, consolidated, sources, input, image_candidates, selected_images, brand_id')
            .in('upc', resultUpcs);

        if (existingRowsResponse.error) {
            return { success: false, error: `Failed to load existing products: ${existingRowsResponse.error.message}` };
        }

        existingRows = (existingRowsResponse.data || []) as any;
    }

    const existingByUpc = new Map<
        string,
        {
            consolidated: Record<string, unknown>;
            sources: Record<string, unknown>;
            input: Record<string, unknown>;
            imageCandidates: string[];
            selectedImages: string[];
            brand_id: string | null;
        }
    >();
    for (const row of existingRows) {
        const consolidated = row.consolidated;
        const sources = row.sources;
        const input = row.input;
        const imageCandidates = toStringUrlArray(row.image_candidates);
        const selectedImages = extractSelectedImageUrls(row.selected_images);

        const consolidatedRecord =
            consolidated && typeof consolidated === 'object' && !Array.isArray(consolidated)
                ? (consolidated as Record<string, unknown>)
                : {};

        const sourceRecord =
            sources && typeof sources === 'object' && !Array.isArray(sources)
                ? (sources as Record<string, unknown>)
                : {};
        const inputRecord =
            input && typeof input === 'object' && !Array.isArray(input)
                ? (input as Record<string, unknown>)
                : {};

        existingByUpc.set(row.upc, {
            consolidated: consolidatedRecord,
            sources: sourceRecord,
            input: inputRecord,
            imageCandidates,
            selectedImages,
            brand_id: row.brand_id,
        });
    }

    const brandResolver = await createBrandResolver(supabase);
    const updateRows: PendingConsolidationRow[] = [];

    for (const result of results) {
        try {
            if (!existingByUpc.has(result.upc)) {
                errorCount++;
                if (errors.length < 10) {
                    errors.push(`${result.upc}: missing products_ingestion row; skipped stale consolidation result`);
                }
                continue;
            }

            const existingRecord = existingByUpc.get(result.upc)!;
            const existingConsolidated = existingRecord.consolidated;

            if (result.error) {
                if (errors.length < 10) {
                    errors.push(`${result.upc}: ${result.error}`);
                }

                updateRows.push({
                    upc: result.upc,
                    next_fields: {},
                    pipeline_status: 'processed',
                    confidence_score: null,
                    error_message: result.error,
                    outcome: 'rejected',
                    existing_consolidated: existingConsolidated,
                });
                continue;
            }

            const normalizedExisting = normalizeConsolidatedRecord(existingConsolidated);
            const existingCore = normalizedExisting.core || {};
            const existingFacets = normalizedExisting.facets || [];
            const existingMedia = normCurrentMediaArray(normalizedExisting.media || []);
            const existingEvidence = normalizedExisting.evidence || {};

            // Compute source-backed fallbacks for missing core fields (marketplace confidence ~0.82)
            const sourceFallbacks = collectSourceBackedFallbacks(
                existingRecord.sources,
                existingRecord.input,
            );

            const normalizedBrand = cleanBrandLabel(result.brand) || cleanBrandLabel(sourceFallbacks.core.brand);

            const nextCategory = parseTaxonomyValues(result.category);
            const parsedPrice =
                typeof result.price === 'number'
                    ? result.price
                    : typeof result.price === 'string'
                        ? Number.parseFloat(result.price)
                        : Number.NaN;

            const weightValue = typeof result.weight === 'string' && result.weight.trim()
                ? result.weight.trim()
                : (existingCore.weight_lbs !== undefined && existingCore.weight_lbs !== null
                    ? `${existingCore.weight_lbs} lbs`
                    : sourceFallbacks.core.weight_lbs);

            const draftName = typeof result.name === 'string' && result.name.trim() ? result.name.trim() : (existingCore.name || sourceFallbacks.core.name || undefined);
            const draftCategory = nextCategory.length > 0 ? nextCategory.join('|') : (existingCore.canonical_category_breadcrumb || undefined);
            const draftDescription = typeof result.description === 'string' && result.description.trim() ? result.description.trim() : (existingCore.description || sourceFallbacks.core.description || undefined);
            const draftSearchKeywords = typeof result.search_keywords === 'string' && result.search_keywords.trim() ? result.search_keywords.trim() : (existingCore.search_keywords || sourceFallbacks.core.search_keywords || undefined);

            // Track which fields were filled from source fallbacks for audit trail
            const fieldSources: Record<string, string> = {};
            if (!result.name?.trim() && !existingCore.name && sourceFallbacks.core.name) {
                fieldSources.name = 'source_fallback:name';
            }
            if (!result.description?.trim() && !existingCore.description && sourceFallbacks.core.description) {
                fieldSources.description = 'source_fallback:description';
            }
            if (!result.search_keywords?.trim() && !existingCore.search_keywords && sourceFallbacks.core.search_keywords) {
                fieldSources.search_keywords = 'source_fallback:search_keywords';
            }
            if (!result.weight?.trim() && (existingCore.weight_lbs === undefined || existingCore.weight_lbs === null) && sourceFallbacks.core.weight_lbs) {
                fieldSources.weight_lbs = 'source_fallback:weight_lbs';
            }
            if (!result.brand?.trim() && !existingCore.brand_name && sourceFallbacks.core.brand) {
                fieldSources.brand = 'source_fallback:brand';
            }

            const gateErrors: string[] = [];

            try {
                validateRequiredConsolidationFields({
                    name: draftName,
                    brand: normalizedBrand || (existingCore.brand_name || undefined),
                    category: draftCategory,
                    description: draftDescription,
                    search_keywords: draftSearchKeywords,
                    confidence_score: result.confidence_score,
                });
            } catch (validationError: unknown) {
                gateErrors.push(
                    validationError instanceof Error ? validationError.message : 'Invalid consolidation output'
                );
            }

            if (
                typeof result.confidence_score === 'number'
                && Number.isFinite(result.confidence_score)
                && result.confidence_score < confidenceThreshold
            ) {
                gateErrors.push(
                    `confidence_score ${result.confidence_score.toFixed(2)} is below threshold ${confidenceThreshold.toFixed(2)}`
                );
            }

            const outputAnimalSignals = collectOutputAnimalSignals({
                core: {
                    canonical_category_breadcrumb: draftCategory
                }
            });
            const expectedAnimalSignals = collectExpectedAnimalSignals(
                existingRecord.input,
                existingRecord.sources
            );
            const unexpectedAnimalSignals = Array.from(outputAnimalSignals).filter(
                (signal) => expectedAnimalSignals.size > 0 && !expectedAnimalSignals.has(signal)
            );

            if (unexpectedAnimalSignals.length > 0) {
                const nameLower = (draftName || '').toLowerCase();
                const descLower = (draftDescription || '').toLowerCase();
                const isToy = nameLower.includes('toy') || descLower.includes('toy') || nameLower.includes('chew') || descLower.includes('chew') || nameLower.includes('squeak') || descLower.includes('squeak');
                if (isToy) {
                    console.log(`[Bypass] Allowing unexpected animal signals ${unexpectedAnimalSignals.join(', ')} for toy product ${result.upc}`);
                } else {
                    gateErrors.push(
                        `taxonomy/pages target ${unexpectedAnimalSignals.join(', ')} but trusted source evidence supports ${summarizeAnimalSignals(expectedAnimalSignals)}`
                    );
                }
            }

            if (gateErrors.length > 0) {
                const errorMessage = gateErrors.join('; ');
                if (errors.length < 10) {
                    errors.push(`${result.upc}: ${errorMessage}`);
                }

                updateRows.push({
                    upc: result.upc,
                    next_fields: {},
                    pipeline_status: 'processed',
                    confidence_score: result.confidence_score ?? null,
                    error_message: errorMessage,
                    outcome: 'rejected',
                    existing_consolidated: existingConsolidated,
                });
                continue;
            }

            const {
                brandId: resolvedBrandId,
                brandName: resolvedBrandName,
            } = await brandResolver.resolveBrand(normalizedBrand);

            if (normalizedBrand) {
                if (resolvedBrandId) {
                    matchedBrandCount += 1;
                } else {
                    unresolvedBrandCount += 1;
                }
            }

            const nextCore = {
                name: draftName,
                brand_name: resolvedBrandName || normalizedBrand || (existingCore.brand_name || undefined),
                brand_id: resolvedBrandId || (existingCore.brand_id || undefined),
                description: draftDescription,
                price: Number.isFinite(parsedPrice) ? parsedPrice : (typeof existingCore.price === 'number' ? existingCore.price : undefined),
                weight_lbs: weightValue ? parseFloat(weightValue) || undefined : undefined,
                canonical_category_breadcrumb: draftCategory,
                search_keywords: draftSearchKeywords,
                confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : (typeof existingCore.confidence_score === 'number' ? existingCore.confidence_score : undefined),
            };

            // Assemble product facets
            const facetResults = assembleProductFacets(
                result,
                nextCore,
                existingCore,
                existingFacets,
                existingRecord
            );

            // Add facet_profile classification to core
            (nextCore as any).facet_profile = facetResults.facetProfile;

            // Handle images & media
            const mediaResults = resolveProductMedia(
                existingMedia,
                existingEvidence,
                existingRecord
            );

            const nextFieldsNested = {
                core: nextCore,
                facets: facetResults.facets,
                media: mediaResults.media,
                evidence: {
                    ...existingEvidence,
                    selected_images: mediaResults.selectedImages,
                    ...(Object.keys(fieldSources).length > 0 ? { field_sources: fieldSources } : {}),
                },
            };

            updateRows.push({
                upc: result.upc,
                next_fields: nextFieldsNested,
                pipeline_status: 'reviewing',
                confidence_score: result.confidence_score ?? null,
                error_message: null,
                outcome: 'finalized',
                name_key: typeof nextCore.name === 'string' ? normalizeLookupKey(nextCore.name) : undefined,
                existing_consolidated: existingConsolidated,
            });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            if (errors.length < 10) {
                errors.push(`${result.upc}: ${errorMessage}`);
            }

            const existingConsolidated = existingByUpc.get(result.upc)?.consolidated || {};
            updateRows.push({
                upc: result.upc,
                next_fields: {},
                pipeline_status: 'processed',
                confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : null,
                error_message: errorMessage,
                outcome: 'rejected',
                existing_consolidated: existingConsolidated,
            });
        }
    }

    // Helper to safely cast array for media resolution
    function normCurrentMediaArray(media: any[]): Array<{ url: string; role?: string; source?: string; confidence_score?: number }> {
        return media.map((m) => ({
            url: m.url || '',
            role: m.role,
            source: m.source,
            confidence_score: m.confidence_score,
        }));
    }

    // =========================================================================
    // Duplicate name detection with source-based disambiguation
    // =========================================================================
    const duplicateNameGroups = new Map<string, PendingConsolidationRow[]>();
    for (const row of updateRows) {
        if (row.outcome !== 'finalized' || !row.name_key) {
            continue;
        }

        const group = duplicateNameGroups.get(row.name_key) || [];
        group.push(row);
        duplicateNameGroups.set(row.name_key, group);
    }

    const warnings: string[] = [];

    for (const group of duplicateNameGroups.values()) {
        if (group.length < 2) {
            continue;
        }

        const firstFields = group[0].next_fields;
        const duplicateName =
            firstFields && typeof firstFields.name === 'string'
                ? firstFields.name
                : firstFields?.core && typeof (firstFields.core as any).name === 'string'
                    ? (firstFields.core as any).name
                    : 'duplicate consolidation name';

        // Try to disambiguate using source variant fields
        const disambiguated = tryDisambiguateDuplicateNames(group, existingByUpc);

        if (disambiguated) {
            for (const row of group) {
                const newName = disambiguated.get(row.upc);
                if (newName) {
                    if (typeof row.next_fields.name === 'string') {
                        row.next_fields.name = newName;
                    } else if (row.next_fields.core) {
                        (row.next_fields.core as any).name = newName;
                    }
                    row.name_key = normalizeLookupKey(newName);
                }
            }
            continue;
        }

        // Could not disambiguate — warn but allow through (user can review in reviewing)
        const warningMessage = `duplicate name "${duplicateName}" across UPCs ${group.map((row) => row.upc).join(', ')} — consider reviewing for flavor/color/material differences`;
        if (warnings.length < 10) {
            warnings.push(warningMessage);
        }
    }

    for (const row of updateRows) {
        if (row.outcome !== 'finalized') {
            continue;
        }

        const existingConsolidated = row.existing_consolidated || {};
        const nextFlat = {
            ...((row.next_fields as any).core || {}),
            ...Object.fromEntries(((row.next_fields as any).facets || []).map((f: any) => [f.definition_slug, f.value]))
        };
        const existingFlat = {
            ...(normalizeConsolidatedRecord(existingConsolidated).core || {}),
            ...Object.fromEntries((normalizeConsolidatedRecord(existingConsolidated).facets || []).map((f: any) => [f.definition_slug, f.value]))
        };

        Object.entries(nextFlat).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            const existingValue = existingFlat[key];
            if (existingValue === undefined || existingValue === null || existingValue === '') {
                overwrittenFieldCount += 1;
                return;
            }
            if (existingValue === value) {
                preservedExistingFieldCount += 1;
            } else {
                overwrittenFieldCount += 1;
            }
        });
    }

    if (updateRows.length > 0) {
        for (const row of updateRows) {
            const maxAttempts = 3;
            let applied = false;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const { data: latestRow, error: latestError } = await supabase
                    .from('products_ingestion')
                    .select('consolidated, updated_at')
                    .eq('upc', row.upc)
                    .maybeSingle();

                if (latestError) {
                    return {
                        success: false,
                        error: `Failed to load latest products_ingestion row for ${row.upc}: ${latestError.message}`,
                    };
                }

                if (!latestRow) {
                    errorCount++;
                    if (errors.length < 10) {
                        errors.push(`${row.upc}: products_ingestion row deleted before apply; skipped stale consolidation result`);
                    }
                    applied = true;
                    break;
                }

                const currentConsolidated =
                    latestRow.consolidated && typeof latestRow.consolidated === 'object' && !Array.isArray(latestRow.consolidated)
                        ? (latestRow.consolidated as Record<string, unknown>)
                        : {};

                const mergedConsolidated = mergeNestedCandidates(currentConsolidated, row.next_fields);

                const applyTimestamp = new Date().toISOString();
                let updateQuery = supabase
                    .from('products_ingestion')
                    .update({
                        consolidated: mergedConsolidated,
                        brand_id: mergedConsolidated.core?.brand_id || null,
                        pipeline_status: row.pipeline_status,
                        confidence_score: row.confidence_score,
                        error_message: row.error_message,
                        updated_at: applyTimestamp,
                    })
                    .eq('upc', row.upc);

                if (typeof latestRow.updated_at === 'string' && latestRow.updated_at.length > 0) {
                    updateQuery = updateQuery.eq('updated_at', latestRow.updated_at);
                }

                const { data: updatedRow, error: updateError } = await updateQuery
                    .select('upc')
                    .maybeSingle();

                if (updateError) {
                    return {
                        success: false,
                        error: `Failed to apply consolidation for ${row.upc}: ${updateError.message}`,
                    };
                }

                if (updatedRow) {
                    if (row.outcome === 'finalized') {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                    applied = true;
                    break;
                }

                if (attempt === maxAttempts) {
                    return {
                        success: false,
                        error: `Failed to apply consolidation for ${row.upc}: concurrent update contention`,
                    };
                }
            }

            if (!applied) {
                return {
                    success: false,
                    error: `Failed to apply consolidation for ${row.upc}: unknown apply state`,
                };
            }
        }
    }

    // Re-cohort products whose brand has changed or been newly assigned
    if (updateRows.length > 0) {
        const { recohortProducts } = await import('@/lib/pipeline/cohorts');
        const upcsByBrand = new Map<string | null, string[]>();

        for (const row of updateRows) {
            if (row.outcome === 'finalized') {
                const brandId = ((row.next_fields.core as any)?.brand_id as string | null) || null;
                const existingRow = existingByUpc.get(row.upc);
                const oldBrandId = existingRow?.brand_id || null;

                if (brandId !== oldBrandId) {
                    const list = upcsByBrand.get(brandId) || [];
                    list.push(row.upc);
                    upcsByBrand.set(brandId, list);
                }
            }
        }

        for (const [brandId, brandUpcs] of upcsByBrand.entries()) {
            try {
                await recohortProducts(supabase, brandUpcs, brandId);
            } catch (err) {
                console.error(`[applyConsolidationResults] Failed to re-cohort products for brand ${brandId}:`, err);
                errors.push(`Cohort assignment failed for some products with brand ${brandId}`);
            }
        }
    }

    if (batchJobRow) {
        const priorMetadata = parseBatchMetadata(batchJobRow.metadata);
        const qualityMetrics = {
            matched_brand_count: matchedBrandCount,
            unresolved_brand_count: unresolvedBrandCount,
            preserved_existing_field_count: preservedExistingFieldCount,
            overwritten_field_count: overwrittenFieldCount,
        };

        const metadata = {
            ...priorMetadata,
            quality_metrics: qualityMetrics,
            applied_at: new Date().toISOString(),
            apply_summary: {
                success_count: successCount,
                error_count: errorCount,
                total: results.length,
            },
        };

        const { error: metadataUpdateError } = await supabase
            .from('batch_jobs')
            .update({ metadata })
            .eq('id', batchJobRow.id);

        if (metadataUpdateError) {
            errors.push(`batch metadata update failed: ${metadataUpdateError.message}`);
        }
    }

    if (errors.length > 0) {
        console.error('[Consolidation Apply] Per-product errors:', errors.join('\n'));
    }

    const qualityMetrics = {
        matched_brand_count: matchedBrandCount,
        unresolved_brand_count: unresolvedBrandCount,
        preserved_existing_field_count: preservedExistingFieldCount,
        overwritten_field_count: overwrittenFieldCount,
    };

    return {
        status: 'applied',
        success_count: successCount,
        error_count: errorCount,
        total: results.length,
        quality_metrics: qualityMetrics,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}
