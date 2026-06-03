/**
 * Category Facet Profile Classifier
 *
 * Classifies consolidated products into facet profiles based on their assigned
 * category, then determines which product detail fields are applicable for each
 * profile. This avoids wasting context on fields that don't apply to a given
 * product type (e.g., "flavor" on a garden hose).
 *
 * Replaces the old 5-domain system (pet_food, pet_product, garden, hardware,
 * general) with 15 finer-grained facet profiles.
 */

// =============================================================================
// Facet Profile Types
// =============================================================================

/**
 * Product facet profile classification.
 * Determines which detail fields are applicable during post-consolidation enrichment.
 */
export type FacetProfile =
    | 'animal_food'
    | 'animal_treats_chews'
    | 'animal_feed_farm'
    | 'animal_health_wellness'
    | 'animal_toys_enrichment'
    | 'animal_habitat_containment'
    | 'animal_litter_bedding'
    | 'grooming_cleaning'
    | 'aquarium_equipment'
    | 'reptile_equipment'
    | 'garden_consumable'
    | 'garden_equipment'
    | 'home_heating'
    | 'hardware_tools'
    | 'general';

/**
 * Product detail fields that can be populated during enrichment.
 * These map directly to canonical facet definitions in facet_definitions table.
 */
export type DetailField =
    // Existing fields (kept for backwards compatibility)
    | 'pet_type'
    | 'life_stage'
    | 'pet_size'
    | 'special_diet'
    | 'health_feature'
    | 'food_form'
    | 'flavor'
    | 'product_feature'
    | 'size'
    | 'color'
    | 'packaging_type'
    // New canonical fields
    | 'animal_type'
    | 'breed_size'
    | 'primary_protein'
    | 'diet_type'
    | 'health_focus'
    | 'claims'
    | 'treat_type'
    | 'chew_duration'
    | 'texture'
    | 'rawhide_free'
    | 'functional_benefit'
    | 'litter_material'
    | 'clumping'
    | 'dust_level'
    | 'tracking_control'
    | 'absorbency'
    | 'toy_type'
    | 'play_style'
    | 'durability'
    | 'has_squeaker'
    | 'garden_product_type'
    | 'coverage_area'
    | 'season'
    | 'organic'
    | 'target_pest'
    | 'target_weed'
    | 'grass_type'
    | 'npk_ratio'
    | 'application_method'
    | 'active_ingredient'
    | 'target_condition'
    | 'feed_type'
    | 'protein_percentage'
    | 'fat_percentage'
    | 'fuel_type'
    | 'btu'
    | 'tank_size'
    | 'wattage'
    | 'media_type'
    | 'water_type'
    | 'bulb_type'
    | 'uvb_strength'
    | 'capacity'
    | 'compatibility'
    | 'coat_type'
    | 'formula'
    | 'use_case'
    // Universal facets used by multiple profiles
    | 'package_weight'
    | 'package_count'
    | 'material'
    | 'scent'
    | 'dimensions'
    | 'indoor_outdoor'
    | 'subscription_eligible';

// =============================================================================
// Facet Profile Applicability Matrix
// =============================================================================

/**
 * Maps each facet profile to the set of detail fields that are meaningful
 * for products in that profile.
 */
