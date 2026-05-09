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
