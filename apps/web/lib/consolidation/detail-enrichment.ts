/**
 * Detail Enrichment
 *
 * Post-consolidation deterministic enrichment of product detail fields.
 * Runs AFTER the LLM consolidation pass assigns a category, then uses
 * the facet profile to determine which fields are applicable and
 * extracts values from structured source data and product name/description
 * using pattern matching.
 *
 * This approach avoids a second LLM call — the enrichment is free and fast.
 * Any gaps left by deterministic extraction are surfaced in the Finalizing
 * UI where the copilot can fill them interactively.
 */

import { normalizeProductSources } from '@/lib/product-sources';
import {
    resolveFacetProfile,
    isFieldApplicable,
    FACET_PROFILE_APPLICABLE_FIELDS,
    type DetailField,
    type FacetProfile,
} from './category-domain';

// =============================================================================
// Types
// =============================================================================

export interface EnrichmentInput {
    /** Core consolidated fields (name, brand, category, description, etc.) */
    consolidated: Record<string, unknown>;
    /** Raw source data keyed by source name */
    sources: Record<string, unknown>;
    /** The raw input record from products_ingestion */
    input: Record<string, unknown>;
}

export interface EnrichmentResult {
    /** The enriched fields to merge into consolidated */
    fields: Record<string, string>;
    /** The facet profile classification */
    facetProfile: FacetProfile;
    /** @deprecated Use facetProfile instead */
    domain: FacetProfile;
    /** Which fields were populated by enrichment */
    populatedFields: string[];
    /** Which applicable fields could not be populated */
    missingFields: string[];
}

// =============================================================================
// Pattern Definitions — Existing
// =============================================================================

const PET_TYPE_PATTERNS: Record<string, RegExp> = {
    'Dog': /\b(dog|dogs?|puppy|puppies|canine|k9|k-9|pup|canis)\b/i,
    'Cat': /\b(cat|cats?|kitten|kittens|feline|kitty|felis)\b/i,
    'Bird': /\b(bird|birds?|parrot|parakeet|cockatiel|finch|avian|budgie|cockatoo|macaw|lovebird|poultry)\b/i,
    'Fish': /\b(fish|fishes|aquarium|aquatic|pond|koi|goldfish|betta|tropical fish|freshwater|saltwater|marine)\b/i,
    'Reptile': /\b(reptile|reptiles?|snake|snakes?|lizard|lizards?|turtle|turtles?|tortoise|gecko|bearded dragon|iguana|herp)\b/i,
    'Small Animal': /\b(rabbit|rabbits?|hamster|hamsters?|guinea pig|gerbil|ferret|ferrets?|small animal|chinchilla|mouse|mice|rat|rats?|rodent)\b/i,
    'Horse': /\b(horse|horses?|equine|pony|ponies|mare|stallion|foal|equestrian|colt|filly)\b/i,
    'Livestock': /\b(chicken|chickens?|poultry|goat|goats?|sheep|cattle|cow|cows?|pig|pigs?|livestock|farm animal|duck|ducks?|turkey|turkeys?|swine|bovine|ovine)\b/i,
};

const LIFE_STAGE_PATTERNS: Record<string, RegExp> = {
    'Puppy': /\b(puppy|puppies|kitten|kittens|baby|junior|starter|young|growth)\b/i,
    'Adult': /\b(adult|maintenance)\b/i,
    'Senior': /\b(senior|mature|older|aging|7\+|11\+|geriatric)\b/i,
    'All Life Stages': /\b(all (life )?stages?|all ages?)\b/i,
};

const PET_SIZE_PATTERNS: Record<string, RegExp> = {
    'Small Breed': /\b(small breed|toy breed|small dog|mini|miniature|under 20\s*lb|5-20\s*lb|teacup)\b/i,
    'Medium Breed': /\b(medium breed|medium dog|20-50\s*lb|mid-size)\b/i,
    'Large Breed': /\b(large breed|large dog|50-100\s*lb|big dog)\b/i,
    'Giant Breed': /\b(giant breed|extra large|100\+\s*lb|xl breed|x-large)\b/i,
    'All Sizes': /\b(all (breed )?sizes?|any size)\b/i,
};

const FOOD_FORM_PATTERNS: Record<string, RegExp> = {
    'Dry': /\b(dry|kibble|crunchy)\b/i,
    'Wet': /\b(wet|canned|pate|paté|loaf|stew|gravy|broth|in sauce)\b/i,
    'Raw': /\b(raw|frozen raw|raw frozen)\b/i,
    'Freeze-Dried': /\b(freeze[- ]?dried|lyophilized)\b/i,
    'Dehydrated': /\b(dehydrated|air[- ]?dried)\b/i,
    'Semi-Moist': /\b(semi[- ]?moist|soft[- ]?dry|chewy)\b/i,
    'Topper': /\b(topper|mix[- ]?in|mixer)\b/i,
    'Supplement': /\b(supplement|vitamin|probiotic|digestive aid)\b/i,
};

const SPECIAL_DIET_PATTERNS: Record<string, RegExp> = {
    'Grain-Free': /\b(grain[- ]?free|no grain)\b/i,
    'Limited Ingredient': /\b(limited ingredient|simple recipe|single protein)\b/i,
    'High-Protein': /\b(high[- ]?protein|protein[- ]?rich)\b/i,
    'Weight Management': /\b(weight (management|control)|healthy weight|low calorie|lite|light|diet)\b/i,
    'Sensitive Stomach': /\b(sensitive stomach|digestive|easy digest|gentle formula)\b/i,
    'Natural': /\b(natural|wholesome|no artificial)\b/i,
    'Organic': /\b(organic|usda organic)\b/i,
    'Gluten-Free': /\b(gluten[- ]?free)\b/i,
};

