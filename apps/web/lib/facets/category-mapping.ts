export const SHOPSITE_CATEGORY_MAPPING: Record<string, Record<string, string>> = {
    'Barn Supplies': {
        'Buckets & Feeders': 'farm-animal-livestock-waterers-feeders',
        'Chicken Supplies|Shavings & Bedding': 'farm-animal-chicken-coop-supplies',
        'De-Icers': 'farm-animal-livestock-waterers-feeders',
        'Electric Fence Supplies': 'farm-animal-livestock-fencing-gates',
        'Farm Gates & Fencing': 'farm-animal-livestock-fencing-gates',
        'Fencing': 'farm-animal-livestock-fencing-gates',
        'Shavings & Bedding': 'farm-animal-chicken-coop-supplies',
        'Tools & Equipment': 'farm-animal',
        '*': 'farm-animal',
    },
    'barn supplies': {
        'electric fence supplies': 'farm-animal-livestock-fencing-gates',
        'fencing': 'farm-animal-livestock-fencing-gates',
        'gate supplies': 'farm-animal-livestock-fencing-gates',
        'tools & equipment': 'farm-animal',
        '*': 'farm-animal',
    },
    'Caged Bird Food & Supplies': {
        'Food': 'bird-food',
        'Treats': 'bird-food-treats',
        '*': 'bird',
    },
    'caged bird food & supplies': {
        'food': 'bird-food',
        'treats': 'bird-food-treats',
        '*': 'bird',
    },
    'Cat Food': {
        'Food': 'cat-food',
        'food': 'cat-food',
        'Wet Food': 'cat-food-wet-food',
        'Dry Food': 'cat-food-dry-food',
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
        'Bedding & Litter': 'cat-litter-housebreaking',
        'Cleanup': 'cat-litter-housebreaking',
        'Flea & Tick': 'cat-health-wellness-flea-tick',
        'Grooming': 'cat-grooming',
        'Healthcare': 'cat-health-wellness',
        'Litter': 'cat-litter-housebreaking',
        'Litter & Litter Boxes': 'cat-litter-housebreaking-litter-boxes-accessories',
        'Scratchers': 'cat-scratchers-furniture-scratchers',
        'Toys': 'cat-toys',
        'Treats': 'cat-treats',
        '*': 'cat',
    },
    'cat supplies': {
        'bedding & litter': 'cat-litter-housebreaking',
        'cleanup': 'cat-litter-housebreaking',
        'flea & tick': 'cat-health-wellness-flea-tick',
        'food': 'cat-food',
        'furniture': 'cat-scratchers-furniture',
        'grooming': 'cat-grooming',
        'healthcare': 'cat-health-wellness',
        'litter': 'cat-litter-housebreaking',
        'scratchers': 'cat-scratchers-furniture-scratchers',
        'toys': 'cat-toys',
        'treats': 'cat-treats',
        '*': 'cat',
    },
    'Dog Food': {
        'Food': 'dog-food',
        'food': 'dog-food',
        'Wet Food': 'dog-food-wet-food',
        'Dry Food': 'dog-food-dry-food',
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
        'Beds': 'dog-beds-crates-beds',
        'Boots': 'dog-clothing',
        'Bowls & Feeders': 'dog-bowls-feeding-supplies',
        'Cleanup': 'dog-waste-cleanup',
        'Crates & Carriers': 'dog-beds-crates-crates-kennels',
        'Flea & Tick': 'dog-health-wellness-flea-tick',
        'Grooming': 'dog-grooming',
        'Healthcare': 'dog-health-wellness',
        'Leashes, Collars & Harnesses': 'dog-walk-train-collars',
        'Toys': 'dog-toys',
        'Training': 'dog-walk-train-training-behavior',
        '*': 'dog',
    },
    'dog supplies': {
        'beds': 'dog-beds-crates-beds',
        'bowls & feeders': 'dog-bowls-feeding-supplies',
        'cleanup': 'dog-waste-cleanup',
        'crates': 'dog-beds-crates-crates-kennels',
        'flea & tick': 'dog-health-wellness-flea-tick',
        'grooming': 'dog-grooming',
        'healthcare': 'dog-health-wellness',
        'toys': 'dog-toys',
        'training': 'dog-walk-train-training-behavior',
        '*': 'dog',
    },
    'Dog Toys': {
        'Plush': 'dog-toys-plush-squeaky-toys',
        'Toys': 'dog-toys',
        'toys': 'dog-toys',
        '*': 'dog-toys',
    },
    'Dog Treats': {
        'Biscuits, Cookies & Crunchy Treats': 'dog-treats-biscuits-crunchy-treats',
        'Bones': 'dog-treats-jerky-chews',
        'Dental Treats': 'dog-treats-dental-treats',
        'Treats': 'dog-treats',
        '*': 'dog-treats',
    },
    'Farm Animal': {
        'Buckets & Feeders': 'farm-animal-livestock-waterers-feeders',
        'Chicken Supplies': 'farm-animal-chicken-coop-supplies',
        'Chicks': 'farm-animal-chicken',
        'Coops': 'farm-animal-chicken-coop-supplies',
        'Food': 'farm-animal-chicken-feed',
        'Healthcare': 'farm-animal-livestock-health',
        'Supplements': 'farm-animal-chicken-treats-supplements',
        'Treats': 'farm-animal-chicken-treats-supplements',
        '*': 'farm-animal',
    },
    'farm animal': {
        'Food': 'farm-animal-chicken-feed',
        'chicken supplies': 'farm-animal-chicken-coop-supplies',
        'food': 'farm-animal-chicken-feed',
        'healthcare': 'farm-animal-livestock-health',
        'supplements': 'farm-animal-chicken-treats-supplements',
        'treats': 'farm-animal-chicken-treats-supplements',
        '*': 'farm-animal',
    },
    'Fish Food': {
        'Food': 'fish-aquatics-food',
        '*': 'fish-aquatics-food',
    },
    'Fish Supplies': {
        'Water Treatsments & Test Kits': 'fish-aquatics-water-care',
        'aquarium': 'fish-aquatics-habitat-aquariums',
        '*': 'fish-aquatics',
    },
    'Horse Feed & Treats': {
        'Food': 'farm-animal-horse-feed',
        'Treats': 'farm-animal-horse-treats',
        'Hay': 'farm-animal-horse-feed',
        '*': 'farm-animal-horse-feed',
    },
    'Horse Health & Wellness': {
        'Dewormers': 'farm-animal-livestock-health-dewormers',
        'First Aid': 'farm-animal-livestock-health-wound-care',
        'Fly Control': 'farm-animal-horse-fly-control',
        'Grooming': 'farm-animal-livestock-health-hoof-care',
        'Supplements': 'farm-animal-horse-supplements',
        '*': 'farm-animal-livestock-health',
    },
    'Lawn & Garden': {
        'Animal Repellents': 'lawn-garden-pest-weed-control-animal-repellents',
        'Fertilizer': 'lawn-garden-fertilizers-plant-food',
        'Gardening Tools & Supplies': 'lawn-garden-gardening-tools',
        'Grass Seed': 'lawn-garden-grass-seed-lawn-repair-grass-seed',
        'Pest Control': 'lawn-garden-pest-weed-control',
        'Soils & Mulches': 'lawn-garden-soil-mulch-compost',
        'Vegetable & Herb Seeds': 'lawn-garden-planters-seed-starting-seed-starting',
        'Weed Control': 'lawn-garden-pest-weed-control-weed-control',
        '*': 'lawn-garden',
    },
    'lawn & garden': {
        'gardening tools & supplies': 'lawn-garden-gardening-tools',
        'planters': 'lawn-garden-planters-seed-starting-planters-pots',
        'seeds': 'lawn-garden-planters-seed-starting-seed-starting',
        '*': 'lawn-garden',
    },
    'Reptile Food & Supplies': {
        'Food': 'reptile-food',
        'Lamps': 'reptile-habitat-heating-lighting',
        '*': 'reptile',
    },
    'Small Pet Food & Supplies': {
        'Bedding & Litter': 'small-pet-bedding-litter',
        'Food': 'small-pet-food',
        'Grooming': 'small-pet-health-wellness-grooming',
        'Habitats & Accessories': 'small-pet-habitats-accessories',
        'Hay': 'small-pet-hay-forage',
        'Healthcare': 'small-pet-health-wellness',
        'Toys': 'small-pet-treats-chews',
        'Treats': 'small-pet-treats-chews-treats',
        '*': 'small-pet',
    },
    'Wild Bird Food': {
        'Food': 'wild-bird-seed-food',
        'Seeds & Seed Mixes': 'wild-bird-seed-food-seed-blends',
        'Suet': 'wild-bird-seed-food-suet-cakes',
        '*': 'wild-bird-seed-food',
    },
    'Wild Bird Supplies': {
        'Bird Feeders': 'wild-bird-feeders',
        'Bird Houses': 'wild-bird-habitat-bird-houses',
        'Feeders': 'wild-bird-feeders',
        '*': 'wild-bird',
    },
    'Household': {
        'Cleaning': 'home-cleaning-pest-control',
        'Heating': 'home-heating-fuel',
        'Pest Control': 'home-cleaning-pest-control-indoor-pest-control',
        'Trash Bags': 'home-storage-utility-trash-bags',
        '*': 'home',
    },
    'Farm Animal Sheep & Goat': {
        'Supplements': 'farm-animal-goat-sheep-supplements',
        'Treats': 'farm-animal-goat-sheep-feed',
        '*': 'farm-animal-goat-sheep',
    },
    'Farm Animals': {
        'Chicken Supplies': 'farm-animal-chicken-coop-supplies',
        '*': 'farm-animal',
    },
    'Household Supplies': {
        'Heating': 'home-heating-fuel',
        '*': 'home',
    },
    'Wildlife Food': {
        'Food': 'wild-bird-seed-food',
        '*': 'wild-bird-seed-food',
    },
    'Dog Cleanup': {
        '*': 'dog-waste-cleanup',
    },
    'horse grooming': {
        'combs': 'farm-animal-livestock-health-hoof-care',
        'hoof pick': 'farm-animal-livestock-health-hoof-care',
        '*': 'farm-animal-livestock-health',
    },
    'outdoors': {
        'hand warmers': 'home-heating-fuel',
        '*': 'home',
    },
};

export function getMappedCategorySlug(
    categoryName: string | null | undefined,
    productTypeName: string | null | undefined
): string | null {
    if (!categoryName) return null;

    // Support piped categories (e.g. "Barn Supplies|Farm Animal") by trying each part
    const categories = categoryName.split('|').map(c => c.trim());
    
    // Create a lowercase version of the mapping for case-insensitive lookup
    const lowerMapping: Record<string, Record<string, string>> = {};
    for (const [cat, types] of Object.entries(SHOPSITE_CATEGORY_MAPPING)) {
        const lowerTypes: Record<string, string> = {};
        for (const [type, slug] of Object.entries(types)) {
            lowerTypes[type.toLowerCase()] = slug;
        }
        lowerMapping[cat.toLowerCase()] = lowerTypes;
    }

    for (const cat of categories) {
        const catLower = cat.toLowerCase();
        const typeMap = lowerMapping[catLower];
        
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
