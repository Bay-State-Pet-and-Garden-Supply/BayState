import { getBatchStatus, processBatchQueue, retrieveResults, submitBatch } from './batch-service';
import type { BatchStatus, ConsolidationResult, ProductSource } from './types';

type TwoPhaseSelection = 'phase1' | 'both';

type ConsistencyRuleType = 'exact_match' | 'expected_value';

interface TwoPhaseConsistencyRule {
    id: string;
    field: keyof ConsolidationResult;
    type: ConsistencyRuleType;
    description?: string;
    severity?: 'low' | 'medium' | 'high';
    expectedValueSource?: 'expectedBrand' | 'expectedCategory';
}

interface TwoPhaseConsolidationConfig {
    enablePhase2?: boolean;
    phaseSelection?: TwoPhaseSelection;
    consistencyRules?: TwoPhaseConsistencyRule[];
    maxSiblingsInContext?: number;
    /**
     * How many items to process per polling cycle when getBatchStatus is read-only
     * and this service advances the queue itself.
     * Default: 5
     */
    processChunkSize?: number;
    batchMetadata?: {
        description?: string;
        auto_apply?: boolean;
        use_web_search?: boolean;
        [key: string]: string | number | boolean | undefined;
    };
}

interface ConsistencyIssue {
    upc: string;
    ruleId: string;
    field: keyof ConsolidationResult;
    severity: 'low' | 'medium' | 'high';
    message: string;
    productLine?: string;
    siblingUpcs: string[];
    observedValue?: string;
    expectedValue?: string;
    conflictingValues?: string[];
}

interface ConsistencyReport {
    enabled: boolean;
    totalProducts: number;
    flaggedProducts: number;
    totalIssues: number;
    issues: ConsistencyIssue[];
    byUpc: Record<string, ConsistencyIssue[]>;
    appliedRuleIds: string[];
    skippedReason?: string;
}

interface TwoPhaseConsolidationProductResult extends ConsolidationResult {
    consistencyIssues: ConsistencyIssue[];
    consistencyStatus: 'passed' | 'flagged' | 'skipped';
}

interface TwoPhaseConsolidationResult {
    phase: 'phase1' | 'phase2';
    products: TwoPhaseConsolidationProductResult[];
    consistencyReport: ConsistencyReport;
}

interface TwoPhaseConsolidationDependencies {
    submitBatchFn?: typeof submitBatch;
    getBatchStatusFn?: typeof getBatchStatus;
    retrieveResultsFn?: typeof retrieveResults;
    processBatchFn?: typeof processBatchQueue;
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

function uniqueUpcs(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function createEmptyReport(totalProducts: number, skippedReason?: string): ConsistencyReport {
    return {
        enabled: false,
        totalProducts,
        flaggedProducts: 0,
        totalIssues: 0,
        issues: [],
        byUpc: {},
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
    private readonly processBatchFn: typeof processBatchQueue;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(dependencies: TwoPhaseConsolidationDependencies = {}) {
        this.submitBatchFn = dependencies.submitBatchFn ?? submitBatch;
        this.getBatchStatusFn = dependencies.getBatchStatusFn ?? getBatchStatus;
        this.retrieveResultsFn = dependencies.retrieveResultsFn ?? retrieveResults;
        this.processBatchFn = dependencies.processBatchFn ?? processBatchQueue;
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
        const chunkSize = config.processChunkSize ?? 5;

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

            // Advance the queue: getBatchStatus is now read-only, so we explicitly
            // process pending items so the batch can make progress.
            try {
                await this.processBatchFn(batchId, { limit: chunkSize });
            } catch {
                // Swallow processing errors in the polling loop — the next
                // iteration will re-evaluate the status and surface failures.
                // This also keeps mocks that omit processBatchFn working.
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
        const byUpc: Record<string, ConsistencyIssue[]> = {};
        const issues: ConsistencyIssue[] = [];
        const resultsByUpc = new Map(phase1Results.map((result) => [result.upc, result]));
        const productsByUpc = new Map(products.map((product) => [product.upc, product]));

        const appendIssue = (issue: ConsistencyIssue) => {
            if (!byUpc[issue.upc]) {
                byUpc[issue.upc] = [];
            }
            byUpc[issue.upc].push(issue);
            issues.push(issue);
        };

        const processedGroups = new Set<string>();
        const maxSiblings = config.maxSiblingsInContext ?? DEFAULT_MAX_SIBLINGS;

        for (const product of products) {
            const context = product.productLineContext;
            if (!context) {
                continue;
            }

            const siblingUpcs = uniqueUpcs([
                product.upc,
                ...context.siblings.slice(0, maxSiblings).map((sibling) => sibling.upc),
            ]);

            const groupKey = `${context.productLine}:${siblingUpcs.slice().sort().join('|')}`;
            if (processedGroups.has(groupKey)) {
                continue;
            }
            processedGroups.add(groupKey);

            const groupResults = siblingUpcs
                .map((upc) => resultsByUpc.get(upc))
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
                        upc: result.upc,
                        ruleId: rule.id,
                        field: rule.field,
                        severity: rule.severity ?? 'medium',
                        message: `${String(rule.field)} is inconsistent across sibling products in ${context.productLine}`,
                        productLine: context.productLine,
                        siblingUpcs: siblingUpcs.filter((upc) => upc !== result.upc),
                        observedValue: normalizeValue(result[rule.field]) ?? undefined,
                        conflictingValues,
                    });
                }
            }
        }

        for (const result of phase1Results) {
            const product = productsByUpc.get(result.upc);
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
                    upc: result.upc,
                    ruleId: rule.id,
                    field: rule.field,
                    severity: rule.severity ?? 'medium',
                    message: `${String(rule.field)} does not match expected ${rule.expectedValueSource} for ${context.productLine}`,
                    productLine: context.productLine,
                    siblingUpcs: context.siblings.slice(0, maxSiblings).map((sibling) => sibling.upc),
                    observedValue,
                    expectedValue,
                });
            }
        }

        const productsWithIssues = phase1Results.map((result) => ({
            ...result,
            consistencyIssues: byUpc[result.upc] ?? [],
            consistencyStatus: (byUpc[result.upc]?.length ?? 0) > 0 ? 'flagged' as const : 'passed' as const,
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
                byUpc,
                appliedRuleIds: rules.map((rule) => rule.id),
            },
        };
    }
}

function createTwoPhaseConsolidationService(
    dependencies?: TwoPhaseConsolidationDependencies
): TwoPhaseConsolidationService {
    return new TwoPhaseConsolidationService(dependencies);
}

export function buildDefaultConsistencyRules(): TwoPhaseConsistencyRule[] {
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
            severity: 'high',
            description: 'Category should match the expected category for the product line',
        },
    ];
}
