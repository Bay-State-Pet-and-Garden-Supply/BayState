import { describe, it, expect } from '@jest/globals';
import {
    resolveFacetProfile,
    isFieldApplicable,
    getApplicableFields,
    FACET_PROFILE_APPLICABLE_FIELDS,
} from '../category-domain';

describe('resolveFacetProfile', () => {
    describe('animal_food classification', () => {
        it.each([
            'Dog > Food > Dry Food',
            'Cat > Food > Wet Food',
            'Pet Bird > Food > Parrot Food',
            'Fish & Aquarium > Fish Food',
        ])('classifies "%s" as animal_food', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_food');
        });
    });

    describe('animal_treats_chews classification', () => {
        it.each([
            'Dog > Treats & Chews > Biscuits',
            'Cat > Treats > Soft Treats',
        ])('classifies "%s" as animal_treats_chews', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_treats_chews');
        });
    });

    describe('animal_feed_farm classification', () => {
        it.each([
            'Farm & Livestock > Feed > Cattle Feed',
            'Farm & Livestock > Feed > Goat Feed',
            'Horse > Feed > Complete Feed',
            'Chicken & Poultry > Feed > Layer Feed',
        ])('classifies "%s" as animal_feed_farm', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_feed_farm');
        });
    });

    describe('animal_health_wellness classification', () => {
        it.each([
            'Dog > Health & Wellness > Supplements',
            'Dog > Flea & Tick > Topicals',
            'Cat > Health & Wellness > Hairball',
            'Horse > Health & Supplements > Joint',
            'Chicken & Poultry > Health & Supplements',
            'Farm & Livestock > Health & First Aid',
        ])('classifies "%s" as animal_health_wellness', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_health_wellness');
        });
    });

    describe('animal_toys_enrichment classification', () => {
        it.each([
            'Dog > Toys > Plush',
            'Cat > Toys > Interactive',
            'Small Pet > Toys & Enrichment',
            'Pet Bird > Toys > Chew Toys',
        ])('classifies "%s" as animal_toys_enrichment', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_toys_enrichment');
        });
    });

    describe('animal_habitat_containment classification', () => {
        it.each([
            'Dog > Crates, Kennels & Gates > Crates',
            'Small Pet > Cages & Habitats',
            'Chicken & Poultry > Coops & Runs',
            'Reptile & Amphibian > Tanks & Terrariums',
        ])('classifies "%s" as animal_habitat_containment', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_habitat_containment');
        });
    });

    describe('animal_litter_bedding classification', () => {
        it.each([
            'Cat > Litter > Clumping',
            'Small Pet > Bedding & Litter',
            'Chicken & Poultry > Bedding',
            'Reptile & Amphibian > Substrate & Bedding',
        ])('classifies "%s" as animal_litter_bedding', (category) => {
            expect(resolveFacetProfile(category)).toBe('animal_litter_bedding');
        });
    });

    describe('grooming_cleaning classification', () => {
        it.each([
            'Dog > Grooming > Shampoo',
            'Dog > Cleaning & Potty > Pee Pads',
            'Cat > Grooming > Brushes',
            'Horse > Grooming > Brushes',
        ])('classifies "%s" as grooming_cleaning', (category) => {
            expect(resolveFacetProfile(category)).toBe('grooming_cleaning');
        });
    });

    describe('aquarium_equipment classification', () => {
        it.each([
            'Fish & Aquarium > Filters & Media',
            'Fish & Aquarium > Pumps & Air',
            'Fish & Aquarium > Heating & Lighting',
            'Fish & Aquarium > Water Care',
            'Fish & Aquarium > Aquariums & Tanks',
        ])('classifies "%s" as aquarium_equipment', (category) => {
            expect(resolveFacetProfile(category)).toBe('aquarium_equipment');
        });
    });

    describe('reptile_equipment classification', () => {
        it.each([
            'Reptile & Amphibian > Heating & Lighting',
            'Reptile & Amphibian > Humidity & Water',
        ])('classifies "%s" as reptile_equipment', (category) => {
            expect(resolveFacetProfile(category)).toBe('reptile_equipment');
        });
    });

    describe('garden_consumable classification', () => {
        it.each([
            'Lawn & Garden > Soil, Mulch & Compost',
            'Lawn & Garden > Fertilizer',
            'Lawn & Garden > Weed & Pest Control',
            'Lawn & Garden > Grass Seed',
        ])('classifies "%s" as garden_consumable', (category) => {
            expect(resolveFacetProfile(category)).toBe('garden_consumable');
        });
    });

    describe('garden_equipment classification', () => {
        it.each([
            'Lawn & Garden > Watering',
        ])('classifies "%s" as garden_equipment', (category) => {
            expect(resolveFacetProfile(category)).toBe('garden_equipment');
        });
    });

    describe('general fallback classification', () => {
        it.each([
            'Lawn & Garden > Planters & Supplies',
            'Lawn & Garden > Sprayers & Spreaders',
            'Lawn & Garden > Garden Tools',
            'Cat > Trees, Scratchers & Furniture > Trees',
        ])('classifies "%s" as general', (category) => {
            expect(resolveFacetProfile(category)).toBe('general');
        });
    });

    describe('home_heating classification', () => {
        it.each([
            'Home & Heating > Heating Fuel',
            'Home & Heating > Stove & Fireplace',
        ])('classifies "%s" as home_heating', (category) => {
            expect(resolveFacetProfile(category)).toBe('home_heating');
        });
    });

    describe('hardware_tools classification', () => {
        it.each([
            'Tools & Hardware > Tools',
            'Tools & Hardware > Hardware',
            'Tools & Hardware > Electrical',
        ])('classifies "%s" as hardware_tools', (category) => {
            expect(resolveFacetProfile(category)).toBe('hardware_tools');
        });
    });

    describe('general classification', () => {
        it.each([
            'Seasonal',
            'Gift Cards',
            'Unknown Category',
            '',
        ])('classifies "%s" as general', (category) => {
            expect(resolveFacetProfile(category)).toBe('general');
        });

        it('handles null/undefined', () => {
            expect(resolveFacetProfile(null)).toBe('general');
            expect(resolveFacetProfile(undefined)).toBe('general');
        });
    });

    describe('explicitFacetProfile override', () => {
        it('uses explicit profile when provided', () => {
            // Should return the explicit profile regardless of category
            expect(resolveFacetProfile('Dog > Toys', 'animal_treats_chews')).toBe('animal_treats_chews');
        });

        it('falls back to classified profile when explicit is null', () => {
            expect(resolveFacetProfile('Dog > Food', null)).toBe('animal_food');
        });
    });
});

