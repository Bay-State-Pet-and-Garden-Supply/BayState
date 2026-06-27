export const FLAVOR_WORDS = [
    'beef', 'chicken', 'chkn', 'lamb', 'whitefish', 'fish', 'salmon', 'tuna', 'cod', 'trout',
    'turkey', 'trky', 'duck', 'venison', 'pork', 'rabbit', 'bison', 'boar',
    'strawberry', 'strwb', 'blueberry', 'blubry', 'apple', 'banana', 'peanut', 'pumpkin', 'cheese'
];

export const FORMAT_WORDS = [
    'sticks', 'stick', 'stix', 'bites', 'bite', 'strips', 'strip', 'rolls', 'roll',
    'chews', 'chew', 'bones', 'bone', 'braids', 'braid', 'pates', 'pate', 'stews', 'stew',
    'puffs', 'puff', 'shreds', 'shredded'
];

export const FLAVOR_CLASSES = [
    ['beef'],
    ['chicken', 'chkn'],
    ['lamb'],
    ['whitefish', 'fish'],
    ['salmon'],
    ['tuna'],
    ['cod'],
    ['trout'],
    ['turkey', 'trky'],
    ['duck'],
    ['venison'],
    ['pork'],
    ['rabbit'],
    ['bison'],
    ['boar'],
    ['strawberry', 'strwb'],
    ['blueberry', 'blubry'],
    ['apple'],
    ['banana'],
    ['peanut', 'peanutbutter'],
    ['pumpkin'],
    ['cheese']
];

export const FORMAT_CLASSES = [
    ['sticks', 'stick', 'stix'],
    ['bites', 'bite'],
    ['strips', 'strip'],
    ['rolls', 'roll'],
    ['chews', 'chew'],
    ['bones', 'bone'],
    ['braids', 'braid'],
    ['pates', 'pate'],
    ['stews', 'stew'],
    ['puffs', 'puff'],
    ['shreds', 'shredded']
];

/** Normalize a label for dedup matching: lowercase, strip non-alphanumeric, collapse whitespace. */
export function normalizeProductLineKey(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s+/g, '');
}

/** Simple Levenshtein distance for fuzzy matching. */
export function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/** Compute similarity as 1 - (distance / max length). */
export function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
}

/** Strip common trailing format words recursively. */
export function getCoreNormalizedKey(key: string): string {
    let core = key;
    const suffixes = [
        'rolls', 'roll', 'stix', 'chews', 'chew', 'bones', 'bone',
        'braids', 'braid', 'strips', 'strip', 'bites', 'bite',
        'pates', 'pate', 'stews', 'stew', 'treats', 'treat',
        'foods', 'food', 'formulas', 'formula', 'recipes', 'recipe',
        'toys', 'toy', 'wholesome', 'natural', 'organic', 'puffs', 'puff'
    ];
    
    let stripped = true;
    while (stripped) {
        stripped = false;
        for (const suffix of suffixes) {
            if (core.endsWith(suffix) && core.length > suffix.length) {
                core = core.slice(0, -suffix.length);
                stripped = true;
                break;
            }
        }
    }
    return core;
}

/** Detect if there is a mismatch in flavor or format terms. */
export function hasTermMismatch(keyA: string, keyB: string, nameA?: string, nameB?: string): boolean {
    const labelA = nameA || keyA;
    const labelB = nameB || keyB;

    const getTokens = (label: string): string[] => {
        return label
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
    };

    const tokensA = getTokens(labelA);
    const tokensB = getTokens(labelB);

    const getMatchedClasses = (tokens: string[], rawLabel: string, classes: string[][]): Set<number> => {
        const matched = new Set<number>();
        const hasSpaces = rawLabel.includes(' ');

        for (let i = 0; i < classes.length; i++) {
            const equivalenceClass = classes[i];
            if (hasSpaces) {
                if (equivalenceClass.some(word => tokens.includes(word))) {
                    matched.add(i);
                }
            } else {
                // Fallback for space-less keys (tests only)
                if (equivalenceClass.some(word => {
                    // Protect against chew matching inside chewy
                    if (word === 'chew' && rawLabel.includes('chewy') && !rawLabel.includes('chewystix') && !rawLabel.includes('chewychew')) {
                        const idx = rawLabel.indexOf('chew');
                        if (idx !== -1 && rawLabel.slice(idx, idx + 5) === 'chewy') {
                            const lastIdx = rawLabel.lastIndexOf('chew');
                            if (lastIdx === idx || rawLabel.slice(lastIdx, lastIdx + 5) === 'chewy') {
                                return false; // Only matched 'chewy', not 'chew'
                            }
                        }
                    }
                    return rawLabel.includes(word);
                })) {
                    matched.add(i);
                }
            }
        }
        return matched;
    };

    const checkMismatch = (classes: string[][]): boolean => {
        const matchedA = getMatchedClasses(tokensA, labelA, classes);
        const matchedB = getMatchedClasses(tokensB, labelB, classes);

        const hasA = matchedA.size > 0;
        const hasB = matchedB.size > 0;

        if (hasA !== hasB) {
            return true;
        }

        if (hasA && hasB) {
            const hasIntersection = Array.from(matchedA).some(idx => matchedB.has(idx));
            if (!hasIntersection) {
                return true;
            }
        }

        return false;
    };

    return checkMismatch(FLAVOR_CLASSES) || checkMismatch(FORMAT_CLASSES);
}

/** Check if two normalized keys match (fuzzy, substring, or exact). */
export function checkFuzzyMatch(
    keyA: string,
    keyB: string,
    nameA?: string,
    nameB?: string
): { similarity: number; autoMerge: boolean } {
    if (keyA === keyB) {
        return { similarity: 1.0, autoMerge: true };
    }

    if (hasTermMismatch(keyA, keyB, nameA, nameB)) {
        return { similarity: 0, autoMerge: false };
    }

    const coreA = getCoreNormalizedKey(keyA);
    const coreB = getCoreNormalizedKey(keyB);

    if (coreA === coreB && coreA.length >= 3) {
        return { similarity: 0.96, autoMerge: true };
    }

    const simFull = similarity(keyA, keyB);
    const simCore = similarity(coreA, coreB);
    const maxSim = Math.max(simFull, simCore);

    // Check if one is a core substring of the other (with min length to prevent overly broad matches)
    const isCoreSubstring = (coreA.length >= 6 && coreB.length >= 6) && 
        (coreA.includes(coreB) || coreB.includes(coreA));

    if (maxSim >= 0.92 || (isCoreSubstring && maxSim >= 0.85)) {
        return { similarity: maxSim, autoMerge: true };
    }

    if (maxSim >= 0.80 || isCoreSubstring) {
        return { similarity: maxSim, autoMerge: false };
    }

    return { similarity: maxSim, autoMerge: false };
}
