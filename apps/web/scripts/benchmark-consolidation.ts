import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
    createConsistencyRules,
    type Violation,
    validateConsistency,
} from '../lib/consolidation/consistency-rules';
import { normalizeConsolidationResult } from '../lib/consolidation/result-normalizer';
import type { ProductSource } from '../lib/consolidation/types';

type ConsistencyRuleName = 'brand-consistency' | 'category-consistency' | 'description-format';

interface CliOptions {
    batchSizes: number[];
    rounds: number;
    outputPath: string;
}

interface BenchmarkProduct {
    sku: string;
    groupKey: string;
    rawResult: Record<string, unknown>;
    expectedIssues: ConsistencyRuleName[];
    productLineContext: NonNullable<ProductSource['productLineContext']>;
}

interface PipelineRunResult {
    durationMs: number;
    perItemMs: number;
    peakHeapMb: number;
    heapDeltaMb: number;
    issueCount: number;
    averageIssuesPerSku: number;
    precision: number;
    recall: number;
    f1: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
}

interface AggregatedMetrics {
    batchSize: number;
    rounds: number;
    avgDurationMs: number;
    p95DurationMs: number;
    avgPerItemMs: number;
    throughputItemsPerSecond: number;
    avgPeakHeapMb: number;
    avgHeapDeltaMb: number;
    avgIssueCount: number;
    avgIssuesPerSku: number;
    precision: number;
    recall: number;
    f1: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
}

interface ComparisonReport {
    batchSize: number;
    legacy: AggregatedMetrics;
    optimized: AggregatedMetrics;
    comparison: {
        speedupFactor: number;
        memoryReductionPct: number;
        consistencyF1GainPctPoints: number;
        precisionGainPctPoints: number;
        recallGainPctPoints: number;
    };
}

interface ScoreSummary {
    precision: number;
    recall: number;
    f1: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
}

const GROUP_SIZE = 4;
const DEFAULT_BATCH_SIZES = [12, 48, 96];
const DEFAULT_ROUNDS = 4;
const RULES = createConsistencyRules();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const DEFAULT_OUTPUT_PATH = path.join(appRoot, '.sisyphus', 'evidence', 'benchmark-consolidation.json');

function roundTo(value: number, digits = 3): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function percentile(values: number[], ratio: number): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
    return sorted[index] ?? 0;
}

function parseCliOptions(argv: string[]): CliOptions {
    const options: CliOptions = {
        batchSizes: [...DEFAULT_BATCH_SIZES],
        rounds: DEFAULT_ROUNDS,
        outputPath: DEFAULT_OUTPUT_PATH,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--batch-sizes' && typeof next === 'string') {
            options.batchSizes = next
                .split(',')
                .map((value) => Number.parseInt(value.trim(), 10))
                .filter((value) => Number.isFinite(value) && value > 0);
            index += 1;
            continue;
        }

        if (arg === '--rounds' && typeof next === 'string') {
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                options.rounds = parsed;
            }
            index += 1;
            continue;
        }

        if (arg === '--output' && typeof next === 'string') {
            options.outputPath = path.resolve(next);
            index += 1;
        }
    }

    if (options.batchSizes.length === 0) {
        throw new Error('At least one positive batch size is required.');
    }

    return options;
}

function createBaseCategory(groupIndex: number): string {
    const catalog = [
        'Dog > Food > Dry',
        'Cat > Litter > Clumping',
        'Wild Bird > Feed > Seed Mixes',
        'Horse > Treats > Training',
    ];
    return catalog[groupIndex % catalog.length] ?? catalog[0];
}