export const FACET_PROFILE_APPLICABLE_FIELDS: Record<FacetProfile, readonly DetailField[]> = {
    // =====================================================================
    // Animal Food (dog food, cat food, bird food, fish food, small pet food)
    // =====================================================================
    animal_food: [
        'animal_type',
        'life_stage',
        'breed_size',
        'food_form',
        'primary_protein',
        'diet_type',
        'flavor',
        'health_focus',
        'claims',
        'size',
        'package_weight',
        'package_count',
        'packaging_type',
        'product_feature',
        'color',
    ],

    // =====================================================================
    // Animal Treats & Chews
    // =====================================================================
    animal_treats_chews: [
        'animal_type',
        'life_stage',
        'breed_size',
        'flavor',
        'treat_type',
        'chew_duration',
        'texture',
        'rawhide_free',
        'functional_benefit',
        'claims',
        'size',
        'package_weight',
        'packaging_type',
        'color',
    ],

    // =====================================================================
    // Farm/Equine Feed (chicken feed, horse feed, livestock feed, hay)
    // =====================================================================
    animal_feed_farm: [
        'animal_type',
        'life_stage',
        'food_form',
        'feed_type',
        'protein_percentage',
        'fat_percentage',
        'flavor',
        'claims',
        'size',
        'package_weight',
        'packaging_type',
    ],

    // =====================================================================
    // Animal Health & Wellness (supplements, flea/tick, dewormers, first aid)
    // =====================================================================
    animal_health_wellness: [
        'animal_type',
        'life_stage',
        'breed_size',
        'active_ingredient',
        'target_condition',
        'application_method',
        'flavor',
        'size',
        'package_weight',
        'packaging_type',
        'claims',
        'product_feature',
    ],

    // =====================================================================
    // Animal Toys & Enrichment
    // =====================================================================
    animal_toys_enrichment: [
        'animal_type',
        'toy_type',
        'play_style',
        'durability',
        'has_squeaker',
        'material',
        'size',
        'color',
        'product_feature',
    ],

    // =====================================================================
    // Animal Habitat & Containment (crates, cages, coops, tanks, terrariums)
    // =====================================================================
    animal_habitat_containment: [
        'animal_type',
        'size',
        'dimensions',
        'material',
        'capacity',
        'color',
        'product_feature',
    ],

    // =====================================================================
    // Animal Litter & Bedding (cat litter, small pet bedding, coop bedding, substrate)
    // =====================================================================
    animal_litter_bedding: [
        'animal_type',
        'litter_material',
        'clumping',
        'scent',
        'dust_level',
        'tracking_control',
        'absorbency',
        'size',
        'package_weight',
        'packaging_type',
    ],

    // =====================================================================
    // Grooming & Cleaning (shampoos, brushes, stain removers, potty cleanup)
    // =====================================================================
    grooming_cleaning: [
        'animal_type',
        'coat_type',
        'formula',
        'use_case',
        'scent',
        'size',
        'color',
        'packaging_type',
        'product_feature',
    ],

    // =====================================================================
    // Aquarium Equipment (filters, heaters, pumps, lights, water care)
    // =====================================================================
    aquarium_equipment: [
        'tank_size',
        'wattage',
        'media_type',
        'water_type',
        'size',
        'dimensions',
        'color',
        'product_feature',
    ],

    // =====================================================================
    // Reptile Equipment (UVB bulbs, heat lamps, substrate, habitats)
    // =====================================================================
    reptile_equipment: [
        'animal_type',
        'bulb_type',
        'uvb_strength',
        'wattage',
        'size',
        'dimensions',
        'product_feature',
    ],

    // =====================================================================
    // Garden Consumable (soil, seed, fertilizer, pest control, mulch)
    // =====================================================================
    garden_consumable: [
        'garden_product_type',
        'coverage_area',
        'season',
        'organic',
        'target_pest',
        'target_weed',
        'grass_type',
        'npk_ratio',
        'application_method',
        'size',
        'package_weight',
        'product_feature',
    ],

    // =====================================================================
    // Garden Equipment (tools, hoses, spreaders, watering)
    // =====================================================================
    garden_equipment: [
        'garden_product_type',
        'material',
        'size',
        'dimensions',
        'color',
        'capacity',
        'product_feature',
    ],

    // =====================================================================
    // Home & Heating (fuel, pellets, coal, stove supplies)
    // =====================================================================
    home_heating: [
        'fuel_type',
        'btu',
        'size',
        'package_weight',
        'dimensions',
        'product_feature',
    ],

    // =====================================================================
    // Hardware & Tools (hand tools, hardware, electrical, plumbing)
    // =====================================================================
    hardware_tools: [
        'material',
        'size',
        'dimensions',
        'color',
        'capacity',
        'compatibility',
        'product_feature',
    ],

    // =====================================================================
    // General fallback — only universal attributes
    // =====================================================================
    general: [
        'product_feature',
        'size',
        'color',
        'packaging_type',
        'material',
        'dimensions',
    ],
} as const;

// =============================================================================
// Valid Profile Enum
// =============================================================================

const VALID_FACET_PROFILES: ReadonlySet<string> = new Set<FacetProfile>([
    'animal_food',
    'animal_treats_chews',
    'animal_feed_farm',
    'animal_health_wellness',
    'animal_toys_enrichment',
    'animal_habitat_containment',
    'animal_litter_bedding',
    'grooming_cleaning',
    'aquarium_equipment',
    'reptile_equipment',
    'garden_consumable',
    'garden_equipment',
    'home_heating',
    'hardware_tools',
    'general',
]);

function isValidFacetProfile(value: string): value is FacetProfile {
    return VALID_FACET_PROFILES.has(value);
}

// =============================================================================
// Profile Classification Patterns
// =============================================================================

/**
 * Breadcrumb segment patterns mapped to facet profiles.
 * Ordered by specificity — first match wins.
 */
interface ProfileRule {
    profile: FacetProfile;
    /** Test the full breadcrumb (lowercased) */
    test: (breadcrumb: string, segments: string[], department: string, l2: string) => boolean;
}