const HEALTH_FEATURE_PATTERNS: Record<string, RegExp> = {
    'Joint Support': /\b(joint|hip|glucosamine|chondroitin|mobility|arthritis)\b/i,
    'Skin & Coat': /\b(skin|coat|fur|omega|shiny coat|derma)\b/i,
    'Dental Care': /\b(dental|teeth|oral care|tartar|plaque)\b/i,
    'Digestive Health': /\b(digestive|probiotic|prebiotic|fiber|gut health)\b/i,
    'Immune Support': /\b(immune|immunity|antioxidant)\b/i,
    'Heart Health': /\b(heart|cardiac|taurine)\b/i,
    'Urinary Health': /\b(urinary|bladder|kidney)\b/i,
    'Calming': /\b(calming|anxiety|stress|relaxation)\b/i,
};

const FLAVOR_PATTERNS: Record<string, RegExp> = {
    'Chicken': /\b(chicken)\b/i,
    'Beef': /\b(beef|steak)\b/i,
    'Salmon': /\b(salmon)\b/i,
    'Turkey': /\b(turkey)\b/i,
    'Lamb': /\b(lamb)\b/i,
    'Duck': /\b(duck)\b/i,
    'Venison': /\b(venison|deer)\b/i,
    'Pork': /\b(pork)\b/i,
    'Fish': /\b(fish|whitefish|ocean fish|tuna|cod|trout|pollock)\b/i,
    'Rabbit': /\b(rabbit)\b/i,
    'Bison': /\b(bison|buffalo)\b/i,
    'Peanut Butter': /\b(peanut butter)\b/i,
};

const PACKAGING_TYPE_PATTERNS: Record<string, RegExp> = {
    'Bag': /\b(bag|pouch|sack)\b/i,
    'Can': /\b(can|canned|tin)\b/i,
    'Box': /\b(box|carton)\b/i,
    'Bottle': /\b(bottle|squeeze bottle|spray bottle)\b/i,
    'Tub': /\b(tub|bucket|pail|container)\b/i,
    'Tube': /\b(tube|squeeze tube)\b/i,
    'Jug': /\b(jug|gallon jug)\b/i,
};

// =============================================================================
// Pattern Definitions — New Enrichment Fields
// =============================================================================

/**
 * Protein-only flavor patterns (used for primary_protein).
 * Excludes non-protein flavors like Peanut Butter, Sweet Potato, Cheese.
 */
const PROTEIN_PATTERNS: Record<string, RegExp> = {
    'Chicken': /\b(chicken)\b/i,
    'Beef': /\b(beef|steak)\b/i,
    'Salmon': /\b(salmon)\b/i,
    'Turkey': /\b(turkey)\b/i,
    'Lamb': /\b(lamb)\b/i,
    'Duck': /\b(duck)\b/i,
    'Venison': /\b(venison|deer)\b/i,
    'Pork': /\b(pork)\b/i,
    'Fish': /\b(fish|whitefish|ocean fish|tuna|cod|trout|pollock)\b/i,
    'Rabbit': /\b(rabbit)\b/i,
    'Bison': /\b(bison|buffalo)\b/i,
    'Tuna': /\b(tuna)\b/i,
    'Whitefish': /\b(whitefish)\b/i,
    'Trout': /\b(trout)\b/i,
    'Cod': /\b(cod)\b/i,
    'Liver': /\b(liver)\b/i,
    'Seafood': /\b(seafood|shrimp|herring|sardine|anchovy)\b/i,
    'Mixed Protein': /\b(mixed protein|variety pack|assorted proteins)\b/i,
};

/** Claims (marketing labels like Natural, Organic, Non-GMO) */
const CLAIMS_PATTERNS: Record<string, RegExp> = {
    'Natural': /\b(natural|all natural|100% natural)\b/i,
    'Organic': /\b(organic|usda organic|certified organic)\b/i,
    'Non-GMO': /\b(non[- ]?gmo|non gmo|gmo[- ]?free)\b/i,
    'Made in USA': /\b(made in usa|usa made|american made|locally made)\b/i,
    'No Corn/Wheat/Soy': /\b(no corn|no wheat|no soy|corn[- ]?free|wheat[- ]?free|soy[- ]?free)\b/i,
    'Human-Grade': /\b(human[- ]?grade|human grade)\b/i,
    'Veterinarian Recommended': /\b(vet recommended|veterinarian recommended|vet approved)\b/i,
};

/** Treat types */
const TREAT_TYPE_PATTERNS: Record<string, RegExp> = {
    'Biscuit': /\b(biscuit|cookie|cookies|crunchy treat)\b/i,
    'Soft Treat': /\b(soft treat|soft chew|moist treat)\b/i,
    'Dental Treat': /\b(dental treat|dental chew|dental bone|dental stick)\b/i,
    'Jerky': /\b(jerky|strips?|tenders?)\b/i,
    'Training Treat': /\b(training treat|training reward|mini treat|small treat)\b/i,
    'Chew': /\b(chew|chews?|bully stick|bone|bones?|antler|hoof|rawhide)\b/i,
    'Lickable': /\b(lickable|lick treat|purée|puree|squeeze[- ]?up|squeeze treat|tube treat)\b/i,
    'Freeze-Dried Treat': /\b(freeze[- ]?dried treat|raw treat|freeze[- ]?dried raw)\b/i,
};

/** Chew duration */
const CHEW_DURATION_PATTERNS: Record<string, RegExp> = {
    'Quick': /\b(quick|soft|easy|rapid)\b/i,
    'Moderate': /\b(moderate|medium|standard)\b/i,
    'Long-Lasting': /\b(long[- ]?lasting|long lasting|extended|durable|tough|hours?|all day)\b/i,
};

