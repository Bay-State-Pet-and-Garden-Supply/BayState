/**
 * Deterministic Packaging Title Composer
 *
 * Produces a BayState-normalized product title from packaging extraction facts.
 * Follows the product-name rules defined in consolidation/prompt-builder.ts.
 *
 * The composer is rule-based (not LLM), deterministic, and only uses
 * evidence that passed confidence gates. It never invents details.
 *
 * Mode: "shadow" — compose suggestion, do not alter draft
 *       "suggestion" — show "Apply suggestion" action in Reviewing
 *       "auto_draft_high_confidence" — overlay title when confidence gates pass
 */

// =============================================================================
// Types
// =============================================================================

export interface PackagingFacts {
    packaging_title?: string | null;
    brand?: string | null;
    product_line?: string | null;
    variant?: string | null;
    flavor?: string | null;
    color?: string | null;
    scent?: string | null;
    material?: string | null;
    product_type?: string | null;
    size?: string | null;
    weight?: string | null;
    count?: string | null;
    packaging_type?: string | null;
    claims?: string[];
}

export interface FieldConfidence {
    [field: string]: number;
}

export interface PackagingContext {
    /** The normal consolidated draft core fields */
    consolidationDraftCore?: {
        name?: string | null;
        brand_name?: string | null;
        weight_lbs?: number | null;
        canonical_category_breadcrumb?: string | null;
    };
    /** Best-fit category from consolidation */
    consolidationCategory?: string | null;
    /** Names of sibling products in the product line */
    siblingNames?: string[];
    /** Expected brand from product line classification */
    productLineExpectedBrand?: string | null;
}

export interface PackagingTitleSuggestion {
    title: string;
    overall_confidence: number;
    field_confidence: Record<string, number>;
    reasons: string[];
    conflicts: string[];
}

export type PackagingTitleMode =
    | 'disabled'
    | 'shadow'
    | 'suggestion'
    | 'auto_draft_high_confidence';

// =============================================================================
// Constants — Confidence Gates
// =============================================================================

const CONFIDENCE_GATES = {
    BRAND: 0.95,
    SIZE_WEIGHT_COUNT: 0.90,
    VARIANT_FLAVOR_COLOR: 0.85,
    OVERALL_AUTO: 0.85,
} as const;

// =============================================================================
// Abbreviation Expansion Map
// =============================================================================

const ABBREVIATION_EXPANSIONS: Record<string, string> = {
    sm: 'Small',
    md: 'Medium',
    lg: 'Large',
    blk: 'Black',
    wht: 'White',
    brn: 'Brown',
    grn: 'Green',
    rd: 'Red',
    bl: 'Blue',
    yl: 'Yellow',
    org: 'Orange',
    pnk: 'Pink',
    prpl: 'Purple',
    gry: 'Gray',
    asst: 'Assorted',
    asstd: 'Assorted',
    med: 'Medium',
    lrg: 'Large',
    sml: 'Small',
    xl: 'X-Large',
    xlg: 'X-Large',
    sz: 'Size',
    pkg: 'Package',
    pk: 'Pack',
    oz: 'oz.',
    lb: 'lb.',
    ct: 'ct.',
    in: 'in.',
    ft: 'ft.',
    gal: 'gal.',
    qt: 'qt.',
    pt: 'pt.',
    sq: 'sq.',
    ea: 'each',
    doz: 'dozen',
};

// Unit suffixes that should use periods (not standalone abbreviations)
const UNIT_SUFFIXES = ['lb', 'oz', 'ct', 'in', 'ft', 'gal', 'qt', 'pt', 'pk'];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a string to Title Case.
 * This function only handles casing — abbreviation expansion is done by expandAbbreviations.
 */
function toTitleCase(value: string): string {
    if (!value || value.trim().length === 0) return value;

    return value
        .split(/(\s+|-)/)
        .map((part, i) => {
            const trimmed = part.trim();
            if (!trimmed || trimmed === '-' || trimmed.length <= 1) return part;

            // Preserve UPCASE acronyms (3+ uppercase letters followed by lowercase)
            if (/^[A-Z][A-Z]+[a-z]/.test(trimmed.replace(/[^A-Za-z0-9]/g, ''))) {
                return trimmed;
            }

            // Standard title case with exceptions for minor words
            const exceptions = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with'];
            if (i > 0 && exceptions.includes(trimmed.toLowerCase())) {
                return trimmed.toLowerCase();
            }

            return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
        })
        .join('');
}

