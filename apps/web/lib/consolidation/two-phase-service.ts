import { getBatchStatus, retrieveResults, submitBatch } from './batch-service';
import type { BatchStatus, ConsolidationResult, ProductSource } from './types';

export type TwoPhaseSelection = 'phase1' | 'both';

export type ConsistencyRuleType = 'exact_match' | 'expected_value';

export interface ConsistencyRule {
    id: string;
    field: keyof ConsolidationResult;
    type: ConsistencyRuleType;
    description?: string;
    severity?: 'low' | 'medium' | 'high';
    expectedValueSource?: 'expectedBrand' | 'expectedCategory';
}

export interface TwoPhaseConsolidationConfig {
    enablePhase2?: boolean;
    phaseSelection?: TwoPhaseSelection;
    consistencyRules?: ConsistencyRule[];
    maxSiblingsInContext?: number;
    batchMetadata?: {
        description?: string;
        auto_apply?: boolean;
        use_web_search?: boolean;
        [key: string]: string | number | boolean | undefined;
    };
}

export interface ConsistencyIssue {
    sku: string;
    ruleId: string;
    field: keyof ConsolidationResult;
    severity: 'low' | 'medium' | 'high';
    message: string;
    productLine?: string;
    siblingSkus: string[];
    observedValue?: string;
    expectedValue?: string;
    conflictingValues?: string[];
}

export interface ConsistencyReport {
    enabled: boolean;
    totalProducts: number;
    flaggedProducts: number;
    totalIssues: number;
    issues: ConsistencyIssue[];
    bySku: Record<string, ConsistencyIssue[]>;
    appliedRuleIds: string[];
    skippedReason?: string;
}

export interface TwoPhaseConsolidationProductResult extends ConsolidationResult {
    consistencyIssues: ConsistencyIssue[];
    consistencyStatus: 'passed' | 'flagged' | 'skipped';
}

export interface TwoPhaseConsolidationResult {
    phase: 'phase1' | 'phase2';
    products: TwoPhaseConsolidationProductResult[];
    consistencyReport: ConsistencyReport;
}

