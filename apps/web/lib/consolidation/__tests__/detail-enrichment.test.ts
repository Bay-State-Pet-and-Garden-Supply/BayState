import { describe, it, expect } from '@jest/globals';
import { enrichProductDetails } from '../detail-enrichment';

function makeInput(
    consolidated: Record<string, unknown>,
    sources: Record<string, unknown> = {},
    input: Record<string, unknown> = {},
) {
    return { consolidated, sources, input };
}

describe('enrichProductDetails', () => {
    describe('facetProfile classification', () => {
        it('classifies animal_food correctly', () => {
            const result = enrichProductDetails(
                makeInput({ category: 'Dog > Food > Dry Food', name: 'Blue Buffalo Dog Food' }),
            );
            expect(result.facetProfile).toBe('animal_food');
        });

        it('classifies garden_consumable correctly', () => {
            const result = enrichProductDetails(
                makeInput({ category: 'Lawn & Garden > Soil, Mulch & Compost', name: 'Miracle-Gro Potting Mix' }),
            );
            expect(result.facetProfile).toBe('garden_consumable');
        });

        it('classifies general for unknown category', () => {
            const result = enrichProductDetails(
                makeInput({ category: 'Seasonal', name: 'Holiday Lights' }),
            );
            expect(result.facetProfile).toBe('general');
        });

        it('uses explicit facet_profile from consolidated data', () => {
            const result = enrichProductDetails(
                makeInput({ category: 'Seasonal', name: 'Fertilizer', facet_profile: 'garden_consumable' }),
            );
            expect(result.facetProfile).toBe('garden_consumable');
        });
    });

    describe('pet food field extraction', () => {
        it('extracts animal_type from product name', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Blue Buffalo Life Protection Formula Adult Dog Food Chicken 30 lb.',
                }),
            );
            expect(result.fields.animal_type).toContain('Dog');
            expect(result.populatedFields).toContain('animal_type');
        });

        it('extracts life_stage from product name', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Blue Buffalo Life Protection Formula Puppy Chicken 15 lb.',
                }),
            );
            expect(result.fields.life_stage).toBe('Puppy');
        });

        it('extracts food_form from category', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Blue Buffalo Dog Food 30 lb.',
                }),
            );
            expect(result.fields.food_form).toBe('Dry');
        });

        it('extracts flavor from product name', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Blue Buffalo Life Protection Formula Adult Chicken and Brown Rice 30 lb.',
                }),
            );
            expect(result.fields.flavor).toContain('Chicken');
        });

        it('extracts diet_type from description', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Food > Dry Food',
                    name: 'Merrick Grain-Free Real Chicken Recipe 25 lb.',
                    description: 'Grain-free formula with real deboned chicken',
                }),
            );
            expect(result.fields.diet_type).toContain('Grain-Free');
        });

        it('extracts breed_size from product name', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Food > Dry Food',
                    name: 'Blue Buffalo Life Protection Large Breed Adult Chicken 30 lb.',
                }),
            );
            expect(result.fields.breed_size).toBe('Large Breed');
        });

        it('extracts health_focus from description', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Food > Dry Food',
                    name: 'Hill\'s Science Diet Adult Joint Support Chicken 30 lb.',
                    description: 'Supports joint health with glucosamine and chondroitin',
                }),
            );
            expect(result.fields.health_focus).toContain('Joint Support');
        });
    });

    describe('structured source data extraction', () => {
        it('prefers structured source data over pattern matching', () => {
            const result = enrichProductDetails(
                makeInput(
                    {
                        category: 'Dog > Dog Food > Dry Food',
                        name: 'Some Dog Food 30 lb.',
                    },
                    {
                        central_pet: {
                            title: 'Some Dog Food',
                            flavor: 'Wild Salmon & Sweet Potato',
                            life_stage: 'All Life Stages',
                        },
                    },
                ),
            );
            // Should use the structured source value, not pattern-matched
            expect(result.fields.flavor).toBe('Wild Salmon & Sweet Potato');
            expect(result.fields.life_stage).toBe('All Life Stages');
        });

        it('checks specification objects in sources', () => {
            const result = enrichProductDetails(
                makeInput(
                    {
                        category: 'Dog > Dog Food > Dry Food',
                        name: 'Dog Food 30 lb.',
                    },
                    {
                        distributor: {
                            title: 'Dog Food',
                            specifications: {
                                flavor: 'Beef & Barley',
                                food_form: 'Dry Kibble',
                            },
                        },
                    },
                ),
            );
            expect(result.fields.flavor).toBe('Beef & Barley');
            expect(result.fields.food_form).toBe('Dry Kibble');
        });
    });

    describe('profile-appropriate field filtering', () => {
        it('does NOT extract food fields for animal_habitat_containment', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Crates, Kennels & Gates > Crates',
                    name: 'MidWest Dog Crate Large',
                }),
            );
            expect(result.facetProfile).toBe('animal_habitat_containment');
            expect(result.fields).not.toHaveProperty('flavor');
            expect(result.fields).not.toHaveProperty('food_form');
            expect(result.fields).not.toHaveProperty('diet_type');
            expect(result.fields).not.toHaveProperty('health_focus');
        });

        it('does NOT extract pet fields for garden_consumable', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Lawn & Garden > Fertilizer',
                    name: 'Miracle-Gro All Purpose Plant Food 5 lb.',
                }),
            );
            expect(result.facetProfile).toBe('garden_consumable');
            expect(result.fields).not.toHaveProperty('animal_type');
            expect(result.fields).not.toHaveProperty('life_stage');
            expect(result.fields).not.toHaveProperty('flavor');
        });

        it('reports missing fields correctly', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Generic Dog Food 30 lb.',
                }),
            );
            // product_feature should be in missing since it can't be pattern-matched
            expect(result.missingFields).toContain('product_feature');
        });
    });

    describe('pre-existing values', () => {
        it('preserves values already in consolidated', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Dog Food 30 lb.',
                    animal_type: 'Dog',
                    flavor: 'Custom Flavor',
                }),
            );
            // Should preserve the existing values, not overwrite
            expect(result.fields.animal_type).toBe('Dog');
            expect(result.fields.flavor).toBe('Custom Flavor');
            expect(result.populatedFields).toContain('animal_type');
            expect(result.populatedFields).toContain('flavor');
        });

        it('preserves values from input record', () => {
            const result = enrichProductDetails(
                makeInput(
                    {
                        category: 'Dog > Dog Food > Dry Food',
                        name: 'Dog Food 30 lb.',
                    },
                    {},
                    {
                        animal_type: 'Dog',
                        flavor: 'Existing Flavor',
                    },
                ),
            );
            expect(result.fields.animal_type).toBe('Dog');
            expect(result.fields.flavor).toBe('Existing Flavor');
        });
    });

    describe('packaging type extraction', () => {
        it('infers bag from product name', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Dog Food 30 lb. Bag',
                }),
            );
            expect(result.fields.packaging_type).toBe('Bag');
        });

        it('infers can from canned category', () => {
            const result = enrichProductDetails(
                makeInput({
                    category: 'Dog > Dog Food > Canned Food',
                    name: 'Blue Buffalo Canned Dog Food Chicken 12.5 oz.',
                }),
            );
            expect(result.fields.packaging_type).toBe('Can');
        });
    });
});

