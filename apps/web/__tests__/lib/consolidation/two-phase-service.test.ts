import type { BatchStatus, ConsolidationResult, ProductSource, SubmitBatchResponse } from '@/lib/consolidation';
import {
    buildDefaultConsistencyRules,
    TwoPhaseConsolidationService,
} from '@/lib/consolidation/two-phase-service';
import { getBatchStatus, retrieveResults, submitBatch } from '@/lib/consolidation/batch-service';

jest.mock('@/lib/consolidation/batch-service', () => ({
    submitBatch: jest.fn(),
    getBatchStatus: jest.fn(),
    retrieveResults: jest.fn(),
}));

function createCompletedBatchStatus(): BatchStatus {
    return {
        id: 'batch-1',
        status: 'completed',
        is_complete: true,
        is_failed: false,
        is_processing: false,
        total_requests: 2,
        completed_requests: 2,
        failed_requests: 0,
        progress_percent: 100,
        created_at: null,
        completed_at: null,
        metadata: {},
    };
}

describe('TwoPhaseConsolidationService', () => {
    const mockedSubmitBatch = submitBatch as jest.MockedFunction<typeof submitBatch>;
    const mockedGetBatchStatus = getBatchStatus as jest.MockedFunction<typeof getBatchStatus>;
    const mockedRetrieveResults = retrieveResults as jest.MockedFunction<typeof retrieveResults>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedSubmitBatch.mockResolvedValue({
            success: true,
            batch_id: 'batch-1',
            provider: 'openai',
            provider_batch_id: 'batch-1',
            product_count: 2,
        } satisfies SubmitBatchResponse);
        mockedGetBatchStatus.mockResolvedValue(createCompletedBatchStatus());
    });

    it('returns phase 1 results unchanged when phase 2 is disabled', async () => {
        const phase1Results: ConsolidationResult[] = [
            {
                sku: 'SKU-1',
                name: 'Variant One',
                brand: 'Acme',
                category: 'Dog > Food',
            },
        ];
        mockedRetrieveResults.mockResolvedValue(phase1Results);

        const service = new TwoPhaseConsolidationService({
            sleep: async () => undefined,
            pollIntervalMs: 0,
        });

        const response = await service.consolidate(
            [{ sku: 'SKU-1', sources: { distributor: { title: 'Variant One' } } }],
            { enablePhase2: false }
        );

        expect(response.phase).toBe('phase1');
        expect(response.products).toEqual([
            expect.objectContaining({
                sku: 'SKU-1',
                name: 'Variant One',
                consistencyIssues: [],
                consistencyStatus: 'skipped',
            }),
        ]);
        expect(response.consistencyReport).toEqual(
            expect.objectContaining({
                enabled: false,
                flaggedProducts: 0,
                totalIssues: 0,
                skippedReason: 'Phase 2 disabled by configuration',
            })
        );
        expect(mockedSubmitBatch).toHaveBeenCalledTimes(1);
        expect(mockedGetBatchStatus).toHaveBeenCalledWith('batch-1');
        expect(mockedRetrieveResults).toHaveBeenCalledWith('batch-1');
    });

    it('flags exact-match inconsistencies across sibling products', async () => {
        const products: ProductSource[] = [
            {
                sku: 'SKU-1',
                sources: { distributor: { title: 'Variant One' } },
                productLineContext: {
                    productLine: 'Acme Treats',
                    siblings: [{ sku: 'SKU-2', name: 'Variant Two', sources: {} }],
                    expectedBrand: 'Acme',
                    expectedCategory: 'Dog > Treats',
                },
            },
            {
                sku: 'SKU-2',
                sources: { distributor: { title: 'Variant Two' } },
                productLineContext: {
                    productLine: 'Acme Treats',
                    siblings: [{ sku: 'SKU-1', name: 'Variant One', sources: {} }],
                    expectedBrand: 'Acme',
                    expectedCategory: 'Dog > Treats',
                },
            },
        ];

        mockedRetrieveResults.mockResolvedValue([
            {
                sku: 'SKU-1',
                name: 'Variant One',
                brand: 'Acme',
                category: 'Dog > Treats',
            },
            {
                sku: 'SKU-2',
                name: 'Variant Two',
                brand: 'Other Brand',
                category: 'Dog > Treats',
            },
        ]);

        const service = new TwoPhaseConsolidationService({
            sleep: async () => undefined,
            pollIntervalMs: 0,
        });

        const response = await service.consolidate(products, {
            enablePhase2: true,
            consistencyRules: [
                {
                    id: 'brand_consistent_across_siblings',
                    field: 'brand',
                    type: 'exact_match',
                    severity: 'high',
                },
            ],
        });

        expect(response.phase).toBe('phase2');
        expect(response.consistencyReport.enabled).toBe(true);
        expect(response.consistencyReport.flaggedProducts).toBe(2);
        expect(response.consistencyReport.totalIssues).toBe(2);
        expect(response.consistencyReport.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sku: 'SKU-1',
                    ruleId: 'brand_consistent_across_siblings',
                    field: 'brand',
                    conflictingValues: ['Acme', 'Other Brand'],
                }),
                expect.objectContaining({
                    sku: 'SKU-2',
                    ruleId: 'brand_consistent_across_siblings',
                    field: 'brand',
                    conflictingValues: ['Acme', 'Other Brand'],
                }),
            ])
        );
        expect(response.products.every((product) => product.consistencyStatus === 'flagged')).toBe(true);
    });

    it('applies expected-value rules from sibling context', async () => {
        const products: ProductSource[] = [
            {
                sku: 'SKU-3',
                sources: { distributor: { title: 'Seed Blend' } },
                productLineContext: {
                    productLine: 'Bird Seed Blend',
                    siblings: [],
                    expectedBrand: 'GardenPro',
                    expectedCategory: 'Bird > Seed',
                },
            },
        ];

        mockedRetrieveResults.mockResolvedValue([
            {
                sku: 'SKU-3',
                name: 'Seed Blend',
                brand: 'Unknown Brand',
                category: 'Bird > Seed',
            },
        ]);

        const service = new TwoPhaseConsolidationService({
            sleep: async () => undefined,
            pollIntervalMs: 0,
        });

        const response = await service.consolidate(products, {
            enablePhase2: true,
            consistencyRules: buildDefaultConsistencyRules(),
        });

        expect(response.consistencyReport.flaggedProducts).toBe(1);
        expect(response.consistencyReport.totalIssues).toBe(1);
        expect(response.consistencyReport.issues[0]).toEqual(
            expect.objectContaining({
                sku: 'SKU-3',
                ruleId: 'brand_matches_expected_product_line',
                field: 'brand',
                observedValue: 'Unknown Brand',
                expectedValue: 'GardenPro',
            })
        );
        expect(response.products[0]).toEqual(
            expect.objectContaining({
                sku: 'SKU-3',
                consistencyStatus: 'flagged',
            })
        );
    });
});
