import type { ProductSource } from './types';

export type ConsistencySeverity = 'error' | 'warning' | 'info';
export type ConsistencyRuleName = 'brand-consistency' | 'description-format';

export interface ConsistencyRule {
    name: ConsistencyRuleName;
    severity: ConsistencySeverity;
    validate: (products: ProductSource[]) => Violation[];
}

export interface Violation {
    rule: ConsistencyRuleName;
    severity: ConsistencySeverity;
    message: string;
    products: string[];
    field?: string;
    expected?: string;
    actual?: string;
}

export interface ConsistencyRulesConfig {
    severities?: Partial<Record<ConsistencyRuleName, ConsistencySeverity>>;
    sourcePriority?: string[];
    descriptionSentenceTolerance?: number;
    descriptionWordTolerance?: number;
}

type SourceRecord = Record<string, unknown>;
type DescriptionStructure = 'prose' | 'bullet' | 'mixed';

interface ObservedValue {
    normalized: string;
    display: string;
    skus: string[];
}

interface DescriptionProfile {
    sku: string;
    structure: DescriptionStructure;
    sentenceCount: number;
    wordCount: number;
}

const DEFAULT_SOURCE_PRIORITY = ['shopsite_input', '_input'];
const DEFAULT_DESCRIPTION_SENTENCE_TOLERANCE = 2;
const DEFAULT_DESCRIPTION_WORD_TOLERANCE = 35;

function isRecord(value: unknown): value is SourceRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