/** Texture */
const TEXTURE_PATTERNS: Record<string, RegExp> = {
    'Crunchy': /\b(crunchy|crispy|hard)\b/i,
    'Soft': /\b(soft|tender|moist|chewy)\b/i,
    'Chewy': /\b(chewy|gummy|taffy)\b/i,
    'Hard': /\b(hard|rock[- ]?solid|rigid)\b/i,
};

/** Functional benefit */
const FUNCTIONAL_BENEFIT_PATTERNS: Record<string, RegExp> = {
    'Dental': /\b(dental|teeth|oral|tartar|plaque|fresh breath)\b/i,
    'Calming': /\b(calming|calm|anxiety|stress|relax)\b/i,
    'Joint': /\b(joint|hip|glucosamine|chondroitin|mobility)\b/i,
    'Skin & Coat': /\b(skin|coat|fur|omega|shiny)\b/i,
    'Digestive': /\b(digestive|probiotic|prebiotic|gut|fiber)\b/i,
    'Hypoallergenic': /\b(hypoallergenic|limited ingredient|allergy)\b/i,
};

/** Cat litter material */
const LITTER_MATERIAL_PATTERNS: Record<string, RegExp> = {
    'Clay': /\b(clay|bentonite|sodium bentonite)\b/i,
    'Crystal': /\b(crystal|silica|silica gel)\b/i,
    'Corn': /\b(corn|cob)\b/i,
    'Pine': /\b(pine|wood|cedar)\b/i,
    'Paper': /\b(paper|recycled paper)\b/i,
    'Walnut': /\b(walnut|walnut shell)\b/i,
    'Grass': /\b(grass|wheat grass)\b/i,
};

/** Clumping */
const CLUMPING_PATTERNS: Record<string, RegExp> = {
    'Clumping': /\b(clump|clumping|clump[- ]?forming)\b/i,
    'Non-Clumping': /\b(non[- ]?clump|non clump|non-clumping)\b/i,
};

/** Dust level */
const DUST_LEVEL_PATTERNS: Record<string, RegExp> = {
    'Low Dust': /\b(low dust|low[- ]?dust|minimal dust)\b/i,
    'Dust-Free': /\b(dust[- ]?free|99%\s*dust|no dust|zero dust)\b/i,
};

/** Toy type */
const TOY_TYPE_PATTERNS: Record<string, RegExp> = {
    'Plush': /\b(plush|stuffed|soft toy|squeaky|stuffed animal)\b/i,
    'Chew Toy': /\b(chew toy|chewable|durable chew|tough chew)\b/i,
    'Fetch Toy': /\b(fetch|ball|frisbee|disc|launcher)\b/i,
    'Rope': /\b(rope|tug|tug toy|braided)\b/i,
    'Puzzle': /\b(puzzle|interactive|treat dispenser|snuffle|brain)\b/i,
    'Wand': /\b(wand|feather|teaser|fishing pole)\b/i,
};

/** Play style */
const PLAY_STYLE_PATTERNS: Record<string, RegExp> = {
    'Chewing': /\b(chew|chewing|gnaw)\b/i,
    'Fetching': /\b(fetch|fetching|retrieve|chase)\b/i,
    'Tugging': /\b(tug|tugging|pull)\b/i,
    'Chasing': /\b(chase|chasing|pounce|stalking)\b/i,
    'Foraging': /\b(forage|foraging|snuffle|hunt)\b/i,
};

/** Durability */
const DURABILITY_PATTERNS: Record<string, RegExp> = {
    'Light': /\b(light|delicate|gentle|for puppies|for kittens)\b/i,
    'Moderate': /\b(moderate|medium|standard|regular)\b/i,
    'Tough': /\b(tough|durable|strong|power[- ]?chewer|heavy[- ]?duty)\b/i,
    'Extreme': /\b(extreme|indestructible|heavy chewer|aggressive chewer|guaranteed)\b/i,
};

/** Garden product type */
const GARDEN_PRODUCT_TYPE_PATTERNS: Record<string, RegExp> = {
    'Soil': /\b(soil|potting soil|garden soil|topsoil)\b/i,
    'Mulch': /\b(mulch|bark|wood chips)\b/i,
    'Compost': /\b(compost|composted|humus)\b/i,
    'Fertilizer': /\b(fertilizer|plant food|feed|nutrition)\b/i,
    'Grass Seed': /\b(grass seed|lawn seed|seed mix)\b/i,
    'Pest Control': /\b(pest control|insecticide|pesticide|bug killer)\b/i,
    'Weed Control': /\b(weed control|herbicide|weed killer|weed preventer)\b/i,
    'Seed': /\b(seed|seeds?|bulb|bulbs?)\b/i,
};

/** Season */
const SEASON_PATTERNS: Record<string, RegExp> = {
    'Spring': /\b(spring|springtime)\b/i,
    'Summer': /\b(summer|summertime)\b/i,
    'Fall': /\b(fall|autumn|autumnal)\b/i,
    'Winter': /\b(winter|wintertime|ice melt|snow)\b/i,
};

/** Organic boolean */
const ORGANIC_PATTERNS: Record<string, RegExp> = {
    'Yes': /\b(organic|usda organic|organically|certified organic|100% organic)\b/i,
};

/** Fuel type */
const FUEL_TYPE_PATTERNS: Record<string, RegExp> = {
    'Wood Pellets': /\b(wood pellet|pellet fuel|heating pellet)\b/i,
    'Coal': /\b(coal|anthracite|bituminous)\b/i,
    'Firewood': /\b(firewood|fire wood|seasoned wood|kiln[- ]?dried)\b/i,
    'Fire Starter': /\b(fire starter|firestarter|kindling|lighter fluid|fire log)\b/i,
};