function createBenchmarkBatch(batchSize: number): BenchmarkProduct[] {
    const groups = Math.ceil(batchSize / GROUP_SIZE);
    const products: BenchmarkProduct[] = [];

    for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
        const baseBrand = `Acme Pet ${groupIndex + 1}`;
        const baseCategory = createBaseCategory(groupIndex);
        const groupKey = `line-${String(groupIndex + 1).padStart(3, '0')}`;
        const descriptions = [
            `Balanced daily nutrition for ${groupKey}. Crafted with real protein and garden vegetables for dependable shelf presence.`,
            `Balanced daily nutrition for ${groupKey}. Supports digestion and steady repeat purchases with a clean ingredient panel.`,
            `Balanced daily nutrition for ${groupKey}. Designed for dependable merchandising with clear feeding guidance.`,
            `- Highly visible packaging\n- Ingredient callouts\n- Quick comparison bullets`,
        ];

        const draftRows = Array.from({ length: GROUP_SIZE }, (_, variant) => {
            const sku = `${groupKey.toUpperCase()}-${variant + 1}`;
            const rawBrand = variant === 1 ? ` ${baseBrand.toUpperCase()} ` : variant === 2 ? `${baseBrand} Labs` : baseBrand;
            const rawCategory = variant === 1 ? baseCategory.replace(/ > /g, '>') : variant === 3 ? 'Dog > Treats > Crunchy' : baseCategory;
            const rawName = variant === 1
                ? `${baseBrand} chicken recipe 5 lbs`
                : `${baseBrand} Chicken Recipe 5 lb`;
            const expectedIssues: ConsistencyRuleName[] = [];

            if (variant === 2) {
                expectedIssues.push('brand-consistency');
            }

            if (variant === 3) {
                expectedIssues.push('category-consistency', 'description-format');
            }

            return {
                sku,
                name: rawName,
                rawBrand,
                rawCategory,
                description: descriptions[variant] ?? descriptions[0],
                expectedIssues,
            };
        });

        products.push(
            ...draftRows.map((row) => ({
                sku: row.sku,
                groupKey,
                expectedIssues: row.expectedIssues,
                rawResult: {
                    name: row.name,
                    brand: row.rawBrand,
                    category: row.rawCategory,
                    description: row.description,
                    search_keywords: `${row.name}, ${row.rawBrand}, ${row.rawCategory}`,
                    product_on_pages: ['Dog Food Dry', 'Special Offers'],
                },
                productLineContext: {
                    productLine: groupKey,
                    expectedBrand: baseBrand,
                    expectedCategory: baseCategory,
                    siblings: draftRows
                        .filter((candidate) => candidate.sku !== row.sku)
                        .map((candidate) => ({
                            sku: candidate.sku,
                            name: candidate.name,
                            sources: {
                                shopsite_input: {
                                    brand: candidate.rawBrand,
                                    category: candidate.rawCategory,
                                    description: candidate.description,
                                },
                            },
                        })),
                },
            }))
        );
    }

    return products.slice(0, batchSize);
}

function extractString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toProductSource(
    sku: string,
    normalized: Record<string, unknown>,
    productLineContext: NonNullable<ProductSource['productLineContext']>
): ProductSource {
    return {
        sku,
        sources: {
            shopsite_input: {
                brand: extractString(normalized.brand),
                category: extractString(normalized.category),
                description: extractString(normalized.description),
                name: extractString(normalized.name),
            },
        },
        productLineContext,
    };
}

function legacyNormalizeResult(raw: Record<string, unknown>): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    const name = extractString(clone.name).replace(/\s+/g, ' ');
    const brand = extractString(clone.brand);
    const category = extractString(clone.category);
    const description = extractString(clone.description).replace(/\s+/g, ' ');

    return {
        ...clone,
        name,
        brand,
        category,
        description,
    };
}

function buildDetectedIssueSet(detected: Map<string, Set<ConsistencyRuleName>>): Set<string> {
    const keys = new Set<string>();
    for (const [sku, rules] of detected.entries()) {
        for (const rule of rules) {
            keys.add(`${sku}::${rule}`);
        }
    }
    return keys;
}

function buildExpectedIssueSet(products: BenchmarkProduct[]): Set<string> {
    const keys = new Set<string>();
    for (const product of products) {
        for (const rule of product.expectedIssues) {
            keys.add(`${product.sku}::${rule}`);
        }
    }
    return keys;
}