// =============================================================================
// Regression: Amazon enriched payload with extracted.core, facets, approved_sources
// =============================================================================

describe('Amazon enriched payload extraction', () => {
    const AMAZON_SOURCES = {
        enriched: {
            source_kind: 'enriched',
            source_slug: 'amazon',
            source_type: 'marketplace',
            name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe',
            title: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe',
            description: 'Made with High-Quality Ingredients – Each bag is crafted with real meat, nutrient-rich organ meats, fruits, vegetables, and seeds.',
            extracted: {
                core: {
                    name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe with Liver & Organs, High Protein, Omega-3s, Fruits, Veggies & Superfoods, Grain-Free, No Fillers, 5 oz – Made in USA',
                    brand_name: '360 Pet Nutrition',
                    description: 'Made with High-Quality Ingredients – Each bag is crafted with real meat, nutrient-rich organ meats, fruits, vegetables, and seeds, providing a variety of ingredients in every serving. Made proudly in the USA.\nFreeze-Dried for Convenience – Freeze-drying helps maintain the natural taste and nutrients of raw ingredients while making it easy to store and prepare, with no refrigeration needed.',
                    weight_lbs: 0.3125,
                },
                facets: [
                    { definition_slug: 'dimensions', value: '10.83 x 6.57 x 2.05 inches; 5 ounces' },
                    { definition_slug: 'features', value: 'Made with High-Quality Ingredients – Each bag is crafted with real meat.' },
                    { definition_slug: 'features', value: 'Freeze-Dried for Convenience – Freeze-drying helps maintain the natural taste.' },
                    { definition_slug: 'features', value: 'No Fillers or Artificial Preservatives – Formulated without grains, cereals, or unnecessary fillers.' },
                ],
                evidence: {
                    source_urls: ['https://www.amazon.com/dp/B0DJMXTW72'],
                },
            },
            approved_sources: {
                amazon: {
                    name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe',
                    brand: '360 Pet Nutrition',
                    extracted: {
                        core: {
                            name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe with Liver & Organs',
                            brand_name: '360 Pet Nutrition',
                            description: 'Made with High-Quality Ingredients...',
                        },
                    },
                },
            },
            source_results: [
                {
                    sourceSlug: 'amazon',
                    sourceType: 'marketplace',
                    product: {
                        core: {
                            name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe with Liver & Organs, Grain-Free, No Fillers, 5 oz – Made in USA',
                            brand_name: '360 Pet Nutrition',
                            description: 'Made with High-Quality Ingredients – Each bag is crafted with real meat.',
                            weight_lbs: 0.3125,
                        },
                        facets: [
                            { definition_slug: 'food_form', value: 'Freeze-Dried' },
                            { definition_slug: 'diet_type', value: 'Grain-Free' },
                        ],
                    },
                },
            ],
        },
    } as unknown as Record<string, unknown>;

    it('infers animal_food profile when category is null but source evidence exists', () => {
        const result = enrichProductDetails(
            makeInput(
                { name: 'Freeze-Dried Raw Dog Food' },
                AMAZON_SOURCES,
            ),
        );
        expect(result.facetProfile).toBe('animal_food');
    });

    it('extracts animal_type from enriched source text with no category', () => {
        const result = enrichProductDetails(
            makeInput(
                { name: 'Freeze-Dried Raw Dog Food' },
                AMAZON_SOURCES,
            ),
        );
        expect(result.fields.animal_type).toContain('Dog');
    });

    it('extracts food_form from source_results facets', () => {
        const result = enrichProductDetails(
            makeInput(
                { name: 'Freeze-Dried Raw Dog Food' },
                AMAZON_SOURCES,
            ),
        );
        expect(result.fields.food_form).toBe('Freeze-Dried');
    });

    it('extracts diet_type from source_results facets', () => {
        const result = enrichProductDetails(
            makeInput(
                { name: 'Freeze-Dried Raw Dog Food' },
                AMAZON_SOURCES,
            ),
        );
        expect(result.fields.diet_type).toContain('Grain-Free');
    });

    it('extracts claims (Made in USA) from source text', () => {
        const result = enrichProductDetails(
            makeInput(
                { name: 'Freeze-Dried Raw Dog Food' },
                AMAZON_SOURCES,
            ),
        );
        expect(result.fields.claims).toContain('Made in USA');
    });
});

