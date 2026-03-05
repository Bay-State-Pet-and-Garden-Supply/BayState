import { ShopSiteProduct } from './types';

export type PetTypeName = 
    | 'Dog' 
    | 'Cat' 
    | 'Bird' 
    | 'Fish' 
    | 'Reptile' 
    | 'Small Animal' 
    | 'Horse' 
    | 'Livestock';

export type LifeStage = 'puppy' | 'adult' | 'senior' | 'all';
export type SizeClass = 'small' | 'medium' | 'large' | 'giant' | 'all';
export type SpecialNeed = 
    | 'grain-free' 
    | 'sensitive-stomach' 
    | 'weight-management' 
    | 'high-protein' 
    | 'limited-ingredient'
    | 'dental-care'
    | 'joint-support'
    | 'skin-coat';

export interface PetTypeInferenceResult {
    petTypes: PetTypeName[];
    lifeStages: LifeStage[];
    sizeClasses: SizeClass[];
    specialNeeds: SpecialNeed[];
    minWeightLbs: number | null;
    maxWeightLbs: number | null;
}

const PET_TYPE_PATTERNS: Record<PetTypeName, RegExp> = {
    'Dog': /\b(dog|dogs|puppy|puppies|canine|k9|k-9|pup)\b/i,
    'Cat': /\b(cat|cats|kitten|kittens|feline|kitty)\b/i,
    'Bird': /\b(bird|birds|parrot|parakeet|cockatiel|finch|avian|budgie|cockatoo|macaw|lovebird)\b/i,
    'Fish': /\b(fish|aquarium|aquatic|pond|koi|goldfish|betta|tropical fish|freshwater|saltwater|marine)\b/i,
    'Reptile': /\b(reptile|reptiles|snake|snakes|lizard|lizards|turtle|turtles|tortoise|gecko|bearded dragon|iguana)\b/i,
    'Small Animal': /\b(rabbit|rabbits|hamster|hamsters|guinea pig|gerbil|ferret|ferrets|small animal|chinchilla|mouse|mice|rat|rats)\b/i,
    'Horse': /\b(horse|horses|equine|pony|ponies|mare|stallion|foal|equestrian)\b/i,
    'Livestock': /\b(chicken|chickens|poultry|goat|goats|sheep|cattle|cow|cows|pig|pigs|livestock|farm animal|duck|ducks|turkey|turkeys)\b/i,
};

const LIFE_STAGE_PATTERNS: Record<LifeStage, RegExp> = {
    'puppy': /\b(puppy|puppies|kitten|kittens|baby|junior|starter|young|growth)\b/i,
    'adult': /\b(adult|maintenance)\b/i,
    'senior': /\b(senior|mature|older|aging|7\+|11\+|geriatric)\b/i,
    'all': /\b(all (life )?stages?|all ages?)\b/i,
};

const SIZE_CLASS_PATTERNS: Record<SizeClass, RegExp> = {
    'small': /\b(small breed|toy breed|small dog|mini|miniature|under 20\s*lb|5-20\s*lb|teacup)\b/i,
    'medium': /\b(medium breed|medium dog|20-50\s*lb|mid-size)\b/i,
    'large': /\b(large breed|large dog|50-100\s*lb|big dog)\b/i,
    'giant': /\b(giant breed|extra large|100\+\s*lb|xl breed|x-large)\b/i,
    'all': /\b(all (breed )?sizes?|any size)\b/i,
};

const SPECIAL_NEED_PATTERNS: Record<SpecialNeed, RegExp> = {
    'grain-free': /\b(grain[- ]?free|no grain)\b/i,
    'sensitive-stomach': /\b(sensitive stomach|digestive|easy digest|gentle formula)\b/i,
    'weight-management': /\b(weight (management|control)|healthy weight|low calorie|lite|light|diet)\b/i,
    'high-protein': /\b(high[- ]?protein|protein[- ]?rich)\b/i,
    'limited-ingredient': /\b(limited ingredient|simple recipe|single protein)\b/i,
    'dental-care': /\b(dental|teeth|oral care|tartar)\b/i,
    'joint-support': /\b(joint|hip|glucosamine|mobility|arthritis)\b/i,
    'skin-coat': /\b(skin|coat|fur|omega|shiny coat)\b/i,
};

const WEIGHT_RANGE_PATTERNS = [
    { pattern: /\b(\d+)\s*-\s*(\d+)\s*lb/i, minIdx: 1, maxIdx: 2 },
    { pattern: /\bunder\s*(\d+)\s*lb/i, minIdx: null, maxIdx: 1 },
    { pattern: /\bover\s*(\d+)\s*lb/i, minIdx: 1, maxIdx: null },
    { pattern: /\b(\d+)\+\s*lb/i, minIdx: 1, maxIdx: null },
    { pattern: /\bup to\s*(\d+)\s*lb/i, minIdx: null, maxIdx: 1 },
];

function buildSearchableText(product: ShopSiteProduct): string {
    const parts = [
        product.name,
        product.description,
        product.categoryName,
        product.productTypeName,
        product.moreInfoText,
        product.searchKeywords,
        ...(product.shopsitePages || []),
    ];
    return parts.filter(Boolean).join(' ');
}

function extractWeightRange(text: string): { min: number | null; max: number | null } {
    for (const { pattern, minIdx, maxIdx } of WEIGHT_RANGE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            const min = minIdx !== null ? parseInt(match[minIdx], 10) : null;
            const max = maxIdx !== null ? parseInt(match[maxIdx], 10) : null;
            return { min, max };
        }
    }
    return { min: null, max: null };
}

export function inferPetTypes(product: ShopSiteProduct): PetTypeInferenceResult {
    const text = buildSearchableText(product);
    
    const petTypes: PetTypeName[] = [];
    for (const [petType, pattern] of Object.entries(PET_TYPE_PATTERNS)) {
        if (pattern.test(text)) {
            petTypes.push(petType as PetTypeName);
        }
    }

    const lifeStages: LifeStage[] = [];
    for (const [stage, pattern] of Object.entries(LIFE_STAGE_PATTERNS)) {
        if (pattern.test(text)) {
            lifeStages.push(stage as LifeStage);
        }
    }

    const sizeClasses: SizeClass[] = [];
    for (const [size, pattern] of Object.entries(SIZE_CLASS_PATTERNS)) {
        if (pattern.test(text)) {
            sizeClasses.push(size as SizeClass);
        }
    }

    const specialNeeds: SpecialNeed[] = [];
    for (const [need, pattern] of Object.entries(SPECIAL_NEED_PATTERNS)) {
        if (pattern.test(text)) {
            specialNeeds.push(need as SpecialNeed);
        }
    }

    const weightRange = extractWeightRange(text);

    return {
        petTypes,
        lifeStages: lifeStages.length > 0 ? lifeStages : ['all'],
        sizeClasses: sizeClasses.length > 0 ? sizeClasses : ['all'],
        specialNeeds,
        minWeightLbs: weightRange.min,
        maxWeightLbs: weightRange.max,
    };
}

export function inferPetTypesFromText(text: string): PetTypeName[] {
    const petTypes: PetTypeName[] = [];
    for (const [petType, pattern] of Object.entries(PET_TYPE_PATTERNS)) {
        if (pattern.test(text)) {
            petTypes.push(petType as PetTypeName);
        }
    }
    return petTypes;
}
