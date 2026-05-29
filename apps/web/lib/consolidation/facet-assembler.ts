/**
 * Facet Assembler for Product Consolidation
 */

import type { ConsolidationResult } from './types';
import { enrichProductDetails } from './detail-enrichment';

export const LEGACY_TO_CANONICAL_FACETS: Record<string, string> = {
    pet_type: 'animal_type',
    life_stage: 'life_stage',
    pet_size: 'breed_size',
    special_diet: 'diet_type',
    health_feature: 'health_focus',
    food_form: 'food_form',
    flavor: 'flavor',
    product_feature: 'claims',
    size: 'size',
    color: 'color',
    packaging_type: 'packaging_type',
};

export interface AssembledFacet {
    definition_slug: string;
    value: string;
    confidence_score: number;
    evidence_source: string;
}

export interface FacetAssemblyResult {
    facets: AssembledFacet[];
    facetProfile: string | null;
}

/**
 * Unpacks LLM result, VLM packaging facets, runs heuristic enrichment,
 * preserves existing facets, and returns a compiled list of facets and the resolved profile.
 */
export function assembleProductFacets(
    result: ConsolidationResult,
    nextCore: { name?: string; canonical_category_breadcrumb?: string },
    existingCore: Record<string, unknown>,
    existingFacets: Array<{
        definition_slug?: string;
        value?: string;
        confidence_score?: number;
        evidence_source?: string;
    }>,
    existingRecord: {
        sources?: Record<string, unknown>;
        input?: Record<string, unknown>;
    }
): FacetAssemblyResult {
    const candidateFacetsMap = new Map<string, { value: string; confidence: number; source: string }>();

    const addFacet = (key: string, value: unknown, confidence: number = 0.9, source: string = 'llm') => {
        if (value === undefined || value === null || value === '') return;
        const strValue = typeof value === 'string' ? value.trim() : String(value).trim();
        if (strValue.length === 0) return;

        const canonicalKey = LEGACY_TO_CANONICAL_FACETS[key] || key;
        if (!candidateFacetsMap.has(canonicalKey)) {
            candidateFacetsMap.set(canonicalKey, {
                value: strValue,
                confidence,
                source,
            });
        }
    };

    // 1. Unpack VLM-extracted packaging facets if present
    if (result.packaging_facets && typeof result.packaging_facets === 'object') {
        for (const [key, value] of Object.entries(result.packaging_facets)) {
            addFacet(key, value, 0.95, 'vlm_ocr');
        }
    }

    // 2. Unpack other fields directly from result (keys not in core schema)
    const coreKeys = new Set([
        'upc',
        'name',
        'brand',
        'weight',
        'price',
        'category',
        'description',
        'confidence_score',
        'search_keywords',
        'error',
        'packaging_facets',
    ]);
    for (const [key, value] of Object.entries(result)) {
        if (!coreKeys.has(key)) {
            addFacet(key, value, 0.9, 'llm');
        }
    }

    // 3. Heuristic detail enrichment
    const tempConsolidated = {
        name: nextCore.name,
        category: nextCore.canonical_category_breadcrumb,
        facet_profile: (existingCore.facet_profile as string) || undefined,
    };
    const enrichment = enrichProductDetails({
        consolidated: tempConsolidated,
        sources: existingRecord?.sources || {},
        input: existingRecord?.input || {},
    });

    for (const [key, value] of Object.entries(enrichment.fields)) {
        addFacet(key, value, 0.85, 'heuristic_enrichment');
    }

    // 4. Preserve existing facets if not overridden
    for (const facet of existingFacets) {
        if (facet.definition_slug && facet.value) {
            addFacet(
                facet.definition_slug,
                facet.value,
                facet.confidence_score ?? 0.9,
                facet.evidence_source ?? 'existing'
            );
        }
    }

    const facets: AssembledFacet[] = Array.from(candidateFacetsMap.entries()).map(([slug, f]) => ({
        definition_slug: slug,
        value: f.value,
        confidence_score: f.confidence,
        evidence_source: f.source,
    }));

    return {
        facets,
        facetProfile: enrichment.facetProfile || null,
    };
}
