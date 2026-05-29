import { assembleProductFacets } from '@/lib/consolidation/facet-assembler';

jest.mock('@/lib/consolidation/detail-enrichment', () => ({
    enrichProductDetails: jest.fn().mockReturnValue({
        facetProfile: 'dog_food',
        fields: {
            flavor: 'Chicken',
        },
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
});
