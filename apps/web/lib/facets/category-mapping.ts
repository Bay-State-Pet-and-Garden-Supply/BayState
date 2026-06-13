const SHOPSITE_CATEGORY_MAPPING: Record<string, Record<string, string>> = {
    'Barn Supplies': {
        'Buckets & Feeders': 'farm-livestock-feeders-waterers',
        'Chicken Supplies|Shavings & Bedding': 'chicken-poultry-bedding',
        'De-Icers': 'home-heating-fuel',
        'Electric Fence Supplies': 'farm-livestock-handling-fencing',
        'Farm Gates & Fencing': 'farm-livestock-handling-fencing',
        'Fencing': 'farm-livestock-handling-fencing',
        'Shavings & Bedding': 'chicken-poultry-bedding',
        'Tools & Equipment': 'tools-hardware-tools',
        '*': 'farm-livestock',
    },
    'barn supplies': {
        'electric fence supplies': 'farm-livestock-handling-fencing',
        'fencing': 'farm-livestock-handling-fencing',
        'gate supplies': 'farm-livestock-handling-fencing',
        'tools & equipment': 'tools-hardware-tools',
        '*': 'farm-livestock',
    },
    'Caged Bird Food & Supplies': {
        'Food': 'pet-bird-food',
        'Treats': 'pet-bird-treats',
        '*': 'pet-bird',
    },
    'caged bird food & supplies': {
        'food': 'pet-bird-food',
        'treats': 'pet-bird-treats',
        '*': 'pet-bird',
    },
    'Cat Food': {
        'Food': 'cat-food',
        'food': 'cat-food',
        'Wet Food': 'cat-food-wet',
        'Dry Food': 'cat-food-dry',
        'Toppers': 'cat-food',
        '*': 'cat-food',
    },
    'cat food': {
        'Food': 'cat-food',
        'food': 'cat-food',
        'milk replacer': 'cat-food',
        'toppers': 'cat-food',
        '*': 'cat-food',
    },
    'Cat Supplies': {
        'Bedding & Litter': 'cat-litter',
        'Cleanup': 'cat-litter',
        'Flea & Tick': 'cat-flea-tick',
        'Grooming': 'cat-grooming',
        'Healthcare': 'cat-health-wellness',
        'Litter': 'cat-litter',
        'Litter & Litter Boxes': 'cat-litter-boxes-accessories',
        'Scratchers': 'cat-trees-scratchers-furniture',
        'Toys': 'cat-toys',
        'Treats': 'cat-treats',
        '*': 'cat',
    },
    'cat supplies': {
        'bedding & litter': 'cat-litter',
        'cleanup': 'cat-litter',
        'flea & tick': 'cat-flea-tick',
        'food': 'cat-food',
        'furniture': 'cat-trees-scratchers-furniture',
        'grooming': 'cat-grooming',
        'healthcare': 'cat-health-wellness',
        'litter': 'cat-litter',
        'scratchers': 'cat-trees-scratchers-furniture',
        'toys': 'cat-toys',
        'treats': 'cat-treats',
        '*': 'cat',
    },
    'Dog Food': {
        'Food': 'dog-food',
        'food': 'dog-food',
        'Wet Food': 'dog-food-wet',
        'Dry Food': 'dog-food-dry',
        'Toppers': 'dog-food',
        'Healthcare': 'dog-health-wellness',
        '*': 'dog-food',
    },
    'dog food': {
        'Food': 'dog-food',
        'food': 'dog-food',
        'toppers': 'dog-food',
        '*': 'dog-food',
    },
    'Dog Supplies': {
        'Beds': 'dog-beds-furniture',
        'Boots': 'dog-apparel',
        'Bowls & Feeders': 'dog-bowls-feeders',
        'Cleanup': 'dog-cleaning-potty',
        'Crates & Carriers': 'dog-crates-kennels-gates',
        'Flea & Tick': 'dog-flea-tick',
        'Grooming': 'dog-grooming',
        'Healthcare': 'dog-health-wellness',
        'Leashes, Collars & Harnesses': 'dog-collars-leashes-harnesses',
        'Toys': 'dog-toys',
        'Training': 'dog-training-behavior',
        '*': 'dog',
    },
    'dog supplies': {
        'beds': 'dog-beds-furniture',
        'bowls & feeders': 'dog-bowls-feeders',
        'cleanup': 'dog-cleaning-potty',
        'crates': 'dog-crates-kennels-gates',
        'flea & tick': 'dog-flea-tick',
        'grooming': 'dog-grooming',
        'healthcare': 'dog-health-wellness',
        'toys': 'dog-toys',
        'training': 'dog-training-behavior',
        '*': 'dog',
    },
    'Dog Toys': {
        'Plush': 'dog-toys',
        'Toys': 'dog-toys',
        'toys': 'dog-toys',
        '*': 'dog-toys',
    },
    'Dog Treats': {
        'Biscuits, Cookies & Crunchy Treats': 'dog-treats-chews',
        'Bones': 'dog-treats-chews',
        'Dental Treats': 'dog-treats-chews',
        'Treats': 'dog-treats-chews',
        '*': 'dog-treats-chews',
    },
    'Farm Animal': {
        'Buckets & Feeders': 'farm-livestock-feeders-waterers',
        'Chicken Supplies': 'chicken-poultry-coops-runs',
        'Chicks': 'chicken-poultry',
        'Coops': 'chicken-poultry-coops-runs',
        'Food': 'chicken-poultry-feed',
        'Healthcare': 'farm-livestock-health-first-aid',
        'Supplements': 'chicken-poultry-health-supplements',
        'Treats': 'chicken-poultry-treats',
        '*': 'farm-livestock',
    },
    'farm animal': {
        'Food': 'chicken-poultry-feed',
        'chicken supplies': 'chicken-poultry-coops-runs',
        'food': 'chicken-poultry-feed',
        'healthcare': 'farm-livestock-health-first-aid',
        'supplements': 'chicken-poultry-health-supplements',
        'treats': 'chicken-poultry-treats',
        '*': 'farm-livestock',
    },
    'Fish Food': {
        'Food': 'fish-aquarium-food',
        '*': 'fish-aquarium-food',
    },
    'Fish Supplies': {
        'Water Treatsments & Test Kits': 'fish-aquarium-water-care',
        'aquarium': 'fish-aquarium-tanks',
        '*': 'fish-aquarium',
    },
    'Horse Feed & Treats': {
        'Food': 'horse-feed',
        'Treats': 'horse-treats',
        'Hay': 'horse-feed',
        '*': 'horse-feed',
    },
    'Horse Health & Wellness': {
        'Dewormers': 'horse-health-supplements',
        'First Aid': 'horse-health-supplements',
        'Fly Control': 'horse-fly-control',
        'Grooming': 'horse-grooming',
        'Supplements': 'horse-health-supplements',
        '*': 'horse',
    },
    'Lawn & Garden': {
        'Animal Repellents': 'lawn-garden-weed-pest-control',
        'Fertilizer': 'lawn-garden-fertilizer',
        'Gardening Tools & Supplies': 'lawn-garden-tools',
        'Grass Seed': 'lawn-garden-grass-seed',
        'Pest Control': 'lawn-garden-weed-pest-control',
        'Soils & Mulches': 'lawn-garden-soil-mulch-compost',
        'Vegetable & Herb Seeds': 'lawn-garden-seeds-plants',
        'Weed Control': 'lawn-garden-weed-pest-control',
        '*': 'lawn-garden',
    },
    'lawn & garden': {
        'gardening tools & supplies': 'lawn-garden-tools',
        'planters': 'lawn-garden-planters-supplies',
        'seeds': 'lawn-garden-seeds-plants',
        '*': 'lawn-garden',
    },
    'Reptile Food & Supplies': {
        'Food': 'reptile-amphibian-food',
        'Lamps': 'reptile-amphibian-heating-lighting',
        '*': 'reptile-amphibian',
    },
    'Small Pet Food & Supplies': {
        'Bedding & Litter': 'small-pet-bedding-litter',
        'Food': 'small-pet-food',
        'Grooming': 'small-pet-health-grooming',
        'Habitats & Accessories': 'small-pet-cages-habitats',
        'Hay': 'small-pet-hay',
        'Healthcare': 'small-pet-health-grooming',
        'Toys': 'small-pet-toys-enrichment',
        'Treats': 'small-pet-treats-chews',
        '*': 'small-pet',
    },
    'Wild Bird Food': {
        'Food': 'wild-bird-wildlife-food',
        'Seeds & Seed Mixes': 'wild-bird-wildlife-food',
        'Suet': 'wild-bird-wildlife-suet',
        '*': 'wild-bird-wildlife-food',
    },
    'Wild Bird Supplies': {
        'Bird Feeders': 'wild-bird-wildlife-feeders',
        'Bird Houses': 'wild-bird-wildlife-houses-nesting',
        'Feeders': 'wild-bird-wildlife-feeders',
        '*': 'wild-bird-wildlife',
    },
    'Household': {
        'Cleaning': 'home-heating-cleaning-supplies',
        'Heating': 'home-heating-fuel',
        'Pest Control': 'home-heating-pest-control',
        'Trash Bags': 'home-heating-storage-utility',
        '*': 'home-heating',
    },
    'Farm Animal Sheep & Goat': {
        'Supplements': 'farm-livestock-supplements-minerals',
        'Treats': 'farm-livestock-treats',
        '*': 'farm-livestock',
    },
    'Farm Animals': {
        'Chicken Supplies': 'chicken-poultry-coops-runs',
        '*': 'farm-livestock',
    },
    'Household Supplies': {
        'Heating': 'home-heating-fuel',
        '*': 'home-heating',
    },
    'Wildlife Food': {
        'Food': 'wild-bird-wildlife-wildlife-feed',
        '*': 'wild-bird-wildlife-wildlife-feed',
    },
    'Dog Cleanup': {
        '*': 'dog-cleaning-potty',
    },
    'horse grooming': {
        'combs': 'horse-grooming',
        'hoof pick': 'horse-grooming',
        '*': 'horse-grooming',
    },
    'outdoors': {
        'hand warmers': 'home-heating-fuel',
        '*': 'home-heating',
    },
    'dog leashes, collars & harnesses': {
        '*': 'dog-collars-leashes-harnesses',
    },
    'Dog Leashes, Collars & Harnesses': {
        '*': 'dog-collars-leashes-harnesses',
    },
    'cat treats': {
        '*': 'cat-treats',
    },
    'Cat Supples': {
        'Toys': 'cat-toys',
        '*': 'cat',
    },
    'cat leashes, collars, & harnesses': {
        '*': 'cat-collars-harnesses',
    },
    'Seeds & Seed Starting': {
        '*': 'lawn-garden-seeds-plants',
    },
    'Gardening Supplies': {
        'Fertilizer': 'lawn-garden-fertilizer',
        '*': 'lawn-garden',
    },
    'Lawn Care': {
        '*': 'lawn-garden',
    },
    'pet tags': {
        '*': 'dog-collars-leashes-harnesses',
    },
    'farm animal supplies': {
        '*': 'farm-livestock',
    },
};