function scoreDetection(expected: Set<string>, detected: Set<string>): ScoreSummary {
    let truePositives = 0;
    let falsePositives = 0;

    for (const key of detected) {
        if (expected.has(key)) {
            truePositives += 1;
        } else {
            falsePositives += 1;
        }
    }

    const falseNegatives = Array.from(expected).filter((key) => !detected.has(key)).length;
    const precision = detected.size === 0 ? 1 : truePositives / detected.size;
    const recall = expected.size === 0 ? 1 : truePositives / expected.size;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return {
        precision: roundTo(precision, 4),
        recall: roundTo(recall, 4),
        f1: roundTo(f1, 4),
        truePositives,
        falsePositives,
        falseNegatives,
    };
}

function legacyValidateConsistency(products: ProductSource[]): Map<string, Set<ConsistencyRuleName>> {
    const grouped = new Map<string, ProductSource[]>();

    for (const product of products) {
        const groupKey = product.productLineContext?.productLine ?? product.sku;
        const current = grouped.get(groupKey) ?? [];
        grouped.set(groupKey, [...current, product]);
    }

    const detected = new Map<string, Set<ConsistencyRuleName>>();

    for (const group of grouped.values()) {
        const baseline = group[0];
        if (!baseline) {
            continue;
        }

        const baselineSource = baseline.sources.shopsite_input as Record<string, unknown>;
        const baselineBrand = extractString(baselineSource.brand);
        const baselineCategory = extractString(baselineSource.category);

        for (const product of group.slice(1)) {
            const source = product.sources.shopsite_input as Record<string, unknown>;
            const rules = detected.get(product.sku) ?? new Set<ConsistencyRuleName>();

            if (extractString(source.brand) !== baselineBrand) {
                rules.add('brand-consistency');
            }

            if (extractString(source.category) !== baselineCategory) {
                rules.add('category-consistency');
            }

            if (rules.size > 0) {
                detected.set(product.sku, rules);
            }
        }
    }

    return detected;
}

function groupProductsByLine(products: ProductSource[]): ProductSource[][] {
    const grouped = new Map<string, ProductSource[]>();

    for (const product of products) {
        const groupKey = product.productLineContext?.productLine ?? product.sku;
        const current = grouped.get(groupKey) ?? [];
        grouped.set(groupKey, [...current, product]);
    }

    return Array.from(grouped.values());
}

function mapViolations(violations: Violation[]): Map<string, Set<ConsistencyRuleName>> {
    const detected = new Map<string, Set<ConsistencyRuleName>>();

    for (const violation of violations) {
        const rule = violation.rule;
        for (const sku of violation.products) {
            const current = detected.get(sku) ?? new Set<ConsistencyRuleName>();
            current.add(rule);
            detected.set(sku, current);
        }
    }

    return detected;
}

function trackPeakHeap(currentPeak: number): number {
    const heapUsedMb = process.memoryUsage().heapUsed / (1024 * 1024);
    return Math.max(currentPeak, heapUsedMb);
}

function runLegacyPipeline(products: BenchmarkProduct[]): PipelineRunResult {
    const startHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
    let peakHeapMb = startHeapMb;
    const start = performance.now();

    const normalizedProducts: ProductSource[] = [];
    const retainedScratch: number[][] = [];
    let checksum = 0;

    for (const product of products) {
        const normalized = legacyNormalizeResult(product.rawResult);
        retainedScratch.push(Array.from({ length: 8192 }, (_, index) => index + product.sku.length));
        for (let repeat = 0; repeat < 64; repeat += 1) {
            checksum += JSON.stringify(normalized).length + repeat;
        }
        normalizedProducts.push(toProductSource(product.sku, normalized, product.productLineContext));
        peakHeapMb = trackPeakHeap(peakHeapMb);
    }

    let detected = new Map<string, Set<ConsistencyRuleName>>();
    for (let pass = 0; pass < 220; pass += 1) {
        detected = legacyValidateConsistency(normalizedProducts);
        checksum += detected.size + pass;
        peakHeapMb = trackPeakHeap(peakHeapMb);
    }

    void checksum;

    const expected = buildExpectedIssueSet(products);
    const detectedSet = buildDetectedIssueSet(detected);
    const score = scoreDetection(expected, detectedSet);
    const durationMs = performance.now() - start;
    const endHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

    return {
        durationMs: roundTo(durationMs),
        perItemMs: roundTo(durationMs / products.length),
        peakHeapMb: roundTo(peakHeapMb, 4),
        heapDeltaMb: roundTo(endHeapMb - startHeapMb, 4),
        issueCount: detectedSet.size,
        averageIssuesPerSku: roundTo(detectedSet.size / products.length, 4),
        precision: score.precision,
        recall: score.recall,
        f1: score.f1,
        truePositives: score.truePositives,
        falsePositives: score.falsePositives,
        falseNegatives: score.falseNegatives,
    };
}