// =============================================================================
// Regression: Distributor-sourced facets from scraper adapters
// =============================================================================

describe('distributor-sourced facet extraction', () => {
    const DISTRIBUTOR_FACETS_SOURCE = {
        central_pet: {
            title: 'Premium Dog Food Salmon Recipe 30 lb',
            extracted: {
                core: {
                    name: 'Premium Dog Food Salmon Recipe 30 lb',
                    brand_name: 'Premium Pet',
                },
                facets: [
                    { definition_slug: 'animal_type', value: 'Dog' },
                    { definition_slug: 'breed_size', value: 'Large Breed' },
                    { definition_slug: 'food_form', value: 'Dry' },
                    { definition_slug: 'primary_protein', value: 'Salmon' },
                    { definition_slug: 'diet_type', value: 'Grain-Free' },
                    { definition_slug: 'package_count', value: '1' },
                    { definition_slug: 'package_weight', value: '30 lb' },
                ],
            },
        },
    } as unknown as Record<string, unknown>;

    const DISTRIBUTOR_FACETS_SOURCE_NO_CHICKEN_PROTEIN = {
        central_pet: {
            title: 'Premium Dog Food Recipe 30 lb',
            extracted: {
                core: {
                    name: 'Premium Dog Food Recipe 30 lb',
                    brand_name: 'Premium Pet',
                },
                facets: [
                    { definition_slug: 'primary_protein', value: 'Salmon' },
                    { definition_slug: 'animal_type', value: 'Dog' },
                ],
            },
        },
    } as unknown as Record<string, unknown>;

    it('prefers structured distributor facet values over regex from product name', () => {
        // Product name contains 'Chicken' which would match regex primary_protein
        // But distributor source provides 'Salmon' via extracted.facets
        const result = enrichProductDetails(
            makeInput(
                {
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Premium Dog Food Chicken Recipe 30 lb.',
                },
                DISTRIBUTOR_FACETS_SOURCE,
            ),
        );
        // Structured source provides primary_protein=Salmon; regex would match Chicken
        expect(result.fields.primary_protein).toBe('Salmon');
        expect(result.populatedFields).toContain('primary_protein');

        // Structured source provides breed_size despite name not mentioning it
        expect(result.fields.breed_size).toBe('Large Breed');
        expect(result.populatedFields).toContain('breed_size');

        // Structured source provides food_form
        expect(result.fields.food_form).toBe('Dry');
        expect(result.populatedFields).toContain('food_form');

        // Structured source provides diet_type
        expect(result.fields.diet_type).toBe('Grain-Free');
        expect(result.populatedFields).toContain('diet_type');

        // animal_type is in both (source + regex), source wins
        expect(result.fields.animal_type).toContain('Dog');
        expect(result.populatedFields).toContain('animal_type');
    });

    it('preserves package_count and package_weight from source facets', () => {
        const result = enrichProductDetails(
            makeInput(
                {
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Premium Dog Food Salmon Recipe 30 lb.',
                },
                DISTRIBUTOR_FACETS_SOURCE,
            ),
        );
        // package_count and package_weight have NO regex fallback;
        // they must come exclusively from source facets
        expect(result.fields.package_count).toBe('1');
        expect(result.populatedFields).toContain('package_count');

        expect(result.fields.package_weight).toBe('30 lb');
        expect(result.populatedFields).toContain('package_weight');
    });

    it('prefers primary_protein from distributor facets over regex-extracted protein from name/description', () => {
        // Name and description mention 'Chicken' which regex would match
        // But distributor source explicitly provides 'Salmon' via extracted.facets
        const result = enrichProductDetails(
            makeInput(
                {
                    category: 'Dog > Dog Food > Dry Food',
                    name: 'Premium Dog Food with Real Chicken Recipe for Dogs',
                    description: 'Made with real deboned chicken and wholesome grains',
                },
                DISTRIBUTOR_FACETS_SOURCE_NO_CHICKEN_PROTEIN,
            ),
        );
        // The regex would match 'Chicken', but the structured source value wins
        expect(result.fields.primary_protein).toBe('Salmon');
        expect(result.populatedFields).toContain('primary_protein');
    });

    describe('suspicious package count filtering', () => {
        const SUSPICIOUS_SOURCES = {
            central_pet: {
                title: 'Dog Food',
                extracted: {
                    core: { name: 'Dog Food' },
                    facets: [
                        { definition_slug: 'package_count', value: '48' }
                    ]
                }
            }
        } as unknown as Record<string, unknown>;

        const VALID_MULTI_PACK_SOURCES = {
            central_pet: {
                title: 'Dog Food 12 pk',
                extracted: {
                    core: { name: 'Dog Food 12 pk' },
                    facets: [
                        { definition_slug: 'package_count', value: '12' }
                    ]
                }
            }
        } as unknown as Record<string, unknown>;

        it('filters out package_count: 48 if name does not suggest a multi-pack', () => {
            const result = enrichProductDetails(
                makeInput(
                    {
                        category: 'Dog > Dog Food > Dry Food',
                        name: 'Dog Food',
                    },
                    SUSPICIOUS_SOURCES,
                ),
            );
            expect(result.fields).not.toHaveProperty('package_count');
        });

        it('preserves package_count: 12 if name suggests a 12 pk', () => {
            const result = enrichProductDetails(
                makeInput(
                    {
                        category: 'Dog > Dog Food > Dry Food',
                        name: 'Dog Food 12 pk',
                    },
                    VALID_MULTI_PACK_SOURCES,
                ),
            );
            expect(result.fields.package_count).toBe('12');
        });
    });
});