function normalizeText(value: string): string {
    return normalizeWhitespace(value).toLowerCase();
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function getSeverity(
    config: ConsistencyRulesConfig,
    rule: ConsistencyRuleName,
    fallback: ConsistencySeverity
): ConsistencySeverity {
    return config.severities?.[rule] ?? fallback;
}

function orderSourcePayloads(product: ProductSource, sourcePriority: string[]): SourceRecord[] {
    const orderedPayloads: SourceRecord[] = [];
    const consumed = new Set<string>();

    for (const sourceName of sourcePriority) {
        const payload = product.sources[sourceName];
        if (isRecord(payload)) {
            orderedPayloads.push(payload);
            consumed.add(sourceName);
        }
    }

    for (const [sourceName, payload] of Object.entries(product.sources)) {
        if (!consumed.has(sourceName) && isRecord(payload)) {
            orderedPayloads.push(payload);
        }
    }

    return orderedPayloads;
}

function getFirstString(record: SourceRecord, fields: string[]): string | null {
    for (const field of fields) {
        const value = record[field];
        if (typeof value === 'string' && value.trim().length > 0) {
            return normalizeWhitespace(value);
        }
    }

    return null;
}

function extractBrand(product: ProductSource, sourcePriority: string[]): string | null {
    for (const payload of orderSourcePayloads(product, sourcePriority)) {
        const brand = getFirstString(payload, ['brand', 'manufacturer', 'vendor']);
        if (brand) {
            return brand;
        }
    }

    return null;
}

function extractDescription(product: ProductSource, sourcePriority: string[]): string | null {
    for (const payload of orderSourcePayloads(product, sourcePriority)) {
        const description = getFirstString(payload, ['description', 'short_description']);
        if (description) {
            return description;
        }
    }

    return null;
}

function observeValue(observed: Map<string, ObservedValue>, normalized: string, display: string, sku: string): void {
    const existing = observed.get(normalized);
    if (existing) {
        existing.skus.push(sku);
        return;
    }

    observed.set(normalized, {
        normalized,
        display,
        skus: [sku],
    });
}

function formatObservedValues(values: ObservedValue[]): string {
    return values
        .map((value) => `${value.display} (${unique(value.skus).join(', ')})`)
        .join('; ');
}

function formatOutlierProducts(values: ObservedValue[]): string[] {
    return unique(values.flatMap((value) => value.skus)).sort();
}

function getExpectedProductLineValue(
    products: ProductSource[],
    valueExtractor: (product: ProductSource) => string | null,
    normalizer: (value: string) => string
): ObservedValue | null {
    const observed = new Map<string, ObservedValue>();

    for (const product of products) {
        const value = valueExtractor(product);
        if (!value) {
            continue;
        }

        observeValue(observed, normalizer(value), value, product.sku);
    }

    if (observed.size !== 1) {
        return null;
    }

    return Array.from(observed.values())[0];
}

function getDominantValue(values: ObservedValue[]): ObservedValue | null {
    if (values.length === 0) {
        return null;
    }

    const sortedValues = [...values].sort(
        (left, right) => right.skus.length - left.skus.length || left.display.localeCompare(right.display)
    );

    if (sortedValues.length > 1 && sortedValues[0].skus.length === sortedValues[1].skus.length) {
        return null;
    }

    return sortedValues[0];
}

function buildSingleFieldViolation(
    rule: ConsistencyRuleName,
    severity: ConsistencySeverity,
    field: string,
    message: string,
    products: string[],
    expected: string,
    actual: string
): Violation[] {
    if (products.length === 0) {
        return [];
    }

    return [
        {
            rule,
            severity,
            message,
            products,
            field,
            expected,
            actual,
        },
    ];
}

function countWords(value: string): number {
    return value.match(/\b[\w'-]+\b/g)?.length ?? 0;
}

function countSentences(value: string): number {
    const normalized = normalizeWhitespace(value.replace(/\s*\n\s*/g, ' '));
    if (!normalized) {
        return 0;
    }

    const matches = normalized.match(/[^.!?]+[.!?]+(?:\s|$)/g);
    if (matches && matches.length > 0) {
        return matches.length;
    }

    return 1;
}

function getDescriptionStructure(value: string): DescriptionStructure {
    const lines = value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const bulletLines = lines.filter((line) => /^(?:[-*•]|\d+\.)\s+/.test(line)).length;
    if (bulletLines === 0) {
        return 'prose';
    }

    return bulletLines === lines.length ? 'bullet' : 'mixed';
}

function buildDescriptionProfile(product: ProductSource, description: string): DescriptionProfile {
    return {
        sku: product.sku,
        structure: getDescriptionStructure(description),
        sentenceCount: countSentences(description),
        wordCount: countWords(description),
    };
}

function median(values: number[]): number {
    const sortedValues = [...values].sort((left, right) => left - right);
    const midpoint = Math.floor(sortedValues.length / 2);

    if (sortedValues.length % 2 === 0) {
        return (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2;
    }

    return sortedValues[midpoint];
}

function formatDescriptionProfile(profile: DescriptionProfile): string {
    return `${profile.structure} format (${profile.sentenceCount} sentence${profile.sentenceCount === 1 ? '' : 's'}, ${profile.wordCount} words)`;
}

function formatBaselineDescription(structure: DescriptionStructure | null, sentenceCount: number, wordCount: number): string {
    const roundedSentences = Math.max(1, Math.round(sentenceCount));
    const roundedWords = Math.max(1, Math.round(wordCount));
    const structureLabel = structure ? `${structure} descriptions` : 'similarly structured descriptions';

    return `${structureLabel} around ${roundedSentences} sentence${roundedSentences === 1 ? '' : 's'} and ${roundedWords} words`;
}

function buildBrandConsistencyRule(config: ConsistencyRulesConfig = {}): ConsistencyRule {
    const sourcePriority = config.sourcePriority ?? DEFAULT_SOURCE_PRIORITY;
    const severity = getSeverity(config, 'brand-consistency', 'error');

    return {
        name: 'brand-consistency',
        severity,
        validate: (products) => {
            const observedBrands = new Map<string, ObservedValue>();
            for (const product of products) {
                const brand = extractBrand(product, sourcePriority);
                if (brand) {
                    observeValue(observedBrands, normalizeText(brand), brand, product.sku);
                }
            }

            if (observedBrands.size === 0) {
                return [];
            }

            const observedValues = Array.from(observedBrands.values());
            const expectedBrand = getExpectedProductLineValue(
                products,
                (product) => product.productLineContext?.expectedBrand?.trim() || null,
                normalizeText
            );
            const baselineBrand = expectedBrand ?? getDominantValue(observedValues);

            if (observedValues.length === 1 && (!baselineBrand || observedValues[0].normalized === baselineBrand.normalized)) {
                return [];
            }

            const outlierValues = baselineBrand
                ? observedValues.filter((value) => value.normalized !== baselineBrand.normalized)
                : observedValues;
            const affectedSkus = formatOutlierProducts(outlierValues);
            const expected = baselineBrand?.display ?? 'single brand across the product line';
            const actual = formatObservedValues(observedValues);
            const message = baselineBrand
                ? `Brand should stay consistent across the product line. Expected ${baselineBrand.display}, but found ${actual}.`
                : `Brand should stay consistent across the product line. Found multiple brands: ${actual}.`;

            return buildSingleFieldViolation(
                'brand-consistency',
                severity,
                'brand',
                message,
                affectedSkus,
                expected,
                actual
            );
        },
    };
}

function buildDescriptionFormatRule(config: ConsistencyRulesConfig = {}): ConsistencyRule {
    const sourcePriority = config.sourcePriority ?? DEFAULT_SOURCE_PRIORITY;
    const severity = getSeverity(config, 'description-format', 'warning');
    const sentenceTolerance = config.descriptionSentenceTolerance ?? DEFAULT_DESCRIPTION_SENTENCE_TOLERANCE;
    const wordTolerance = config.descriptionWordTolerance ?? DEFAULT_DESCRIPTION_WORD_TOLERANCE;

    return {
        name: 'description-format',
        severity,
        validate: (products) => {
            const profiles = products
                .map((product) => {
                    const description = extractDescription(product, sourcePriority);
                    return description ? buildDescriptionProfile(product, description) : null;
                })
                .filter((profile): profile is DescriptionProfile => profile !== null);

            if (profiles.length < 2) {
                return [];
            }

            const structureCounts = new Map<DescriptionStructure, number>();
            for (const profile of profiles) {
                structureCounts.set(profile.structure, (structureCounts.get(profile.structure) ?? 0) + 1);
            }

            const sortedStructures = Array.from(structureCounts.entries()).sort(
                (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
            );
            const dominantStructure =
                sortedStructures.length > 1 && sortedStructures[0][1] === sortedStructures[1][1]
                    ? null
                    : sortedStructures[0][0];
            const medianSentenceCount = median(profiles.map((profile) => profile.sentenceCount));
            const medianWordCount = median(profiles.map((profile) => profile.wordCount));
            const outliers = profiles.filter((profile) => {
                const structureMismatch = dominantStructure !== null && profile.structure !== dominantStructure;
                const sentenceMismatch = Math.abs(profile.sentenceCount - medianSentenceCount) > sentenceTolerance;
                const wordMismatch = Math.abs(profile.wordCount - medianWordCount) > wordTolerance;

                if (dominantStructure === null) {
                    return structureCounts.size > 1;
                }

                return structureMismatch || (sentenceMismatch && wordMismatch);
            });

            if (outliers.length === 0) {
                return [];
            }

            const expected = formatBaselineDescription(dominantStructure, medianSentenceCount, medianWordCount);
            const actual = outliers.map((profile) => `${profile.sku}: ${formatDescriptionProfile(profile)}`).join('; ');
            const message = `Descriptions should follow a similar structure across the product line. Expected ${expected}, but found ${actual}.`;

            return buildSingleFieldViolation(
                'description-format',
                severity,
                'description',
                message,
                outliers.map((profile) => profile.sku).sort(),
                expected,
                actual
            );
        },
    };
}

export function createConsistencyRules(config: ConsistencyRulesConfig = {}): ConsistencyRule[] {
    return [
        buildBrandConsistencyRule(config),
        buildDescriptionFormatRule(config),
    ];
}

export function validateConsistency(
    products: ProductSource[],
    rules: ConsistencyRule[] = defaultConsistencyRules
): Violation[] {
    return rules.flatMap((rule) => rule.validate(products));
}

export const brandConsistencyRule = buildBrandConsistencyRule();
export const descriptionFormatRule = buildDescriptionFormatRule();
export const defaultConsistencyRules = createConsistencyRules();