describe('FACET_PROFILE_APPLICABLE_FIELDS', () => {
    it('animal_food includes food-specific fields', () => {
        const fields = FACET_PROFILE_APPLICABLE_FIELDS.animal_food;
        expect(fields).toContain('flavor');
        expect(fields).toContain('food_form');
        expect(fields).toContain('primary_protein');
        expect(fields).toContain('diet_type');
        expect(fields).toContain('health_focus');
        expect(fields).toContain('animal_type');
        expect(fields).toContain('life_stage');
        expect(fields).toContain('breed_size');
    });

    it('hardware_tools excludes all animal-specific fields', () => {
        const fields = FACET_PROFILE_APPLICABLE_FIELDS.hardware_tools;
        expect(fields).not.toContain('animal_type');
        expect(fields).not.toContain('life_stage');
        expect(fields).not.toContain('breed_size');
        expect(fields).not.toContain('flavor');
        expect(fields).not.toContain('food_form');
        expect(fields).not.toContain('diet_type');
        expect(fields).not.toContain('health_focus');
        // Universal fields should be present
        expect(fields).toContain('size');
        expect(fields).toContain('color');
        expect(fields).toContain('material');
        expect(fields).toContain('product_feature');
    });

    it('garden profiles exclude pet-specific fields', () => {
        for (const profile of ['garden_consumable', 'garden_equipment'] as const) {
            const fields = FACET_PROFILE_APPLICABLE_FIELDS[profile];
            expect(fields).not.toContain('animal_type');
            expect(fields).not.toContain('life_stage');
            expect(fields).not.toContain('flavor');
            expect(fields).not.toContain('food_form');
            expect(fields).toContain('size');
        }
        // color is only in garden_equipment, not garden_consumable
        expect(FACET_PROFILE_APPLICABLE_FIELDS['garden_equipment']).toContain('color');
    });
});

describe('isFieldApplicable', () => {
    it('returns true for applicable fields', () => {
        expect(isFieldApplicable('animal_food', 'flavor')).toBe(true);
        expect(isFieldApplicable('animal_food', 'food_form')).toBe(true);
        expect(isFieldApplicable('animal_health_wellness', 'active_ingredient')).toBe(true);
        expect(isFieldApplicable('animal_litter_bedding', 'clumping')).toBe(true);
        expect(isFieldApplicable('garden_consumable', 'npk_ratio')).toBe(true);
        expect(isFieldApplicable('hardware_tools', 'size')).toBe(true);
    });

    it('returns false for inapplicable fields', () => {
        expect(isFieldApplicable('garden_consumable', 'flavor')).toBe(false);
        expect(isFieldApplicable('hardware_tools', 'animal_type')).toBe(false);
        expect(isFieldApplicable('general', 'food_form')).toBe(false);
        expect(isFieldApplicable('aquarium_equipment', 'clumping')).toBe(false);
    });
});

describe('getApplicableFields', () => {
    it('returns animal_food fields for dog food category', () => {
        const fields = getApplicableFields('Dog > Food > Dry Food');
        expect(fields).toContain('flavor');
        expect(fields).toContain('food_form');
        expect(fields).toContain('animal_type');
    });

    it('uses explicitFacetProfile override when provided', () => {
        const fields = getApplicableFields('Seasonal', 'garden_consumable');
        expect(fields).toContain('npk_ratio');
        expect(fields).toContain('organic');
        expect(fields).not.toContain('flavor');
    });

    it('returns general fields for null category', () => {
        const fields = getApplicableFields(null);
        expect(fields).toContain('size');
        expect(fields).not.toContain('flavor');
    });
});
