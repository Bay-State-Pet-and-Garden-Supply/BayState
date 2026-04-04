/**
 * ShopSite Constants
 *
 * Configuration constants for ShopSite XML export.
 * Based on the current Bay State ShopSite sample export (DTD 2.9 / version 15.0)
 * and field mappings from BayStateTools.
 */

/**
 * ShopSite store pages that products can be assigned to.
 * This list is aligned with the current ShopSite XML export used for sync,
 * so admin editing and consolidation validation work from the active page
 * catalog instead of carrying stale historical page values.
 */
export const SHOPSITE_PAGES = [
    '#Services',
    'Apparel',
    'Baby Chicks',
    'Barn Supplies Buckets & Feeders',
    'Barn Supplies Farm Gates & Fencing',
    'Barn Supplies Shop All',
    'Barn Supplies Tools & Equipment',
    'Bay State Country Gift Shop',
    'Beekeeping',
    'Boots',
    'Brand - Blue Buffalo',
    'Brand - Blue Seal',
    'Brand - Fromm',
    'Brand - Instinct',
    'Brand - Science Diet',
    'Cage Bird Cages & Accessories',
    'Caged Bird Canary & Finch',
    'Caged Bird Cockatiel',
    'Caged Bird Food',
    'Caged Bird Food & Supplies Shop All',
    'Caged Bird Healthcare',
    'Caged Bird Litter & Nesting',
    'Caged Bird Parakeet',
    'Caged Bird Parrot',
    'Caged Bird Pigeon',
    'Caged Bird Toys',
    'Caged Bird Treats',
    'Cat Beds & Carriers',
    'Cat Bowls & Feeders',
    'Cat Flea & Tick',
    'Cat Food Dry',
    'Cat Food Raw',
    'Cat Food Shop All',
    'Cat Food Wet',
    'Cat Grooming',
    'Cat Healthcare',
    'Cat Leashes Collars & Harnesses',
    'Cat Litter & Litter Boxes',
    'Cat Supplies Shop All',
    'Cat Toys & Scratchers',
    'Cat Treats',
    'Delivery Services',
    'Dog Beds',
    'Dog Bowls & Feeders',
    'Dog Cleanup',
    'Dog Clothing & Accessories',
    'Dog Crates & Carriers',
    'Dog Dental Treats',
    'Dog Flea & Tick',
    'Dog Food Dry',
    'Dog Food Raw',
    'Dog Food Shop All',
    'Dog Food Wet',
    'Dog Grooming',
    'Dog Healthcare',
    'Dog Leashes Collars & Harnesses',
    'Dog Supplies Shop All',
    'Dog Toys',
    'Dog Treats Biscuits Cookies & Crunchy Treats',
    'Dog Treats Bones Bully Sticks & Natural Chews',
    'Dog Treats Shop All',
    'Dog Treats Soft & Chewy',
    'Farm Animal Chicken & Poultry',
    'Farm Animal Cow',
    'Farm Animal Llama & Alpaca',
    'Farm Animal Pig',
    'Farm Animal Sheep & Goat',
    'Farm Animal Shop All',
    'Featured Brand - Purina',
    'Featured Products',
    'Fencing & Gates',
    'Fish Food Betta',
    'Fish Food Goldfish',
    'Fish Food Koi & Pond Fish',
    'Fish Food Shop All',
    'Fish Food Tropical',
    'Fish Pond Supplies',
    'Fish Supplies Shop All',
    'Fish Tanks & Accessories',
    'Fish Water Treatments & Test Kits',
    'Flowers & Plants',
    'Food Candy & Refreshments',
    'Gardening Tools & Supplies',
    'Gloves',
    'Grills & Accessories',
    'Hardware',
    'Hay',
    'Heating',
    'Home Shop All',
    'Horse Dewormers',
    'Horse Feed',
    'Horse Feed & Treats Shop All',
    'Horse First Aid',
    'Horse Fly Control',
    'Horse Grooming',
    'Horse Health & Wellness Shop All',
    'Horse Treats',
    'Horse Vitamins & Supplements',
    'Jerky Dog Treats',
    'Landscape Services',
    'Lawn & Garden Shop All',
    'Lawn Care',
    'Lawn Equipment Rental',
    'Mulch & Loam',
    'Pest Control',
    'Pest Control & Animal Repellents',
    'Plants',
    'Propane Filling Station',
    'Reptile Bearded Dragon',
    'Reptile Bedding & Substrate',
    'Reptile Food & Supplies Shop All',
    'Reptile Food & Treats',
    'Reptile Frog',
    'Reptile Heating & Lighting',
    'Reptile Lizard',
    'Reptile Snake',
    'Reptile Tanks & Accessories',
    'Reptile Turtle',
    'Seasonal Products',
    'Seeds & Seed Starting',
    'Shavings & Bedding',
    'Small Pet Bedding & Litter',
    'Small Pet Food',
    'Small Pet Food & Supplies Shop All',
    'Small Pet Grooming & Health',
    'Small Pet Guinea Pig',
    'Small Pet Habitats & Accessories',
    'Small Pet Hamster',
    'Small Pet Hay',
    'Small Pet Mouse & Rat',
    'Small Pet Rabbit',
    'Small Pet Toys & Chews',
    'Small Pet Treats',
    'Soap Lotion & Sanitizer',
    'Soy Candles & Melts',
    'Special Offers',
    'The Holiday Shoppe',
    'Wild Bird Baths',
    'Wild Bird Feeders',
    'Wild Bird Food Shop All',
    'Wild Bird Hangers Poles & Baffles',
    'Wild Bird Houses',
    'Wild Bird Seed & Seed Mixes',
    'Wild Bird Suet & Mealworms',
    'Wild Bird Supplies Shop All',
    'Wildlife Deer Food',
    'Wildlife Squirrel Food',
    'Winter Supplies',
    'Wood Pellets',
] as const;