// =============================================================================
// Source Field Extraction
// =============================================================================

/**
 * Source field key aliases — distributors use different key names for the same
 * concept. This maps known aliases to our canonical field names.
 */
const SOURCE_FIELD_ALIASES: Record<DetailField, string[]> = {
    pet_type: ['pet_type', 'petType', 'animal_type', 'animalType', 'species'],
    life_stage: ['life_stage', 'lifeStage', 'lifestage', 'age_range', 'ageRange'],
    pet_size: ['pet_size', 'petSize', 'breed_size', 'breedSize', 'size_class', 'sizeClass'],
    special_diet: ['special_diet', 'specialDiet', 'diet_type', 'dietType', 'dietary_needs'],
    health_feature: ['health_feature', 'healthFeature', 'health_benefit', 'healthBenefit', 'wellness'],
    health_focus: ['health_focus', 'healthFocus', 'health_benefit', 'healthBenefit', 'wellness'],
    food_form: ['food_form', 'foodForm', 'product_form', 'productForm', 'food_type', 'foodType'],
    flavor: ['flavor', 'flavour', 'taste', 'recipe', 'protein_source'],
    product_feature: ['product_feature', 'productFeature', 'key_feature', 'feature', 'main_feature'],
    size: ['size', 'product_size', 'productSize', 'dimensions'],
    color: ['color', 'colour', 'product_color', 'productColor'],
    packaging_type: ['packaging_type', 'packagingType', 'package_type', 'packageType', 'packaging'],
    // New canonical aliases
    animal_type: ['animal_type', 'animalType', 'species', 'pet_type', 'petType'],
    breed_size: ['breed_size', 'breedSize', 'size_class', 'sizeClass', 'pet_size', 'petSize'],
    primary_protein: ['primary_protein', 'primaryProtein', 'protein_source', 'protein'],
    diet_type: ['diet_type', 'dietType', 'dietary_needs', 'special_diet', 'specialDiet'],
    claims: ['claims', 'label_claims', 'marketing_claims', 'certifications'],
    treat_type: ['treat_type', 'treatType', 'treat_form', 'chew_type'],
    chew_duration: ['chew_duration', 'chewDuration', 'duration', 'lasting'],
    texture: ['texture', 'product_texture', 'consistency'],
    rawhide_free: ['rawhide_free', 'rawhideFree', 'no_rawhide'],
    functional_benefit: ['functional_benefit', 'functionalBenefit', 'benefit', 'health_benefit'],
    litter_material: ['litter_material', 'litterMaterial', 'material', 'litter_type'],
    clumping: ['clumping', 'clump_type'],
    dust_level: ['dust_level', 'dustLevel', 'dust'],
    tracking_control: ['tracking_control', 'trackingControl', 'tracking'],
    absorbency: ['absorbency', 'absorbency_level', 'absorption'],
    toy_type: ['toy_type', 'toyType', 'toy_form'],
    play_style: ['play_style', 'playStyle', 'play'],
    durability: ['durability', 'durability_level', 'toughness'],
    has_squeaker: ['has_squeaker', 'hasSqueaker', 'squeaker'],
    garden_product_type: ['garden_product_type', 'gardenProductType', 'product_type', 'garden_type'],
    coverage_area: ['coverage_area', 'coverageArea', 'coverage', 'area'],
    season: ['season', 'seasonal', 'time_of_year'],
    organic: ['organic', 'is_organic', 'certified_organic'],
    target_pest: ['target_pest', 'targetPest', 'pest', 'controls'],
    target_weed: ['target_weed', 'targetWeed', 'weed_type', 'controls'],
    grass_type: ['grass_type', 'grassType', 'grass'],
    npk_ratio: ['npk_ratio', 'npkRatio', 'npk', 'fertilizer_analysis'],
    application_method: ['application_method', 'applicationMethod', 'application', 'apply'],
    active_ingredient: ['active_ingredient', 'activeIngredient', 'ingredient', 'active'],
    target_condition: ['target_condition', 'targetCondition', 'condition', 'treats', 'for'],
    feed_type: ['feed_type', 'feedType', 'feed_form', 'feed'],
    protein_percentage: ['protein_percentage', 'proteinPercentage', 'protein_content', 'crude_protein'],
    fat_percentage: ['fat_percentage', 'fatPercentage', 'fat_content', 'crude_fat'],
    fuel_type: ['fuel_type', 'fuelType', 'fuel'],
    btu: ['btu', 'btu_rating', 'heat_output'],
    tank_size: ['tank_size', 'tankSize', 'tank_capacity'],
    wattage: ['wattage', 'power', 'watts'],
    media_type: ['media_type', 'mediaType', 'filter_media', 'media'],
    water_type: ['water_type', 'waterType', 'water', 'aquarium_type'],
    bulb_type: ['bulb_type', 'bulbType', 'bulb', 'lamp_type'],
    uvb_strength: ['uvb_strength', 'uvbStrength', 'uvb_output', 'uvb'],
    capacity: ['capacity', 'volume', 'max_capacity'],
    compatibility: ['compatibility', 'compatible_with', 'fits'],
    coat_type: ['coat_type', 'coatType', 'coat', 'fur_type'],
    formula: ['formula', 'product_formula', 'formulation', 'type'],
    use_case: ['use_case', 'useCase', 'usage', 'application'],
    // Universal facets
    dimensions: ['dimensions', 'product_dimensions', 'item_dimensions'],
    package_weight: ['package_weight', 'weight', 'shipping_weight'],
    package_count: ['package_count', 'count', 'pack_count', 'case_pack'],
    material: ['material', 'materials'],
    scent: ['scent', 'fragrance', 'odor'],
    indoor_outdoor: ['indoor_outdoor', 'usage_location', 'indoor', 'outdoor'],
    subscription_eligible: ['subscription_eligible', 'subscription', 'subscribe_and_save'],
};