// Pre-compute lowercase mapping for efficiency
const LOWER_CATEGORY_MAPPING: Record<string, Record<string, string>> = {};
for (const [cat, types] of Object.entries(SHOPSITE_CATEGORY_MAPPING)) {
    const catLower = cat.toLowerCase();
    LOWER_CATEGORY_MAPPING[catLower] = LOWER_CATEGORY_MAPPING[catLower] || {};
    for (const [type, slug] of Object.entries(types)) {
        LOWER_CATEGORY_MAPPING[catLower][type.toLowerCase()] = slug;
    }
}

export function getMappedCategorySlug(
    categoryName: string | null | undefined,
    productTypeName: string | null | undefined
): string | null {
    if (!categoryName) return null;

    // Support piped categories (e.g. "Barn Supplies|Farm Animal") by trying each part
    const categories = categoryName.split('|').map(c => c.trim());

    for (const cat of categories) {
        const catLower = cat.toLowerCase();
        const typeMap = LOWER_CATEGORY_MAPPING[catLower];
        
        if (typeMap) {
            // Try specific type match
            if (productTypeName) {
                const typeLower = productTypeName.toLowerCase();
                if (typeMap[typeLower]) {
                    return typeMap[typeLower];
                }
            }
            
            // Fallback to wildcard for this category
            if (typeMap['*']) {
                return typeMap['*'];
            }
        }
    }

    return null;
}