export type ShopSitePage = (typeof SHOPSITE_PAGES)[number];

export function parseShopSitePages(value: unknown): string[] {
    const rawPages = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split('|')
            : [];

    return Array.from(
        new Set(
            rawPages
                .filter((entry): entry is string => typeof entry === 'string')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
        )
    );
}

/**
 * Maximum number of additional images ShopSite supports (MoreInfoImage1-20).
 */
export const MAX_MORE_INFO_IMAGES = 20;

/**
 * ShopSite XML version for the export format.
 */
export const SHOPSITE_XML_VERSION = '15.0';

/**
 * ShopSite custom field mappings.
 * Maps custom ProductField numbers to their business meanings.
 *
 * CORRECTED CONTRACT (18 Fields):
 * - ProductField24 is the ONLY canonical category source (PF31 is audit-only)
 * - ProductField17 direct values are canonical; inference is fallback only
 * - ProductField32 cross-sells are one-way, split on '|', skip duplicates/self/missing
 * - Blank canonical values clear normalized joins on rerun
 *
 * @see docs/field-mapping-matrix.md for full contract documentation
 * @see docs/shopsite-xml-mapping.md for XML-to-database mapping
 */
export const SHOPSITE_FIELD_MAP = {
    // Informational fields (not part of canonical contract)
    ProductField1: 'Upload_Tag',

    // Operational fields (first-class product columns)
    ProductField7: 'Short_Name',
    ProductField11: 'Special_Order',
    ProductField15: 'In_Store_Pickup',

    // Canonical normalized fields (dedicated tables)
    ProductField16: 'Brand',
    ProductField17: 'Pet_Type',
    ProductField24: 'Category',
    ProductField25: 'Product_Type',

    // Generic normalized facet fields (facet_definitions/values/joins)
    ProductField18: 'Life_Stage',
    ProductField19: 'Pet_Size',
    ProductField20: 'Special_Diet',
    ProductField21: 'Health_Feature',
    ProductField22: 'Food_Form',
    ProductField23: 'Flavor',
    ProductField26: 'Product_Feature',
    ProductField27: 'Size',
    ProductField29: 'Color',
    ProductField30: 'Packaging_Type',

    // Audit-only (never used for normalized behavior)
    ProductField31: 'Category_Audit_Only',

    // Relation fields (cross-sell linking)
    ProductField32: 'Cross_Sell',
} as const;

/**
 * ProductFields that are part of the canonical migration contract.
 * These 18 fields are actively mapped during import.
 */
export const CANONICAL_PRODUCT_FIELDS = [
    'ProductField7',
    'ProductField11',
    'ProductField15',
    'ProductField16',
    'ProductField17',
    'ProductField18',
    'ProductField19',
    'ProductField20',
    'ProductField21',
    'ProductField22',
    'ProductField23',
    'ProductField24',
    'ProductField25',
    'ProductField26',
    'ProductField27',
    'ProductField29',
    'ProductField30',
    'ProductField32',
] as const;

/**
 * ProductFields that populate generic normalized facet tables.
 * These use facet_definitions / facet_values / product_facet_values.
 */
export const GENERIC_FACET_FIELDS = [
    'ProductField18',
    'ProductField19',
    'ProductField20',
    'ProductField21',
    'ProductField22',
    'ProductField23',
    'ProductField26',
    'ProductField27',
    'ProductField29',
    'ProductField30',
] as const;

/**
 * ProductFields excluded from normalized behavior.
 * These are preserved in raw payload for audit only.
 */
export const AUDIT_ONLY_PRODUCT_FIELDS = ['ProductField31'] as const;

/**
 * ShopSite image field mappings.
 *
 * - Graphic: Main product image shown on category/listing pages (thumbnail)
 * - MoreInformationGraphic: Main product image on the detail page
 * - MoreInfoImage1-20: Additional images shown on the detail page
 *
 * Both Graphic and MoreInformationGraphic use the first product image.
 */
export const IMAGE_FIELD_MAPPING = {
    primary: ['Graphic', 'MoreInformationGraphic'] as const,
    additional: [
        'MoreInfoImage1',
        'MoreInfoImage2',
        'MoreInfoImage3',
        'MoreInfoImage4',
        'MoreInfoImage5',
        'MoreInfoImage6',
        'MoreInfoImage7',
        'MoreInfoImage8',
        'MoreInfoImage9',
        'MoreInfoImage10',
        'MoreInfoImage11',
        'MoreInfoImage12',
        'MoreInfoImage13',
        'MoreInfoImage14',
        'MoreInfoImage15',
        'MoreInfoImage16',
        'MoreInfoImage17',
        'MoreInfoImage18',
        'MoreInfoImage19',
        'MoreInfoImage20',
    ] as const,
};
