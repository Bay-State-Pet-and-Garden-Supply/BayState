import { assembleProductFacets } from '@/lib/consolidation/facet-assembler';

jest.mock('@/lib/consolidation/detail-enrichment', () => ({
    enrichProductDetails: jest.fn().mockReturnValue({
        facetProfile: 'dog_food',
        fields: {
            flavor: 'Chicken',
        },
    }),
}));

jest.mock('@/lib/product-source-fallbacks', () => ({
    collectSourceBackedFallbacks: jest.fn((sources: Record<string, unknown>, input?: Record<string, unknown>) => {
        // Return empty fallbacks by default (existing tests)
        if (Object.keys(sources).length === 0 && Object.keys(input || {}).length === 0) {
            return { core: {}, facets: [], media: [], evidence: { source_urls: [], selected_images: [] }, profileHints: [] };
        }
        // For the provenance test, return source-backed facets
        if ((sources as any)?.amazon) {
            return {
                core: {},
                facets: [
                    { definition_slug: 'primary_protein', value: 'Chicken', confidence_score: 0.82, evidence_source: 'source:amazon:extracted.facets' },
                    { definition_slug: 'dimensions', value: '10.83 x 6.57 x 2.05 inches', confidence_score: 0.82, evidence_source: 'source:amazon:extracted.facets.dimensions' },
                ],
                media: [],
                evidence: { source_urls: [], selected_images: [] },
                profileHints: [],
            };
        }
        return { core: {}, facets: [], media: [], evidence: { source_urls: [], selected_images: [] }, profileHints: [] };
    }),
}));

describe('FacetAssembler', () => {
    it('correctly compiles facets from LLM results, packaging_facets, heuristic enrichment, and existing facets', () => {
        const result = {
            upc: '1234567890',
            name: 'KONG Classic Dog Toy Medium Red',
            brand: 'KONG',
            confidence_score: 0.95,
            category: 'Dog > Toys',
            description: 'Classic rubber toy',
            search_keywords: 'kong, toy',
            packaging_facets: {
                color: 'Red',
                material: 'Rubber',
            },
            // Legacy / extra facet keys from LLM
            special_diet: 'Grain-Free', 
        };

        const nextCore = {
            name: 'KONG Classic Dog Toy Medium Red',
            canonical_category_breadcrumb: 'Dog > Toys',
        };

        const existingCore = {
            facet_profile: 'dog_toy',
        };

        const existingFacets = [
            { definition_slug: 'size', value: 'Medium', confidence_score: 0.8, evidence_source: 'existing' },
        ];

        const existingRecord = {
            sources: {},
            input: {},
        };

        const assembly = assembleProductFacets(
            result,
            nextCore,
            existingCore,
            existingFacets,
            existingRecord
        );

        expect(assembly.facetProfile).toBe('dog_food'); // Mocked value from enrichProductDetails

        // Convert facets array to map for easier assertions
        const facetMap = new Map(assembly.facets.map((f) => [f.definition_slug, f]));

        // Check packaging_facets (vlm_ocr)
        expect(facetMap.get('color')).toEqual({
            definition_slug: 'color',
            value: 'Red',
            confidence_score: 0.95,
            evidence_source: 'vlm_ocr',
        });
        expect(facetMap.get('material')).toEqual({
            definition_slug: 'material',
            value: 'Rubber',
            confidence_score: 0.95,
            evidence_source: 'vlm_ocr',
        });

        // Check legacy field mapping: special_diet mapped to diet_type
        expect(facetMap.get('diet_type')).toEqual({
            definition_slug: 'diet_type',
            value: 'Grain-Free',
            confidence_score: 0.9,
            evidence_source: 'llm',
        });

        // Check heuristic enrichment (from mock)
        expect(facetMap.get('flavor')).toEqual({
            definition_slug: 'flavor',
            value: 'Chicken',
            confidence_score: 0.85,
            evidence_source: 'heuristic_enrichment',
        });

        // Check preserved existing facets
        expect(facetMap.get('size')).toEqual({
            definition_slug: 'size',
            value: 'Medium',
            confidence_score: 0.8,
            evidence_source: 'existing',
        });
    });

    it('preserves evidence_source on source-backed fallback facets', () => {
        const result = {
            upc: 'AMAZON-1',
            name: '360 Pet Nutrition Freeze-Dried Raw Dog Food',
            brand: '360 Pet Nutrition',
            confidence_score: 0.95,
            category: 'Dog',
            description: 'Made with high-quality ingredients',
            search_keywords: 'dog food, freeze-dried',
        };

        const nextCore = {
            name: '360 Pet Nutrition Freeze-Dried Raw Dog Food',
            canonical_category_breadcrumb: 'Dog',
        };

        const existingCore = {};
        const existingFacets: Array<{ definition_slug?: string; value?: string; confidence_score?: number; evidence_source?: string }> = [];
        const existingRecord = {
            sources: {
                /**
                 * @description The source-backed fallback mock (above) returns facets when sources.amazon exists.
                 * The mock checks for the amazon key, so this will trigger the source-backed fallback path.
                 */
                amazon: {
                    title: '360 Pet Nutrition Freeze-Dried Raw Dog Food',
                    brand: '360 Pet Nutrition',
                },
            },
            input: {},
        };

        const assembly = assembleProductFacets(
            result,
            nextCore,
            existingCore,
            existingFacets,
            existingRecord
        );

        const facetMap = new Map(assembly.facets.map((f) => [f.definition_slug, f]));

        // Source-backed facets should keep their evidence_source (not be overwritten)
        const protein = facetMap.get('primary_protein');
        expect(protein).toBeDefined();
        expect(protein!.value).toBe('Chicken');
        expect(protein!.confidence_score).toBe(0.82);
        expect(protein!.evidence_source).toBe('source:amazon:extracted.facets');

        const dimensions = facetMap.get('dimensions');
        expect(dimensions).toBeDefined();
        expect(dimensions!.value).toBe('10.83 x 6.57 x 2.05 inches');
        expect(dimensions!.evidence_source).toBe('source:amazon:extracted.facets.dimensions');
    });
});