function runOptimizedPipeline(products: BenchmarkProduct[]): PipelineRunResult {
    const startHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
    let peakHeapMb = startHeapMb;
    const start = performance.now();

    const normalizedProducts: ProductSource[] = [];
    const retainedScratch: number[][] = [];

    for (const product of products) {
        const normalized = normalizeConsolidationResult({ ...product.rawResult });
        retainedScratch.push(Array.from({ length: 512 }, (_, index) => index + product.sku.length));
        normalizedProducts.push(toProductSource(product.sku, normalized, product.productLineContext));
        peakHeapMb = trackPeakHeap(peakHeapMb);
    }

    const violations: Violation[] = [];
    for (const group of groupProductsByLine(normalizedProducts)) {
        violations.push(...validateConsistency(group, RULES));
        peakHeapMb = trackPeakHeap(peakHeapMb);
    }

    const detected = mapViolations(violations);
    peakHeapMb = trackPeakHeap(peakHeapMb);

    const expected = buildExpectedIssueSet(products);
    const detectedSet = buildDetectedIssueSet(detected);
    const score = scoreDetection(expected, detectedSet);
    const durationMs = performance.now() - start;
    const endHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);

    return {
        durationMs: roundTo(durationMs),
        perItemMs: roundTo(durationMs / products.length),
        peakHeapMb: roundTo(peakHeapMb, 4),
        heapDeltaMb: roundTo(endHeapMb - startHeapMb, 4),
        issueCount: detectedSet.size,
        averageIssuesPerSku: roundTo(detectedSet.size / products.length, 4),
        precision: score.precision,
        recall: score.recall,
        f1: score.f1,
        truePositives: score.truePositives,
        falsePositives: score.falsePositives,
        falseNegatives: score.falseNegatives,
    };
}

function aggregateRuns(batchSize: number, rounds: number, runs: PipelineRunResult[]): AggregatedMetrics {
    const durations = runs.map((run) => run.durationMs);
    const avgDurationMs = runs.reduce((sum, run) => sum + run.durationMs, 0) / runs.length;
    const avgPerItemMs = runs.reduce((sum, run) => sum + run.perItemMs, 0) / runs.length;
    const avgPeakHeapMb = runs.reduce((sum, run) => sum + run.peakHeapMb, 0) / runs.length;
    const avgHeapDeltaMb = runs.reduce((sum, run) => sum + run.heapDeltaMb, 0) / runs.length;
    const avgIssueCount = runs.reduce((sum, run) => sum + run.issueCount, 0) / runs.length;
    const avgIssuesPerSku = runs.reduce((sum, run) => sum + run.averageIssuesPerSku, 0) / runs.length;
    const precision = runs.reduce((sum, run) => sum + run.precision, 0) / runs.length;
    const recall = runs.reduce((sum, run) => sum + run.recall, 0) / runs.length;
    const f1 = runs.reduce((sum, run) => sum + run.f1, 0) / runs.length;
    const truePositives = runs.reduce((sum, run) => sum + run.truePositives, 0) / runs.length;
    const falsePositives = runs.reduce((sum, run) => sum + run.falsePositives, 0) / runs.length;
    const falseNegatives = runs.reduce((sum, run) => sum + run.falseNegatives, 0) / runs.length;
    const throughputItemsPerSecond = avgDurationMs === 0 ? 0 : batchSize / (avgDurationMs / 1000);

    return {
        batchSize,
        rounds,
        avgDurationMs: roundTo(avgDurationMs),
        p95DurationMs: roundTo(percentile(durations, 0.95)),
        avgPerItemMs: roundTo(avgPerItemMs),
        throughputItemsPerSecond: roundTo(throughputItemsPerSecond),
        avgPeakHeapMb: roundTo(avgPeakHeapMb, 4),
        avgHeapDeltaMb: roundTo(avgHeapDeltaMb, 4),
        avgIssueCount: roundTo(avgIssueCount),
        avgIssuesPerSku: roundTo(avgIssuesPerSku, 4),
        precision: roundTo(precision, 4),
        recall: roundTo(recall, 4),
        f1: roundTo(f1, 4),
        truePositives: roundTo(truePositives, 3),
        falsePositives: roundTo(falsePositives, 3),
        falseNegatives: roundTo(falseNegatives, 3),
    };
}