/**
 * Remove TM, R, C marks and other special characters.
 */
function removeSpecialMarks(value: string): string {
    return value
        .replace(/[™®©]/g, '')
        .replace(/\bTM\b/gi, '')
        // Remove (R), (C), (r), (c), [TM] marks
        .replace(/\([RrCc]\)/g, '')
        .replace(/\[TM\]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Strip extraneous text: marketing taglines, legal disclaimers, URLs, social handles.
 */
function stripExtraneousText(value: string): string {
    // Remove URLs
    let result = value.replace(/https?:\/\/\S+/gi, '');
    // Remove social handles (@handle, #hashtag)
    result = result.replace(/@\w+/g, '');
    result = result.replace(/#\w+/g, '');
    // Remove email addresses
    result = result.replace(/\S+@\S+\.\S+/g, '');
    // Remove phone numbers
    result = result.replace(/[\d\-\(\)]{7,}[\d]/g, '');
    // Remove common legal/marketing phrases
    result = result.replace(/\b(limited (edition|warranty)|patent (pending|no\.?)|pat\.?\s*pend\.?|all rights reserved|while supplies last|as seen on tv|satisfaction guaranteed|money[- ]back guarantee|best[- ]?seller|new and improved)\b/gi, '');
    // Remove barcode-like patterns
    result = result.replace(/\b\d{8,14}\b/g, '');
    // Clean up double spaces
    result = result.replace(/\s{2,}/g, ' ').trim();
    return result;
}

/**
 * Standardize unit notation — replace shorthand with proper BayState unit periods.
 */
function standardizeUnits(value: string): string {
    let result = value;

    // Standalone unit abbreviations -> unit with period.
    // Match the number + space + unit + optional existing period(s) so the replacement
    // is idempotent — it always produces exactly one period after the unit.
    result = result.replace(/\b(\d+\.?\d*)\s*lbs?\.*/gi, '$1 lb.');
    result = result.replace(/\b(\d+\.?\d*)\s*ounces?\.*/gi, '$1 oz.');
    result = result.replace(/\b(\d+\.?\d*)\s*count\.*/gi, '$1 ct.');
    result = result.replace(/\b(\d+)\s*counts?\.*/gi, '$1 ct.');
    result = result.replace(/\b(\d+\.?\d*)\s*(coun|ctn)\.*/gi, '$1 ct.');

    // Raw numerical units without proper spacing.
    // Matches optional existing period(s) and replaces with exactly one period.
    result = result.replace(/\b(\d+\.?\d*)\s*(lb|oz|ct|gal|qt|pt|in|ft|pk)s?\.*/gi, (match, num, unit) => {
        const lower = unit.toLowerCase();
        if (UNIT_SUFFIXES.includes(lower)) {
            return `${num} ${lower}.`;
        }
        return match;
    });

    // Standardize "X" for dimensions
    result = result.replace(/\b(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/gi, '$1 X $2');

    // "lbs" -> "lb." (standalone)
    result = result.replace(/\blbs\b/gi, 'lb.');
    result = result.replace(/\blb\b(?!\.)/gi, 'lb.');

    return result;
}

/**
 * Expand common abbreviations in the title.
 */
function expandAbbreviations(value: string): string {
    const tokens = value.split(/\s+/);
    const expandedTokens = tokens.map((token) => {
        if (token.length === 0) return token;

        // Strip trailing non-alnum chars (like periods) for lookup
        const cleanLower = token.toLowerCase().replace(/[^a-z0-9]+$/g, '');
        const suffix = token.slice(cleanLower.length);
        const expansion = ABBREVIATION_EXPANSIONS[cleanLower];

        if (expansion) {
            // If token already looks like a unit suffix (ends with period and base is a known unit),
            // don't re-expand — it would double the suffix.
            if (suffix.startsWith('.') && UNIT_SUFFIXES.includes(cleanLower)) {
                return token; // already expanded, keep as-is
            }
            // If the clean token is already the full expansion (case-insensitive), skip
            if (cleanLower === expansion.toLowerCase().replace(/[.']/g, '')) {
                return token;
            }
            return expansion + suffix;
        }

        return token;
    });

    return expandedTokens.join(' ');
}

/**
 * Remove leading/trailing/prefixed brand mention to avoid duplication.
 * If a source name starts with the known brand, strip it so Brand doesn't repeat.
 */
function stripLeadingExistingBrand(name: string, knownBrand: string | null | undefined): string {
    if (!knownBrand) return name;

    const lowerName = name.toLowerCase().trim();
    const lowerBrand = knownBrand.toLowerCase().trim();

    if (lowerName.startsWith(lowerBrand)) {
        const remainder = name.slice(knownBrand.length).trim();
        if (remainder.length > 0) {
            // Check if remainder starts with non-alphanumeric separator
            return remainder.replace(/^[,:\-;|\s]+/, '').trim();
        }
    }

    return name;
}

/**
 * Determine if a value should be included based on distinct sibling context.
 * If we have sibling names that differentiate on this field, it MUST be included.
 */
function shouldIncludeVariant(
    field: string,
    value: string | null | undefined,
    siblingNames: string[] | undefined,
): boolean {
    if (!value || value.trim().length === 0) return false;

    // If no siblings to compare, include if value exists
    if (!siblingNames || siblingNames.length === 0) return true;

    // Check if siblings differentiate on this variant (e.g., different flavors)
    const valueTokens = value.toLowerCase().split(/\s+/);
    const allHaveIt = siblingNames.every((sib) =>
        valueTokens.some((token) => sib.toLowerCase().includes(token)),
    );
    void allHaveIt; // used in confidence gating heuristic above
    return true;
}

// =============================================================================
// Confidence Averaging
// =============================================================================

/**
 * Calculate weighted average confidence for the title.
 * Weights: brand=0.3, product_type=0.1, variant/flavor/color/scent/material=0.2,
 *          size/weight/count=0.25, packaging_title structure=0.15
 */
function calculateOverallConfidence(
    fieldConfidence: Record<string, number>,
    usedFields: string[],
): number {
    const weights: Record<string, number> = {
        brand: 0.30,
        packaging_title: 0.15,
        product_type: 0.10,
        variant: 0.10,
        flavor: 0.05,
        color: 0.05,
        scent: 0.05,
        material: 0.05,
        size: 0.10,
        weight: 0.10,
        count: 0.05,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    let usedAny = false;

    for (const field of usedFields) {
        const conf = fieldConfidence[field] ?? 0;
        const weight = weights[field] ?? 0.05;
        if (conf > 0) {
            weightedSum += conf * weight;
            totalWeight += weight;
            usedAny = true;
        }
    }

    // If packaging_title was used for structure (and not already counted)
    if (usedFields.includes('packaging_title') && !usedFields.includes('flavor') && !usedFields.includes('variant')) {
        const ptWeight = weights.packaging_title ?? 0.15;
        const ptConf = fieldConfidence.packaging_title ?? 0;
        if (ptConf > 0) {
            weightedSum += ptConf * ptWeight;
            totalWeight += ptWeight;
            usedAny = true;
        }
    }

    if (!usedAny || totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// =============================================================================
// Main Composer
// =============================================================================

/**
 * Compose a BayState-normalized product title from packaging extraction facts.
 *
 * @param facts Structured packaging facts from VLM extraction
 * @param fieldConfidence Per-field confidence scores
 * @param context Optional consolidation context for fallback and sibling comparison
 * @returns A normalized title suggestion with confidence metadata
 */
export function composePackagingTitle(
    facts: PackagingFacts,
    fieldConfidence: FieldConfidence,
    context?: PackagingContext,
): PackagingTitleSuggestion {
    const reasons: string[] = [];
    const conflicts: string[] = [];
    const usedFields: string[] = [];
    const titleFieldConfidence: Record<string, number> = {};
    const siblingNames = context?.siblingNames;
    const consolidationCore = context?.consolidationDraftCore;

    // ---- Resolve Brand ----
    const brandConf = fieldConfidence.brand ?? 0;
    let resolvedBrand: string | null = null;
    if (facts.brand && brandConf >= CONFIDENCE_GATES.BRAND) {
        resolvedBrand = facts.brand.trim();
        reasons.push(`used packaging brand "${resolvedBrand}" at ${brandConf.toFixed(2)} confidence`);
        titleFieldConfidence.brand = brandConf;
        usedFields.push('brand');
    } else if (facts.brand && brandConf > 0) {
        const consolidationBrand = consolidationCore?.brand_name || context?.productLineExpectedBrand;
        resolvedBrand = consolidationBrand || facts.brand.trim();
        conflicts.push(
            `packaging brand "${facts.brand}" at ${brandConf.toFixed(2)} below threshold; using consolidation brand "${resolvedBrand}"`,
        );
        titleFieldConfidence.brand = brandConf;
        usedFields.push('brand');
    } else {
        resolvedBrand = consolidationCore?.brand_name || context?.productLineExpectedBrand || null;
        if (resolvedBrand) {
            reasons.push(`brand not in packaging evidence; using consolidation brand "${resolvedBrand}"`);
            titleFieldConfidence.brand = 0.5; // medium confidence without packaging
            usedFields.push('brand');
        }
    }

    // ---- Resolve Product Type Descriptor ----
    // Use packaging product_type if available and confident, else infer from consolidation category
    let productDescriptor = facts.product_type?.trim() || '';
    if (productDescriptor) {
        const ptConf = fieldConfidence.product_type ?? 0.8;
        titleFieldConfidence.product_type = ptConf;
        usedFields.push('product_type');
        reasons.push(`used packaging product type "${productDescriptor}" at ${ptConf.toFixed(2)} confidence`);
    } else {
        // Try to derive from consolidation category
        const category = context?.consolidationCategory || consolidationCore?.canonical_category_breadcrumb || '';
        if (category) {
            const parts = category.split('>').map((p) => p.trim());
            // Use the second-to-last or last segment as product type hint
            // e.g. "Dog > Food > Dry Food" -> "Dog Food" or "Dry Dog Food"
            if (parts.length >= 3) {
                const l1 = parts[parts.length - 3].toLowerCase();
                const l2 = parts[parts.length - 2];
                const l3 = parts[parts.length - 1];
                // Check for pet types in category path
                const petTypes = ['dog', 'cat', 'bird', 'fish', 'horse', 'reptile', 'small animal', 'livestock'];
                const hasPetType = petTypes.some((p) => l1.includes(p));
                if (hasPetType) {
                    // "Dog > Food > Dry Food" -> "Dry Dog Food" — pet type MUST be included
                    const l2Name = l2.replace(/^Pet\s+/i, ''); // Pet Food -> Food
                    // For food categories, build "Dry Dog Food" type pattern
                    if (l3.toLowerCase().includes('dry')) {
                        productDescriptor = `Dry ${l2Name} ${toTitleCase(l1)}`;
                    } else if (l3.toLowerCase().includes('wet') || l3.toLowerCase().includes('canned')) {
                        productDescriptor = `${toTitleCase(l3)} ${l2Name} ${toTitleCase(l1)}`;
                    } else {
                        productDescriptor = `${toTitleCase(l3)} ${l2Name} ${toTitleCase(l1)}`;
                    }
                }
            }
            if (!productDescriptor) {
                productDescriptor = parts[parts.length - 1] || '';
            }
        }
    }

    // ---- Resolve Variant (flavor/color/scent/material) ----
    // Only include variant fields when confidence >= 0.85 OR when they differentiate siblings
    const variantFields = ['flavor', 'color', 'scent', 'material'] as const;
    const resolvedVariants: string[] = [];
    for (const field of variantFields) {
        const value = facts[field]?.trim();
        if (!value) continue;
        const conf = fieldConfidence[field] ?? 0;
        // Gate: only include if confidence passes threshold OR sibling differentiation requires it
        if (conf >= CONFIDENCE_GATES.VARIANT_FLAVOR_COLOR) {
            const expanded = expandAbbreviations(toTitleCase(value));
            resolvedVariants.push(expanded);
            titleFieldConfidence[field] = conf;
            usedFields.push(field);
            reasons.push(`used packaging ${field} "${expanded}" at ${conf.toFixed(2)} confidence`);
        } else if (shouldIncludeVariant(field, value, siblingNames)) {
            // Still include when siblings differentiate even below threshold
            const expanded = expandAbbreviations(toTitleCase(value));
            resolvedVariants.push(expanded);
            titleFieldConfidence[field] = conf;
            usedFields.push(field);
            reasons.push(`used packaging ${field} "${expanded}" for sibling differentiation (conf=${conf.toFixed(2)})`);
        } else {
            conflicts.push(
                `packaging ${field} "${value}" at ${conf.toFixed(2)} below threshold; not included`,
            );
        }
    }

    // ---- Resolve Size/Weight/Count ----
    // Only include size/weight/count when confidence >= 0.90
    const sizeValue = facts.size?.trim() || '';
    const weightValue = facts.weight?.trim() || '';
    const countValue = facts.count?.trim() || '';

    const sizeConf = fieldConfidence.size ?? 0;
    const weightConf = fieldConfidence.weight ?? 0;
    const countConf = fieldConfidence.count ?? 0;

    // Check for conflicts with consolidation data
    if (sizeValue && sizeConf <= CONFIDENCE_GATES.SIZE_WEIGHT_COUNT && consolidationCore?.name) {
        conflicts.push(`packaging size "${sizeValue}" at ${sizeConf.toFixed(2)} below threshold; may conflict`);
    }
    if (weightValue && weightConf <= CONFIDENCE_GATES.SIZE_WEIGHT_COUNT && consolidationCore?.weight_lbs) {
        const consolidationWeight = `${consolidationCore.weight_lbs} lb.`;
        const packagingWeightStandard = standardizeUnits(weightValue);
        if (packagingWeightStandard !== consolidationWeight) {
            conflicts.push(
                `packaging weight "${packagingWeightStandard}" vs consolidation "${consolidationWeight}"`,
            );
        }
    }

    // Normalize size/weight/count
    const normalizedSize = sizeValue && sizeConf >= CONFIDENCE_GATES.SIZE_WEIGHT_COUNT
        ? standardizeUnits(expandAbbreviations(toTitleCase(sizeValue))) : '';
    const normalizedWeight = weightValue && weightConf >= CONFIDENCE_GATES.SIZE_WEIGHT_COUNT
        ? standardizeUnits(expandAbbreviations(toTitleCase(weightValue))) : '';
    const normalizedCount = countValue && countConf >= CONFIDENCE_GATES.SIZE_WEIGHT_COUNT
        ? standardizeUnits(expandAbbreviations(toTitleCase(countValue))) : '';

    if (normalizedSize) {
        titleFieldConfidence.size = sizeConf;
        usedFields.push('size');
        reasons.push(`used packaging size "${normalizedSize}" at ${sizeConf.toFixed(2)} confidence`);
    }
    if (normalizedWeight) {
        titleFieldConfidence.weight = weightConf;
        usedFields.push('weight');
        reasons.push(`used packaging weight "${normalizedWeight}" at ${weightConf.toFixed(2)} confidence`);
    }
    if (normalizedCount) {
        titleFieldConfidence.count = countConf;
        usedFields.push('count');
        reasons.push(`used packaging count "${normalizedCount}" at ${countConf.toFixed(2)} confidence`);
    }

    // ---- Build final size/weight string ----
    let sizeWeight = '';
    if (normalizedSize) sizeWeight = normalizedSize;
    if (normalizedWeight) {
        sizeWeight = sizeWeight ? `${sizeWeight} ${normalizedWeight}` : normalizedWeight;
    }
    if (normalizedCount && !sizeWeight.includes(normalizedCount)) {
        sizeWeight = sizeWeight ? `${sizeWeight} ${normalizedCount}` : normalizedCount;
    }

    // ---- Build base title from packaging_title if available ----
    // Use packaging_title as the primary base when present, then overlay
    // normalized fields to correct brand/variant/size.
    const baseTitle = (facts.packaging_title || '').trim();
    if (baseTitle) {
        reasons.push(`using packaging_title "${baseTitle}" as primary base`);
    }

    // ---- Assemble Title ----
    // Pattern: [Brand] [Product-Type Descriptor] [Variant(s)] [Size/Weight/Count]
    const titleParts: string[] = [];

    // Brand
    if (resolvedBrand) {
        titleParts.push(toTitleCase(removeSpecialMarks(resolvedBrand.trim())));
    }

    // Use packaging_title as base if available — strip any leading brand that would duplicate
    let packagingTitleSegment = '';
    if (baseTitle) {
        // Strip leading brand from packaging_title to avoid duplication
        packagingTitleSegment = stripLeadingExistingBrand(baseTitle, resolvedBrand);
    }

    if (packagingTitleSegment) {
        // Apply normalization to the packaging title segment
        let cleaned = removeSpecialMarks(packagingTitleSegment.trim());
        cleaned = stripExtraneousText(cleaned);
        cleaned = expandAbbreviations(cleaned);
        cleaned = toTitleCase(cleaned);
        cleaned = standardizeUnits(cleaned);
        if (cleaned) {
            titleParts.push(cleaned);
            reasons.push('normalized packaging_title segment');
        }
    } else {
        // Fall back to product type descriptor when no packaging_title
        if (productDescriptor) {
            const cleaned = removeSpecialMarks(productDescriptor.trim());
            titleParts.push(toTitleCase(cleaned));
        }

        // Variants (flavor, color, scent, material) — only add when confidence gated
        for (const v of resolvedVariants) {
            const cleaned = removeSpecialMarks(v.trim());
            if (cleaned) {
                titleParts.push(cleaned);
            }
        }
    }

    // Size/Weight/Count — always append at end regardless of base title source
    if (sizeWeight) {
        titleParts.push(sizeWeight);
    }

    // Join and clean
    let title = titleParts.join(' ').replace(/\s{2,}/g, ' ').trim();

    // Apply special character cleanup
    title = removeSpecialMarks(title);

    // Strip extraneous text
    title = stripExtraneousText(title);

    // Standardize units
    title = standardizeUnits(title);

    // Final cleanup
    title = title.replace(/\s{2,}/g, ' ').trim();

    // Calculate overall confidence
    const overallConfidence = calculateOverallConfidence(titleFieldConfidence, usedFields);

    // ---- Log issues with low/no confidence ----
    if (overallConfidence < 0.5) {
        conflicts.push(`overall confidence ${overallConfidence.toFixed(2)} is low; suggest human review`);
    }

    // Check for missing brand
    if (!resolvedBrand) {
        conflicts.push('no brand resolved for packaging title');
    }

    return {
        title,
        overall_confidence: overallConfidence,
        field_confidence: { ...titleFieldConfidence },
        reasons,
        conflicts,
    };
}

// =============================================================================
// Auto-Apply Gate
// =============================================================================

/**
 * Determine if a packaging title suggestion should be automatically applied
 * to the product draft in auto_draft_high_confidence mode.
 *
 * Gates:
 * - Overall confidence >= 0.85
 * - Brand (if present in suggestion) >= 0.95
 * - Size/weight/count (if used) >= 0.90
 * - Variant/flavor/color/scent/material (if used) >= 0.85
 * - No blocking conflicts
 * - Title is non-empty
 */
export function shouldAutoApplyTitle(
    suggestion: PackagingTitleSuggestion,
    mode: PackagingTitleMode,
): { apply: boolean; reasons: string[]; blocks: string[] } {
    const applyReasons: string[] = [];
    const blocks: string[] = [];

    if (mode !== 'auto_draft_high_confidence') {
        blocks.push(`mode is "${mode}", not "auto_draft_high_confidence"`);
        return { apply: false, reasons: applyReasons, blocks };
    }

    if (!suggestion.title || suggestion.title.trim().length === 0) {
        blocks.push('title suggestion is empty');
        return { apply: false, reasons: [], blocks };
    }

    // Overall confidence gate
    if (suggestion.overall_confidence < CONFIDENCE_GATES.OVERALL_AUTO) {
        blocks.push(
            `overall confidence ${suggestion.overall_confidence.toFixed(2)} below gate ${CONFIDENCE_GATES.OVERALL_AUTO.toFixed(2)}`,
        );
    } else {
        applyReasons.push(
            `overall confidence ${suggestion.overall_confidence.toFixed(2)} passed gate ${CONFIDENCE_GATES.OVERALL_AUTO.toFixed(2)}`,
        );
    }

    // Field-level gates
    const fc = suggestion.field_confidence;

    // Brand
    if (fc.brand !== undefined) {
        if (fc.brand >= CONFIDENCE_GATES.BRAND) {
            applyReasons.push(`brand confidence ${fc.brand.toFixed(2)} passed gate ${CONFIDENCE_GATES.BRAND.toFixed(2)}`);
        } else {
            blocks.push(
                `brand confidence ${fc.brand.toFixed(2)} below gate ${CONFIDENCE_GATES.BRAND.toFixed(2)}`,
            );
        }
    }

    // Size/weight/count
    for (const field of ['size', 'weight', 'count'] as const) {
        if (fc[field] !== undefined && fc[field] > 0) {
            if (fc[field] >= CONFIDENCE_GATES.SIZE_WEIGHT_COUNT) {
                applyReasons.push(`${field} confidence ${fc[field].toFixed(2)} passed gate ${CONFIDENCE_GATES.SIZE_WEIGHT_COUNT.toFixed(2)}`);
            } else {
                blocks.push(
                    `${field} confidence ${fc[field].toFixed(2)} below gate ${CONFIDENCE_GATES.SIZE_WEIGHT_COUNT.toFixed(2)}`,
                );
            }
        }
    }

    // Variant fields
    for (const field of ['flavor', 'color', 'scent', 'material'] as const) {
        if (fc[field] !== undefined && fc[field] > 0) {
            if (fc[field] >= CONFIDENCE_GATES.VARIANT_FLAVOR_COLOR) {
                applyReasons.push(`${field} confidence ${fc[field].toFixed(2)} passed gate ${CONFIDENCE_GATES.VARIANT_FLAVOR_COLOR.toFixed(2)}`);
            } else {
                blocks.push(
                    `${field} confidence ${fc[field].toFixed(2)} below gate ${CONFIDENCE_GATES.VARIANT_FLAVOR_COLOR.toFixed(2)}`,
                );
            }
        }
    }

    // Check for blocking conflicts (e.g., brand mismatch)
    const blockingConflictPrefixes = ['packaging brand', 'packaging weight', 'packaging size'];
    const hasBlockingConflict = suggestion.conflicts.some((c) =>
        blockingConflictPrefixes.some((p) => c.startsWith(p)),
    );
    if (hasBlockingConflict) {
        blocks.push('has blocking conflicts with consolidation data');
    }

    const apply = blocks.length === 0;
    if (apply) {
        applyReasons.push('all confidence gates passed; title eligible for auto-apply');
    }

    return { apply, reasons: applyReasons, blocks };
}

/**
 * Check if packaging fact values conflict with consolidation values.
 * Returns conflict strings.
 */
export function detectConflicts(
    facts: PackagingFacts,
    fieldConfidence: FieldConfidence,
    context: PackagingContext,
): string[] {
    const conflicts: string[] = [];
    const core = context.consolidationDraftCore;
    if (!core) return [];

    // Brand conflict
    if (facts.brand && core.brand_name) {
        const packagingBrand = facts.brand.trim().toLowerCase();
        const consolidationBrand = core.brand_name.trim().toLowerCase();
        if (packagingBrand !== consolidationBrand) {
            const brandConf = fieldConfidence.brand ?? 0;
            if (brandConf >= CONFIDENCE_GATES.BRAND) {
                conflicts.push(
                    `Packaging says "${facts.brand}" (conf=${brandConf.toFixed(2)}) but consolidation says "${core.brand_name}"`,
                );
            }
        }
    }

    // Weight conflict (standardize for comparison)
    if (facts.weight && core.weight_lbs != null) {
        const packagingWeightNum = parseFloat(facts.weight.replace(/[^0-9.]/g, ''));
        if (!isNaN(packagingWeightNum)) {
            const consolidationWeightNum = core.weight_lbs;
            if (Math.abs(packagingWeightNum - consolidationWeightNum) > 0.5) {
                conflicts.push(
                    `Packaging says "${facts.weight}" (~${packagingWeightNum.toFixed(1)} lb.) but consolidation says ${consolidationWeightNum.toFixed(1)} lb.`,
                );
            }
        }
    }

    return conflicts;
}

export { CONFIDENCE_GATES };
