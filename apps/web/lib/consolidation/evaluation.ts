import type {
    ConsolidationResult,
    ParallelRunComparison,
} from './types';

const COMPARISON_FIELDS = [
    'name',
    'brand',
    'weight',
    'description',
    'long_description',
    'search_keywords',
    'product_on_pages',
    'confidence_score',
] as const;

const COMPLETENESS_FIELDS = [
    'name',
    'brand',
    'weight',
    'description',
    'long_description',
    'search_keywords',
    'product_on_pages',
] as const;

type ComparableField = (typeof COMPARISON_FIELDS)[number];

function normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    return normalized.length > 0 ? normalized : null;
}

function normalizeNumeric(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number(value.toFixed(3));
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return Number(parsed.toFixed(3));
        }
    }

    return null;
}

function normalizeDelimitedSet(value: unknown, delimiter: 'pipe' | 'comma'): string[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => normalizeText(entry))
            .filter((entry): entry is string => entry !== null)
            .filter((entry, index, array) => array.indexOf(entry) === index)
            .sort();
    }

    if (typeof value !== 'string') {
        return [];
    }

    const splitOn = delimiter === 'pipe' ? '|' : ',';
    return value
        .split(splitOn)
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => entry !== null)
        .filter((entry, index, array) => array.indexOf(entry) === index)
        .sort();
}

function normalizeFieldValue(field: ComparableField, value: unknown): string | number | string[] | null {
    if (field === 'confidence_score') {
        return normalizeNumeric(value);
    }

    if (field === 'product_on_pages') {
        return normalizeDelimitedSet(value, 'pipe');
    }

    if (field === 'search_keywords') {
        return normalizeDelimitedSet(value, 'comma');
    }

    return normalizeText(value);
}

function isFieldPresent(value: unknown, field: typeof COMPLETENESS_FIELDS[number]): boolean {
    if (field === 'product_on_pages') {
        return normalizeDelimitedSet(value, 'pipe').length > 0;
    }

    if (field === 'search_keywords') {
        return normalizeDelimitedSet(value, 'comma').length > 0;
    }

    return normalizeText(value) !== null;
}

function areNormalizedValuesEqual(
    left: string | number | string[] | null,
    right: string | number | string[] | null
): boolean {
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) {
            return false;
        }

        return JSON.stringify(left) === JSON.stringify(right);
    }

    return left === right;
}

export function calculateCompleteness(result: Partial<ConsolidationResult>): number {
    if (result.error) {
        return 0;
    }

    const populated = COMPLETENESS_FIELDS.filter((field) => isFieldPresent(result[field], field)).length;
    return populated / COMPLETENESS_FIELDS.length;
}

export function calculateTaxonomyCorrectness(
    actual: Partial<ConsolidationResult>,
    expected?: Partial<ConsolidationResult>
): number {
    if (actual.error) {
        return 0;
    }

    const actualPages = normalizeDelimitedSet(actual.product_on_pages, 'pipe');

    if (!expected) {
        return actualPages.length > 0 ? 1 : 0;
    }

    const expectedPages = normalizeDelimitedSet(expected.product_on_pages, 'pipe');

    return actualPages.length > 0 && JSON.stringify(actualPages) === JSON.stringify(expectedPages) ? 1 : 0;
}

export function compareConsolidationResults(
    expected: Partial<ConsolidationResult>,
    actual: Partial<ConsolidationResult>
): ParallelRunComparison {
    const mismatchedFields: string[] = [];

    let matchedFields = 0;
    for (const field of COMPARISON_FIELDS) {
        const expectedValue = normalizeFieldValue(field, expected[field]);
        const actualValue = normalizeFieldValue(field, actual[field]);

        if (areNormalizedValuesEqual(expectedValue, actualValue)) {
            matchedFields += 1;
        } else {
            mismatchedFields.push(field);
        }
    }

    return {
        accuracy: matchedFields / COMPARISON_FIELDS.length,
        completeness: calculateCompleteness(actual),
        taxonomy_correctness: calculateTaxonomyCorrectness(actual, expected),
        mismatch_count: mismatchedFields.length,
        compared_count: COMPARISON_FIELDS.length,
        mismatched_fields: mismatchedFields,
    };
}

export function summarizeComparisons(
    comparisons: ParallelRunComparison[]
): ParallelRunComparison {
    if (comparisons.length === 0) {
        return {
            accuracy: 0,
            completeness: 0,
            taxonomy_correctness: 0,
            mismatch_count: 0,
            compared_count: 0,
            mismatched_fields: [],
        };
    }

    const totals = comparisons.reduce(
        (accumulator, comparison) => {
            accumulator.accuracy += comparison.accuracy;
            accumulator.completeness += comparison.completeness;
            accumulator.taxonomyCorrectness += comparison.taxonomy_correctness;
            accumulator.mismatchCount += comparison.mismatch_count;
            accumulator.comparedCount += comparison.compared_count;
            for (const field of comparison.mismatched_fields) {
                accumulator.mismatchedFields.add(field);
            }
            return accumulator;
        },
        {
            accuracy: 0,
            completeness: 0,
            taxonomyCorrectness: 0,
            mismatchCount: 0,
            comparedCount: 0,
            mismatchedFields: new Set<string>(),
        }
    );

    return {
        accuracy: totals.accuracy / comparisons.length,
        completeness: totals.completeness / comparisons.length,
        taxonomy_correctness: totals.taxonomyCorrectness / comparisons.length,
        mismatch_count: totals.mismatchCount,
        compared_count: totals.comparedCount,
        mismatched_fields: Array.from(totals.mismatchedFields).sort(),
    };
}