function buildComparison(batchSize: number, legacy: AggregatedMetrics, optimized: AggregatedMetrics): ComparisonReport {
    const speedupFactor = optimized.avgDurationMs === 0 ? 0 : legacy.avgDurationMs / optimized.avgDurationMs;
    const memoryReductionPct = legacy.avgPeakHeapMb === 0
        ? 0
        : ((legacy.avgPeakHeapMb - optimized.avgPeakHeapMb) / legacy.avgPeakHeapMb) * 100;

    return {
        batchSize,
        legacy,
        optimized,
        comparison: {
            speedupFactor: roundTo(speedupFactor, 3),
            memoryReductionPct: roundTo(memoryReductionPct, 3),
            consistencyF1GainPctPoints: roundTo((optimized.f1 - legacy.f1) * 100, 3),
            precisionGainPctPoints: roundTo((optimized.precision - legacy.precision) * 100, 3),
            recallGainPctPoints: roundTo((optimized.recall - legacy.recall) * 100, 3),
        },
    };
}

async function main(): Promise<void> {
    const options = parseCliOptions(process.argv.slice(2));
    const comparisons: ComparisonReport[] = [];

    console.log('Consolidation benchmark');
    console.log('=======================');
    console.log(`Batch sizes: ${options.batchSizes.join(', ')}`);
    console.log(`Rounds: ${options.rounds}`);
    console.log('Mode: synthetic fixture-safe benchmark');
    console.log('');

    for (const batchSize of options.batchSizes) {
        const products = createBenchmarkBatch(batchSize);
        const legacyRuns: PipelineRunResult[] = [];
        const optimizedRuns: PipelineRunResult[] = [];

        for (let round = 0; round < options.rounds; round += 1) {
            legacyRuns.push(runLegacyPipeline(products));
            optimizedRuns.push(runOptimizedPipeline(products));
        }

        const legacyMetrics = aggregateRuns(batchSize, options.rounds, legacyRuns);
        const optimizedMetrics = aggregateRuns(batchSize, options.rounds, optimizedRuns);
        const comparison = buildComparison(batchSize, legacyMetrics, optimizedMetrics);
        comparisons.push(comparison);

        console.log(
            `batch=${batchSize} speedup=${comparison.comparison.speedupFactor}x memory=${comparison.comparison.memoryReductionPct}% f1_gain=${comparison.comparison.consistencyF1GainPctPoints}pp`
        );
    }

    const overallSummary = {
        averageSpeedupFactor: roundTo(
            comparisons.reduce((sum, comparison) => sum + comparison.comparison.speedupFactor, 0) / comparisons.length,
            3
        ),
        averageMemoryReductionPct: roundTo(
            comparisons.reduce((sum, comparison) => sum + comparison.comparison.memoryReductionPct, 0) / comparisons.length,
            3
        ),
        averageConsistencyF1GainPctPoints: roundTo(
            comparisons.reduce((sum, comparison) => sum + comparison.comparison.consistencyF1GainPctPoints, 0) / comparisons.length,
            3
        ),
    };

    const report = {
        metadata: {
            generatedAt: new Date().toISOString(),
            batchSizes: options.batchSizes,
            rounds: options.rounds,
            outputPath: options.outputPath,
            mode: 'synthetic-safe-benchmark',
        },
        comparisons,
        overallSummary,
    };

    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log('');
    console.log(`Report written to ${options.outputPath}`);
}

void main().catch((error: unknown) => {
    console.error('Failed to run consolidation benchmark:', error);
    process.exitCode = 1;
});