/**
 * Extract a field value from structured source data by searching for known aliases
 * across all sources, ordered by trust priority.
 */
function extractFromSources(
    sources: Record<string, unknown>,
    field: DetailField,
): string | null {
    const aliases = SOURCE_FIELD_ALIASES[field];
    const normalized = normalizeProductSources(sources);

    // Search sources in order (normalizeProductSources preserves insertion order)
    for (const [, sourceData] of Object.entries(normalized)) {
        for (const alias of aliases) {
            const value = sourceData[alias];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }

        // Also check nested specifications/attributes objects
        const specs = sourceData.specifications;
        if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
            for (const alias of aliases) {
                const value = (specs as Record<string, unknown>)[alias];
                if (typeof value === 'string' && value.trim().length > 0) {
                    return value.trim();
                }
            }
        }

        // Check nested structure (either directly on sourceData or inside sourceData.extracted)
        const nested = (sourceData.extracted && typeof sourceData.extracted === 'object')
            ? (sourceData.extracted as any)
            : sourceData;

        if (nested && typeof nested === 'object') {
            if (nested.core && typeof nested.core === 'object') {
                for (const alias of aliases) {
                    const value = nested.core[alias];
                    if (value !== undefined && value !== null) {
                        const strVal = String(value).trim();
                        if (strVal.length > 0) {
                            return strVal;
                        }
                    }
                }
            }

            if (Array.isArray(nested.facets)) {
                for (const facet of nested.facets) {
                    if (facet && typeof facet === 'object') {
                        const isMatch = facet.definition_slug === field || aliases.includes(facet.definition_slug);
                        if (isMatch && facet.value !== undefined && facet.value !== null) {
                            const strVal = String(facet.value).trim();
                            if (strVal.length > 0) {
                                return strVal;
                            }
                        }
                    }
                }
            }
        }
    }

    return null;
}

// =============================================================================
// Pattern Matching Extraction
// =============================================================================

/**
 * Build a searchable text blob from the consolidated output and source data.
 * Prioritizes name, description, and category since those are the most
 * informative for pattern matching.
 */
function buildSearchableText(
    consolidated: Record<string, unknown>,
    input: Record<string, unknown>,
    sources: Record<string, unknown>,
): string {
    const parts: string[] = [];

    // Consolidated output (highest signal)
    if (typeof consolidated.name === 'string') parts.push(consolidated.name);
    if (typeof consolidated.description === 'string') parts.push(consolidated.description);
    if (typeof consolidated.category === 'string') parts.push(consolidated.category);
    if (typeof consolidated.search_keywords === 'string') parts.push(consolidated.search_keywords);

    // Input record
    if (typeof input.name === 'string') parts.push(input.name);
    if (typeof input.description === 'string') parts.push(input.description);
    if (typeof input.category === 'string') parts.push(input.category);

    // Source titles/descriptions (first 3 sources to limit noise)
    const normalized = normalizeProductSources(sources);
    let sourceCount = 0;
    for (const [, sourceData] of Object.entries(normalized)) {
        if (sourceCount >= 3) break;
        if (typeof sourceData.title === 'string') parts.push(sourceData.title);
        if (typeof sourceData.description === 'string') parts.push(sourceData.description);
        sourceCount++;
    }

    return parts.filter(Boolean).join(' ');
}

/**
 * Match a value from a pattern dictionary against searchable text.
 * Returns the first match found, or null if no match.
 */
function matchPatterns(
    text: string,
    patterns: Record<string, RegExp>,
): string | null {
    for (const [value, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
            return value;
        }
    }
    return null;
}

/**
 * Match ALL values from a pattern dictionary against searchable text.
 * Returns pipe-delimited string of all matches, or null if none.
 */
function matchAllPatterns(
    text: string,
    patterns: Record<string, RegExp>,
): string | null {
    const matches: string[] = [];
    for (const [value, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
            matches.push(value);
        }
    }
    return matches.length > 0 ? matches.join('|') : null;
}

// =============================================================================
// Field Extractors
// =============================================================================

/**
 * Individual field extraction functions.
 * Each tries structured source data first, then falls back to pattern matching.
 * Returns null if no value can be determined.
 */
const FIELD_EXTRACTORS: Record<
    DetailField,
    (sources: Record<string, unknown>, text: string) => string | null