const PROFILE_RULES: ProfileRule[] = [
    // ---- L2-driven rules (most specific) ----

    // Animal Food: L2 contains "Food" but not treat words
    {
        profile: 'animal_food',
        test: (_bc, _segments, department, l2) => {
            const l2l = l2.toLowerCase();
            const hasFoodWords = /\b(food|diet|formula|recipe|kibble)\b/i.test(l2l);
            const isTreatWord = /\b(treats?|chews?|biscuits?|snacks?|rawhide)\b/i.test(l2l);
            if (hasFoodWords && !isTreatWord) {
                // Farm feed departments get their own profile
                if (/(horse|chicken|poultry|livestock|farm)\b/i.test(department)) {
                    return false; // handled by animal_feed_farm below
                }
                return true;
            }
            return false;
        },
    },

    // Animal Treats & Chews
    {
        profile: 'animal_treats_chews',
        test: (_bc, _segments, department, l2) => {
            const l2l = l2.toLowerCase();
            const isTreat = /\b(treats?|chews?|biscuits?|snacks?|rawhide|jerky|bully sticks?)\b/i.test(l2l);
            if (isTreat) {
                if (/(horse|chicken|poultry|livestock|farm)\b/i.test(department)) {
                    return false; // handled by animal_feed_farm
                }
                return true;
            }
            return false;
        },
    },

    // Animal Health & Wellness
    {
        profile: 'animal_health_wellness',
        test: (_bc, _segments, _department, l2) => {
            const l2l = l2.toLowerCase();
            return /\b(health|wellness|flea|tick|supplement|vitamin|first aid|dewormer|wound care|hoof care|calming|joint|digestive|urinary)\b/i.test(l2l);
        },
    },

    // Animal Toys & Enrichment
    {
        profile: 'animal_toys_enrichment',
        test: (_bc, _segments, _department, l2) => {
            const l2l = l2.toLowerCase();
            return /\b(toy|toys|enrichment|play)\b/i.test(l2l);
        },
    },

    // Animal Habitat & Containment
    {
        profile: 'animal_habitat_containment',
        test: (_bc, _segments, _department, l2) => {
            const l2l = l2.toLowerCase();
            return /\b(crate|crates|cage|cages|kennel|kennels|coop|coops|run|runs|pen|pens|gate|gates|terrarium|terrariums|habitat|habitats|hutch|hutches|playpen|playpens)\b/i.test(l2l);
        },
    },

    // Animal Litter & Bedding
    {
        profile: 'animal_litter_bedding',
        test: (_bc, _segments, _department, l2) => {
            const l2l = l2.toLowerCase();
            return /\b(litter|bedding|substrate|straw|shavings|litter box|litter boxes)\b/i.test(l2l);
        },
    },

    // Grooming & Cleaning
    {
        profile: 'grooming_cleaning',
        test: (_bc, _segments, _department, l2) => {
            const l2l = l2.toLowerCase();
            return /\b(groom|grooming|cleaning|cleanup|potty|waste|stain|odor|deodorizer|poop|bath|shampoo)\b/i.test(l2l);
        },
    },

    // Garden Consumable (L2 garden consumables)
    {
        profile: 'garden_consumable',
        test: (_bc, _segments, department, l2) => {
            if (!/(lawn|garden)\b/i.test(department)) return false;
            const l2l = l2.toLowerCase();
            return /\b(soil|mulch|compost|seed|fertilizer|pest|weed|grass seed|plant|bulb|garden seed)\b/i.test(l2l);
        },
    },

    // Garden Equipment (L2 garden equipment)
    {
        profile: 'garden_equipment',
        test: (_bc, _segments, department, l2) => {
            if (!/(lawn|garden)\b/i.test(department)) return false;
            const l2l = l2.toLowerCase();
            return /\b(tool|hose|sprinkler|sprayer|spreader|watering|planter|pot)\b/i.test(l2l);
        },
    },

    // Hay / Forage (under Small Pet)
    {
        profile: 'animal_feed_farm',
        test: (_bc, _segments, department, l2) => {
            if (!/(small pet)\b/i.test(department)) return false;
            const l2l = l2.toLowerCase();
            return /\b(hay|forage)\b/i.test(l2l);
        },
    },

    // ---- L1-driven rules (department-level) ----

    // Aquarium Equipment — department match for non-food
    {
        profile: 'aquarium_equipment',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            if (!/(fish|aquarium)\b/i.test(dep)) return false;
            // Fish Food -> animal_food, not aquarium_equipment
            return !/\bfood\b/i.test(dep) && !segments.some(s => /\bfood\b/i.test(s));
        },
    },

    // Fish Food (department-level shortcut for single-segment)
    {
        profile: 'animal_food',
        test: (breadcrumb, _segments, _department, _l2) => {
            const bc = breadcrumb.toLowerCase();
            return /\bfish\b.*\bfood\b/i.test(bc) || /\baquarium\b.*\bfood\b/i.test(bc) || /\bpond\b.*\bfood\b/i.test(bc);
        },
    },

    // Reptile Equipment — department match for non-food
    {
        profile: 'reptile_equipment',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            if (!/(reptile|amphibian)\b/i.test(dep)) return false;
            return !segments.some(s => /\bfood\b/i.test(s));
        },
    },

    // Reptile Food
    {
        profile: 'animal_food',
        test: (breadcrumb, _segments, _department, _l2) => {
            return /reptile.*\bfood\b/i.test(breadcrumb);
        },
    },

    // Dog/Cat/Bird/Small Pet Food shortcut
    {
        profile: 'animal_food',
        test: (breadcrumb, _segments, _department, _l2) => {
            const bc = breadcrumb.toLowerCase();
            return (
                /\b(dog|cat|bird|small pet)\b.*\b(food|kibble|diet|recipe|formula)\b/i.test(bc) &&
                !/\b(treat|treats|chew|chews|biscuit|biscuits|snack|snacks|rawhide)\b/i.test(bc)
            );
        },
    },

    // Dog/Cat/Bird/Small Pet Treats & Chews shortcut
    {
        profile: 'animal_treats_chews',
        test: (breadcrumb, _segments, _department, _l2) => {
            const bc = breadcrumb.toLowerCase();
            return /\b(dog|cat|bird|small pet)\b.*\b(treat|treats|chew|chews|biscuit|biscuits|snack|snacks|rawhide|jerky|bully stick|bully sticks)\b/i.test(bc);
        },
    },


    // Farm & Livestock (by department)
    {
        profile: 'animal_feed_farm',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            return /\b(chicken|poultry|horse|farm|livestock)\b/i.test(dep);
        },
    },

    // Wild Bird & Wildlife -> general (or bird food)
    {
        profile: 'general',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            return /\bwild bird\b/i.test(dep);
        },
    },

    // Pet Bird (non-wild)
    {
        profile: 'general',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            return /\bpet bird\b/i.test(dep);
        },
    },

    // Home & Heating
    {
        profile: 'home_heating',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            return /\b(home|heating)\b/i.test(dep);
        },
    },

    // Tools & Hardware
    {
        profile: 'hardware_tools',
        test: (_bc, segments, _department, _l2) => {
            const dep = segments[0]?.toLowerCase() || '';
            return /\b(tools?|hardware)\b/i.test(dep);
        },
    },

    // Farm Animal remnant (legacy breadcrumb)
    {
        profile: 'animal_feed_farm',
        test: (breadcrumb, _segments, _department, _l2) => {
            return /\bfarm animal\b/i.test(breadcrumb);
        },
    },
];