interface TwoPhaseConsolidationDependencies {
    submitBatchFn?: typeof submitBatch;
    getBatchStatusFn?: typeof getBatchStatus;
    retrieveResultsFn?: typeof retrieveResults;
    sleep?: (ms: number) => Promise<void>;
    pollIntervalMs?: number;
    maxPollAttempts?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_POLL_ATTEMPTS = 120;
const DEFAULT_MAX_SIBLINGS = 5;

function normalizeValue(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function normalizeComparisonValue(value: unknown): string | null {
    const normalized = normalizeValue(value);
    return normalized ? normalized.toLowerCase() : null;
}

function uniqueSkus(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function createEmptyReport(totalProducts: number, skippedReason?: string): ConsistencyReport {
    return {
        enabled: false,
        totalProducts,
        flaggedProducts: 0,
        totalIssues: 0,
        issues: [],
        bySku: {},
        appliedRuleIds: [],
        ...(skippedReason ? { skippedReason } : {}),
    };
}

function isBatchStatus(value: Awaited<ReturnType<typeof getBatchStatus>>): value is BatchStatus {
    return 'is_complete' in value && 'is_failed' in value;
}

export class TwoPhaseConsolidationService {
    private readonly submitBatchFn: typeof submitBatch;
    private readonly getBatchStatusFn: typeof getBatchStatus;
    private readonly retrieveResultsFn: typeof retrieveResults;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(dependencies: TwoPhaseConsolidationDependencies = {}) {
        this.submitBatchFn = dependencies.submitBatchFn ?? submitBatch;
        this.getBatchStatusFn = dependencies.getBatchStatusFn ?? getBatchStatus;
        this.retrieveResultsFn = dependencies.retrieveResultsFn ?? retrieveResults;
        this.sleep = dependencies.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.pollIntervalMs = dependencies.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        this.maxPollAttempts = dependencies.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    }

    async consolidate(
        products: ProductSource[],
        config: TwoPhaseConsolidationConfig = {}
    ): Promise<TwoPhaseConsolidationResult> {
        const phase1Results = await this.runPhase1(products, config);

        const shouldRunPhase2 = config.phaseSelection !== 'phase1' && config.enablePhase2 !== false;
        if (!shouldRunPhase2) {
            return {
                phase: 'phase1',
                products: phase1Results.map((result) => ({
                    ...result,
                    consistencyIssues: [],
                    consistencyStatus: 'skipped',
                })),
                consistencyReport: createEmptyReport(phase1Results.length, 'Phase 2 disabled by configuration'),
            };
        }

        return this.runPhase2(products, phase1Results, config);
    }

    private async runPhase1(
        products: ProductSource[],
        config: TwoPhaseConsolidationConfig
    ): Promise<ConsolidationResult[]> {
        const submitResponse = await this.submitBatchFn(products, config.batchMetadata ?? {});
        if (!submitResponse.success) {
            throw new Error(submitResponse.error);
        }

        const batchId = submitResponse.batch_id;
        for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
            const status = await this.getBatchStatusFn(batchId);
            if ('success' in status && status.success === false) {
                throw new Error(status.error);
            }

            if (!isBatchStatus(status)) {
                await this.sleep(this.pollIntervalMs);
                continue;
            }

            if (status.is_failed) {
                throw new Error(`Phase 1 consolidation batch failed with status ${status.status}`);
            }

            if (status.is_complete) {
                return this.resolveBatchResults(batchId);
            }

            await this.sleep(this.pollIntervalMs);
        }

        throw new Error(`Phase 1 consolidation batch did not complete after ${this.maxPollAttempts} attempts`);
    }

    private async resolveBatchResults(batchId: string): Promise<ConsolidationResult[]> {
        const results = await this.retrieveResultsFn(batchId);
        if (!Array.isArray(results)) {
            throw new Error(results.error);
        }

        return results;
    }

    private runPhase2(
        products: ProductSource[],
        phase1Results: ConsolidationResult[],
        config: TwoPhaseConsolidationConfig
    ): TwoPhaseConsolidationResult {
        const rules = config.consistencyRules ?? [];
        const bySku: Record<string, ConsistencyIssue[]> = {};
        const issues: ConsistencyIssue[] = [];
        const resultsBySku = new Map(phase1Results.map((result) => [result.sku, result]));
        const productsBySku = new Map(products.map((product) => [product.sku, product]));

        const appendIssue = (issue: ConsistencyIssue) => {
            if (!bySku[issue.sku]) {
                bySku[issue.sku] = [];
            }
            bySku[issue.sku].push(issue);
            issues.push(issue);
        };

        const processedGroups = new Set<string>();
        const maxSiblings = config.maxSiblingsInContext ?? DEFAULT_MAX_SIBLINGS;

        for (const product of products) {
            const context = product.productLineContext;
            if (!context) {
                continue;
            }

            const siblingSkus = uniqueSkus([
                product.sku,
                ...context.siblings.slice(0, maxSiblings).map((sibling) => sibling.sku),
            ]);

            const groupKey = `${context.productLine}:${siblingSkus.slice().sort().join('|')}`;
            if (processedGroups.has(groupKey)) {
                continue;
            }
            processedGroups.add(groupKey);

            const groupResults = siblingSkus
                .map((sku) => resultsBySku.get(sku))
                .filter((result): result is ConsolidationResult => Boolean(result));

            if (groupResults.length < 2) {
                continue;
            }

            for (const rule of rules.filter((entry) => entry.type === 'exact_match')) {
                const observedValues = new Map<string, string[]>();

                for (const result of groupResults) {
                    const rawValue = result[rule.field];
                    const comparisonValue = normalizeComparisonValue(rawValue);
                    const displayValue = normalizeValue(rawValue);
                    if (!comparisonValue || !displayValue) {
                        continue;
                    }

                    const existing = observedValues.get(comparisonValue) ?? [];
                    observedValues.set(comparisonValue, [...existing, displayValue]);
                }

                if (observedValues.size <= 1) {
                    continue;
                }

                const conflictingValues = Array.from(new Set(Array.from(observedValues.values()).flat()));

                for (const result of groupResults) {
                    appendIssue({
                        sku: result.sku,
                        ruleId: rule.id,
                        field: rule.field,
                        severity: rule.severity ?? 'medium',
                        message: `${String(rule.field)} is inconsistent across sibling products in ${context.productLine}`,
                        productLine: context.productLine,
                        siblingSkus: siblingSkus.filter((sku) => sku !== result.sku),
                        observedValue: normalizeValue(result[rule.field]) ?? undefined,
                        conflictingValues,
                    });
                }
            }
        }

        for (const result of phase1Results) {
            const product = productsBySku.get(result.sku);
            const context = product?.productLineContext;
            if (!context) {
                continue;
            }

            for (const rule of rules.filter((entry) => entry.type === 'expected_value')) {
                if (!rule.expectedValueSource) {
                    continue;
                }

                const expectedValue = normalizeValue(context[rule.expectedValueSource]);
                const observedValue = normalizeValue(result[rule.field]);
                if (!expectedValue || !observedValue) {
                    continue;
                }

                if (normalizeComparisonValue(expectedValue) === normalizeComparisonValue(observedValue)) {
                    continue;
                }

                appendIssue({
                    sku: result.sku,
                    ruleId: rule.id,
                    field: rule.field,
                    severity: rule.severity ?? 'medium',
                    message: `${String(rule.field)} does not match expected ${rule.expectedValueSource} for ${context.productLine}`,
                    productLine: context.productLine,
                    siblingSkus: context.siblings.slice(0, maxSiblings).map((sibling) => sibling.sku),
                    observedValue,
                    expectedValue,
                });
            }
        }

        const productsWithIssues = phase1Results.map((result) => ({
            ...result,
            consistencyIssues: bySku[result.sku] ?? [],
            consistencyStatus: (bySku[result.sku]?.length ?? 0) > 0 ? 'flagged' as const : 'passed' as const,
        }));

        const flaggedProducts = productsWithIssues.filter((result) => result.consistencyStatus === 'flagged').length;

        return {
            phase: 'phase2',
            products: productsWithIssues,
            consistencyReport: {
                enabled: true,
                totalProducts: phase1Results.length,
                flaggedProducts,
                totalIssues: issues.length,
                issues,
                bySku,
                appliedRuleIds: rules.map((rule) => rule.id),
            },
        };
    }
}

export function createTwoPhaseConsolidationService(
    dependencies?: TwoPhaseConsolidationDependencies
): TwoPhaseConsolidationService {
    return new TwoPhaseConsolidationService(dependencies);
}

export function buildDefaultConsistencyRules(): ConsistencyRule[] {
    return [
        {
            id: 'brand_matches_expected_product_line',
            field: 'brand',
            type: 'expected_value',
            expectedValueSource: 'expectedBrand',
            severity: 'high',
            description: 'Brand should match the expected brand for the product line',
        },
        {
            id: 'category_matches_expected_product_line',
            field: 'category',
            type: 'expected_value',
            expectedValueSource: 'expectedCategory',
            severity: 'medium',
            description: 'Category should match the expected category for the product line',
        },
    ];
}