> = {
    // ---- Existing extractors ----
    pet_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'pet_type');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, PET_TYPE_PATTERNS);
    },

    life_stage: (sources, text) => {
        const fromSource = extractFromSources(sources, 'life_stage');
        if (fromSource) return fromSource;
        return matchPatterns(text, LIFE_STAGE_PATTERNS);
    },

    pet_size: (sources, text) => {
        const fromSource = extractFromSources(sources, 'pet_size');
        if (fromSource) return fromSource;
        return matchPatterns(text, PET_SIZE_PATTERNS);
    },

    special_diet: (sources, text) => {
        const fromSource = extractFromSources(sources, 'special_diet');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, SPECIAL_DIET_PATTERNS);
    },

    health_feature: (sources, text) => {
        const fromSource = extractFromSources(sources, 'health_feature');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, HEALTH_FEATURE_PATTERNS);
    },

    health_focus: (sources, text) => {
        const fromSource = extractFromSources(sources, 'health_focus');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, HEALTH_FEATURE_PATTERNS);
    },

    food_form: (sources, text) => {
        const fromSource = extractFromSources(sources, 'food_form');
        if (fromSource) return fromSource;
        return matchPatterns(text, FOOD_FORM_PATTERNS);
    },

    flavor: (sources, text) => {
        const fromSource = extractFromSources(sources, 'flavor');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, FLAVOR_PATTERNS);
    },

    product_feature: (sources, text) => {
        const fromSource = extractFromSources(sources, 'product_feature');
        if (fromSource) return fromSource;
        // product_feature is too open-ended for reliable pattern matching
        // — leave for the Finalizing copilot
        return null;
    },

    size: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'size');
        if (fromSource) return fromSource;
        return null;
    },

    color: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'color');
        if (fromSource) return fromSource;
        return null;
    },

    packaging_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'packaging_type');
        if (fromSource) return fromSource;
        return matchPatterns(text, PACKAGING_TYPE_PATTERNS);
    },

    // ---- New extractors ----

    animal_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'animal_type');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, PET_TYPE_PATTERNS);
    },

    breed_size: (sources, text) => {
        const fromSource = extractFromSources(sources, 'breed_size');
        if (fromSource) return fromSource;
        return matchPatterns(text, PET_SIZE_PATTERNS);
    },

    primary_protein: (sources, text) => {
        const fromSource = extractFromSources(sources, 'primary_protein');
        if (fromSource) return fromSource;
        return matchPatterns(text, PROTEIN_PATTERNS);
    },

    diet_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'diet_type');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, SPECIAL_DIET_PATTERNS);
    },

    claims: (sources, text) => {
        const fromSource = extractFromSources(sources, 'claims');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, CLAIMS_PATTERNS);
    },

    treat_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'treat_type');
        if (fromSource) return fromSource;
        return matchPatterns(text, TREAT_TYPE_PATTERNS);
    },

    chew_duration: (sources, text) => {
        const fromSource = extractFromSources(sources, 'chew_duration');
        if (fromSource) return fromSource;
        return matchPatterns(text, CHEW_DURATION_PATTERNS);
    },

    texture: (sources, text) => {
        const fromSource = extractFromSources(sources, 'texture');
        if (fromSource) return fromSource;
        return matchPatterns(text, TEXTURE_PATTERNS);
    },

    rawhide_free: (sources, text) => {
        const fromSource = extractFromSources(sources, 'rawhide_free');
        if (fromSource) return fromSource;
        if (/\brawhide[- ]?free|no rawhide\b/i.test(text)) return 'Yes';
        // If it says "rawhide" without "free", it's likely NOT rawhide-free
        return null;
    },

    functional_benefit: (sources, text) => {
        const fromSource = extractFromSources(sources, 'functional_benefit');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, FUNCTIONAL_BENEFIT_PATTERNS);
    },

    litter_material: (sources, text) => {
        const fromSource = extractFromSources(sources, 'litter_material');
        if (fromSource) return fromSource;
        return matchPatterns(text, LITTER_MATERIAL_PATTERNS);
    },

    clumping: (sources, text) => {
        const fromSource = extractFromSources(sources, 'clumping');
        if (fromSource) return fromSource;
        return matchPatterns(text, CLUMPING_PATTERNS);
    },

    dust_level: (sources, text) => {
        const fromSource = extractFromSources(sources, 'dust_level');
        if (fromSource) return fromSource;
        return matchPatterns(text, DUST_LEVEL_PATTERNS);
    },

    tracking_control: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'tracking_control');
        if (fromSource) return fromSource;
        return null;
    },

    absorbency: (sources, text) => {
        const fromSource = extractFromSources(sources, 'absorbency');
        if (fromSource) return fromSource;
        if (/\b(high absorb|ultra absorb|super absorb|max absorb|10x|5x|3x)\b/i.test(text)) return 'High';
        if (/\b(absorb|moisture lock|quick dry)\b/i.test(text)) return 'Standard';
        return null;
    },

    toy_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'toy_type');
        if (fromSource) return fromSource;
        return matchPatterns(text, TOY_TYPE_PATTERNS);
    },

    play_style: (sources, text) => {
        const fromSource = extractFromSources(sources, 'play_style');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, PLAY_STYLE_PATTERNS);
    },

    durability: (sources, text) => {
        const fromSource = extractFromSources(sources, 'durability');
        if (fromSource) return fromSource;
        return matchPatterns(text, DURABILITY_PATTERNS);
    },

    has_squeaker: (sources, text) => {
        const fromSource = extractFromSources(sources, 'has_squeaker');
        if (fromSource) return fromSource;
        if (/\bsqueak(er|s|ing|y)?\b/i.test(text)) return 'Yes';
        return null;
    },

    garden_product_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'garden_product_type');
        if (fromSource) return fromSource;
        return matchPatterns(text, GARDEN_PRODUCT_TYPE_PATTERNS);
    },

    coverage_area: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'coverage_area');
        if (fromSource) return fromSource;
        return null;
    },

    season: (sources, text) => {
        const fromSource = extractFromSources(sources, 'season');
        if (fromSource) return fromSource;
        return matchAllPatterns(text, SEASON_PATTERNS);
    },

    organic: (sources, text) => {
        const fromSource = extractFromSources(sources, 'organic');
        if (fromSource) return fromSource;
        return matchPatterns(text, ORGANIC_PATTERNS);
    },

    target_pest: (sources, text) => {
        const fromSource = extractFromSources(sources, 'target_pest');
        if (fromSource) return fromSource;
        const pestPatterns: Record<string, RegExp> = {
            'Ants': /\b(ant|ants?)\b/i,
            'Fleas': /\b(flea|fleas?|tick|ticks?)\b/i,
            'Roaches': /\b(roach|roaches?|cockroach)\b/i,
            'Mosquitoes': /\b(mosquito|mosquitoes?|mosquitos?)\b/i,
            'Rodents': /\b(rodent|mice|mouse|rat|rats?)\b/i,
            'Grubs': /\b(grub|grubs?)\b/i,
            'Aphids': /\b(aphid|aphids?)\b/i,
        };
        return matchAllPatterns(text, pestPatterns);
    },

    target_weed: (sources, text) => {
        const fromSource = extractFromSources(sources, 'target_weed');
        if (fromSource) return fromSource;
        const weedPatterns: Record<string, RegExp> = {
            'Crabgrass': /\b(crabgrass|crab grass)\b/i,
            'Broadleaf': /\b(broadleaf|broad leaf|dandelion|clover)\b/i,
            'Moss': /\b(moss)\b/i,
        };
        return matchAllPatterns(text, weedPatterns);
    },

    grass_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'grass_type');
        if (fromSource) return fromSource;
        const grassPatterns: Record<string, RegExp> = {
            'Sun/Shade': /(sun and shade|sun & shade|sun\/shade|anywhere)/i,
            'Full Sun': /(full sun|sunny)/i,
            'Shade': /(shade|dense shade)/i,
            'Tall Fescue': /(tall fescue|fescue)/i,
        };
        return matchPatterns(text, grassPatterns);
    },

    npk_ratio: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'npk_ratio');
        return fromSource;
    },

    application_method: (sources, text) => {
        const fromSource = extractFromSources(sources, 'application_method');
        if (fromSource) return fromSource;
        const appPatterns: Record<string, RegExp> = {
            'Granular': /(granular|granule|pellet|spread)/i,
            'Spray': /\b(spray|liquid|ready[- ]?to[- ]?spray|conc?entrate)\b/i,
            'Ready-to-Use': /\b(ready[- ]?to[- ]?use|rtu|pre[- ]?mixed)\b/i,
            'Concentrate': /\b(concentrate|concentrated)\b/i,
        };
        return matchPatterns(text, appPatterns);
    },

    active_ingredient: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'active_ingredient');
        return fromSource;
    },

    target_condition: (sources, text) => {
        const fromSource = extractFromSources(sources, 'target_condition');
        if (fromSource) return fromSource;
        const conditionPatterns: Record<string, RegExp> = {
            'Joint Pain': /\b(joint|arthritis|hip|mobility)\b/i,
            'Anxiety': /\b(anxiety|anxious|stress|calm|calming)\b/i,
            'Digestive': /\b(digestive|stomach|gut|probiotic|constipation|diarrhea)\b/i,
            'Skin Irritation': /\b(skin|itch|itching|allergy|dermatitis|hot spot)\b/i,
            'Dental': /\b(dental|teeth|gum|oral)\b/i,
            'Fleas': /\b(flea|fleas?|tick|ticks?)\b/i,
            'Urinary': /\b(urinary|bladder|uti|urine)\b/i,
            'Parasites': /\b(worm|wormer|dewormer|parasite|tapeworm|roundworm)\b/i,
        };
        return matchAllPatterns(text, conditionPatterns);
    },

    feed_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'feed_type');
        if (fromSource) return fromSource;
        const feedPatterns: Record<string, RegExp> = {
            'Layer': /\b(layer|laying|egg)\b/i,
            'Starter': /\b(starter|start|chick|baby)\b/i,
            'Grower': /\b(grower|growing|development)\b/i,
            'Finisher': /\b(finisher|finishing|final)\b/i,
            'Complete Feed': /\b(complete|all[- ]?in[- ]?one|balanced)\b/i,
            'Supplement': /\b(supplement|top[- ]?dress|additive)\b/i,
            'Scratch': /\b(scratch|cracked)\b/i,
        };
        return matchPatterns(text, feedPatterns);
    },

    protein_percentage: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'protein_percentage');
        return fromSource;
    },

    fat_percentage: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'fat_percentage');
        return fromSource;
    },

    fuel_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'fuel_type');
        if (fromSource) return fromSource;
        return matchPatterns(text, FUEL_TYPE_PATTERNS);
    },

    btu: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'btu');
        return fromSource;
    },

    tank_size: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'tank_size');
        return fromSource;
    },

    wattage: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'wattage');
        return fromSource;
    },

    media_type: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'media_type');
        return fromSource;
    },

    water_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'water_type');
        if (fromSource) return fromSource;
        const waterPatterns: Record<string, RegExp> = {
            'Freshwater': /\b(freshwater|fresh water|tropical)\b/i,
            'Saltwater': /\b(saltwater|salt water|marine|reef)\b/i,
            'Brackish': /\b(brackish)\b/i,
            'Coldwater': /\b(coldwater|cold water|goldfish)\b/i,
            'Pond': /\b(pond|koi|water garden)\b/i,
        };
        return matchPatterns(text, waterPatterns);
    },

    bulb_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'bulb_type');
        if (fromSource) return fromSource;
        const bulbPatterns: Record<string, RegExp> = {
            'UVB': /\b(uvb|ultraviolet|reptile uvb|desert uvb|forest uvb)\b/i,
            'UVA': /\b(uva|daylight|basking)\b/i,
            'Heat': /\b(heat|ceramic|infrared|night heat|nocturnal)\b/i,
            'LED': /\b(led|light emitting)\b/i,
        };
        return matchPatterns(text, bulbPatterns);
    },

    uvb_strength: (sources, text) => {
        const fromSource = extractFromSources(sources, 'uvb_strength');
        if (fromSource) return fromSource;
        const uvbPatterns: Record<string, RegExp> = {
            '5%': /\b(5[.\s]?%|5\.0|2[.\s]?%)\b/i,
            '10%': /\b(10[.\s]?%|10\.0|6[.\s]?%|8[.\s]?%)\b/i,
        };
        return matchPatterns(text, uvbPatterns);
    },

    capacity: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'capacity');
        return fromSource;
    },

    compatibility: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'compatibility');
        return fromSource;
    },

    coat_type: (sources, text) => {
        const fromSource = extractFromSources(sources, 'coat_type');
        if (fromSource) return fromSource;
        const coatPatterns: Record<string, RegExp> = {
            'Short Hair': /\b(short hair|short[-]?hair|shorthair|short coat)\b/i,
            'Long Hair': /\b(long hair|long[-]?hair|longhair|long coat)\b/i,
            'Double Coat': /\b(double coat|double[-]?coat|undercoat)\b/i,
            'Curly': /\b(curly|curly coat|wool)\b/i,
            'Sensitive': /\b(sensitive|sensitive skin|gentle)\b/i,
        };
        return matchPatterns(text, coatPatterns);
    },

    formula: (sources, text) => {
        const fromSource = extractFromSources(sources, 'formula');
        if (fromSource) return fromSource;
        const formulaPatterns: Record<string, RegExp> = {
            'Shampoo': /\b(shampoo|wash)\b/i,
            'Conditioner': /\b(conditioner|condition)\b/i,
            'Spray': /\b(spray|mist|tonic)\b/i,
            'Wipe': /\b(wipes?|towelette)\b/i,
            'Ointment': /\b(ointment|cream|balm|lotion|salve)\b/i,
        };
        return matchPatterns(text, formulaPatterns);
    },

    use_case: (sources, text) => {
        const fromSource = extractFromSources(sources, 'use_case');
        if (fromSource) return fromSource;
        const useCasePatterns: Record<string, RegExp> = {
            'Deodorizing': /\b(deodoriz|odor|smell|fresh)\b/i,
            'Stain Removal': /\b(stain|spot|mark|cleaner)\b/i,
            'Waterless': /\b(waterless|no rinse|no[-]?rinse)\b/i,
            'Hypoallergenic': /\b(hypoallergenic|allergy|sensitive)\b/i,
            'Flea & Tick': /\b(flea|tick|flea and tick)\b/i,
        };
        return matchPatterns(text, useCasePatterns);
    },

    // Universal facet extractors
    dimensions: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'dimensions');
        return fromSource;
    },

    package_weight: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'package_weight');
        return fromSource;
    },

    package_count: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'package_count');
        return fromSource;
    },

    material: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'material');
        return fromSource;
    },

    scent: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'scent');
        return fromSource;
    },

    indoor_outdoor: (sources, text) => {
        const fromSource = extractFromSources(sources, 'indoor_outdoor');
        if (fromSource) return fromSource;
        if (/\b(indoor|inside|interior)\b/i.test(text)) return 'Indoor';
        if (/\b(outdoor|outside|exterior)\b/i.test(text)) return 'Outdoor';
        return null;
    },

    subscription_eligible: (sources, _text) => {
        const fromSource = extractFromSources(sources, 'subscription_eligible');
        return fromSource;
    },
};