// =============================================================================
// Facet Profile Resolution
// =============================================================================

/**
 * Resolve a product's facet profile based on its assigned category breadcrumb
 * and/or an explicit profile from the database.
 *
 * Priority:
 * 1. explicitFacetProfile (if provided and valid)
 * 2. Profile pattern matching against breadcrumb segments
 * 3. Fallback to 'general'
 *
 * @param category - The category breadcrumb (e.g. "Dog > Food > Dry Food")
 * @param explicitFacetProfile - Optional explicit profile from DB facet_profile column
 * @returns The resolved facet profile
 */
export function resolveFacetProfile(
    category: string | null | undefined,
    explicitFacetProfile?: string | null,
): FacetProfile {
    // Prioritize explicit profile from DB
    if (explicitFacetProfile && isValidFacetProfile(explicitFacetProfile)) {
        return explicitFacetProfile;
    }

    if (!category || typeof category !== 'string') {
        return 'general';
    }

    const normalized = category.trim();
    if (normalized.length === 0) {
        return 'general';
    }

    const segments = normalized.split(/\s*(?:>|\|)\s*/).map((s) => s.trim()).filter(Boolean);
    const department = segments[0]?.toLowerCase() || '';
    const l2 = segments.length > 1 ? segments[1] : '';

    // Evaluate rules in priority order
    for (const rule of PROFILE_RULES) {
        if (rule.test(normalized, segments, department, l2)) {
            return rule.profile;
        }
    }

    return 'general';
}

/**
 * Check whether a specific detail field is applicable for a given facet profile.
 */
export function isFieldApplicable(profile: FacetProfile, field: DetailField): boolean {
    return FACET_PROFILE_APPLICABLE_FIELDS[profile].includes(field);
}

/**
 * Get the set of applicable detail fields for a given category.
 * Convenience wrapper that resolves the profile and returns the field list.
 *
 * @param category - The category breadcrumb to classify
 * @param explicitFacetProfile - Optional explicit profile override from DB
 * @returns The list of applicable detail fields
 */
export function getApplicableFields(
    category: string | null | undefined,
    explicitFacetProfile?: string | null,
): readonly DetailField[] {
    const profile = resolveFacetProfile(category, explicitFacetProfile);
    return FACET_PROFILE_APPLICABLE_FIELDS[profile];
}