// =============================================================================
// Main Enrichment Function
// =============================================================================

/**
 * Enrich a consolidated product record with detail fields based on its
 * facet profile (determined from the assigned category).
 *
 * This function:
 * 1. Resolves the product's facet profile based on the assigned category
 *    (or an explicit profile from the DB)
 * 2. Determines which detail fields are applicable for that profile
 * 3. Extracts values from structured source data and pattern matching
 * 4. Returns only the fields that were successfully populated
 *
 * @param input - The consolidated fields, raw sources, and input record
 * @returns The enrichment result with populated fields and gap report
 */
export function enrichProductDetails(input: EnrichmentInput): EnrichmentResult {
    const category = typeof input.consolidated.category === 'string'
        ? input.consolidated.category
        : typeof (input.consolidated.core as any)?.canonical_category_breadcrumb === 'string'
            ? (input.consolidated.core as any).canonical_category_breadcrumb
            : null;

    // Accept explicit facet profile from consolidated output (set during consolidation)
    const explicitProfile = typeof input.consolidated.facet_profile === 'string'
        ? input.consolidated.facet_profile
        : typeof (input.consolidated.core as any)?.facet_profile === 'string'
            ? (input.consolidated.core as any).facet_profile
            : undefined;

    const profile = resolveFacetProfile(category, explicitProfile);
    const applicableFields = [...FACET_PROFILE_APPLICABLE_FIELDS[profile]] as DetailField[];

    const searchText = buildSearchableText(
        input.consolidated,
        input.input,
        input.sources,
    );

    const fields: Record<string, string> = {};
    const populatedFields: string[] = [];
    const missingFields: string[] = [];

    for (const field of applicableFields) {
        // Skip fields that already have a value in consolidated
        const existingValue = input.consolidated[field];
        if (typeof existingValue === 'string' && existingValue.trim().length > 0) {
            fields[field] = existingValue.trim();
            populatedFields.push(field);
            continue;
        }

        // Also check input record for pre-existing values
        const inputValue = input.input[field];
        if (typeof inputValue === 'string' && inputValue.trim().length > 0) {
            fields[field] = inputValue.trim();
            populatedFields.push(field);
            continue;
        }

        const extractor = FIELD_EXTRACTORS[field];
        if (!extractor) {
            missingFields.push(field);
            continue;
        }

        const extracted = extractor(input.sources, searchText);
        if (extracted) {
            fields[field] = extracted;
            populatedFields.push(field);
        } else {
            missingFields.push(field);
        }
    }

    return {
        fields,
        facetProfile: profile,
        domain: profile, // deprecated alias
        populatedFields,
        missingFields,
    };
}

// Re-export for convenience
export type { DetailField, FacetProfile } from './category-domain';
