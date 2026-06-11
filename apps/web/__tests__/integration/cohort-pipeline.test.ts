/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BatchStatus, ConsolidationResult, ProductSource } from '@/lib/consolidation';
import { buildDefaultConsistencyRules, TwoPhaseConsolidationService } from '@/lib/consolidation/two-phase-service';
import { publishToStorefront } from '@/lib/pipeline/publish';
import {
    MissingProductsIngestionUpcsError,
    persistProductsIngestionSourcesStrict,
} from '@/lib/scraper-callback/products-ingestion';
import { getBatchStatus, retrieveResults, submitBatch } from '@/lib/consolidation/batch-service';
import { syncProductCategoryLinks } from '@/lib/product-category-sync';
import { createClient, createAdminClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
    createAdminClient: jest.fn(),
}));

jest.mock('@/lib/consolidation/batch-service', () => ({
    submitBatch: jest.fn(),
    getBatchStatus: jest.fn(),
    retrieveResults: jest.fn(),
}));

jest.mock('@/lib/product-category-sync', () => ({
    syncProductCategoryLinks: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/product-image-storage', () => ({
    buildProductImageStorageFolder: jest.fn((_scope: string, upc: string) => `pipeline-test/${upc}`),
    replaceInlineImageDataUrls: jest.fn().mockImplementation(async (_supabase: unknown, value: unknown) => ({ value })),
}));

type IngestionStatus = 'imported' | 'processed' | 'consolidated' | 'reviewing' | 'failed';

interface IngestionRow extends Record<string, unknown> {
    upc: string;
    input: Record<string, unknown>;
    sources: Record<string, unknown>;
    consolidated: Record<string, unknown> | null;
    pipeline_status: IngestionStatus;
    created_at: string;
    updated_at: string;
    image_candidates: string[];
    selected_images: Array<{ url: string; selectedAt: string }>;
    confidence_score: number | null;
    error_message: string | null;
}

interface StorefrontProductRow extends Record<string, unknown> {
    id: string;
    upc: string;
}

interface PipelineState {
    ingestionRows: Map<string, IngestionRow>;
    storefrontRows: Map<string, StorefrontProductRow>;
    nextStorefrontId: number;
}

interface MockSupabaseBundle {
    state: PipelineState;
    supabase: SupabaseClient;
}

const NOW = '2026-04-08T15:00:00.000Z';
const NOW_NUM = new Date(NOW).getTime();

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockedCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockedSubmitBatch = submitBatch as jest.MockedFunction<typeof submitBatch>;
const mockedGetBatchStatus = getBatchStatus as jest.MockedFunction<typeof getBatchStatus>;
const mockedRetrieveResults = retrieveResults as jest.MockedFunction<typeof retrieveResults>;
const mockedSyncProductCategoryLinks = syncProductCategoryLinks as jest.MockedFunction<
    typeof syncProductCategoryLinks
>;

function buildImportedRow(
    upc: string,
    input: Record<string, unknown>,
    sourceSeed: Record<string, unknown> = {}
): IngestionRow {
    return {
        upc,
        input,
        sources: sourceSeed,
        consolidated: null,
        pipeline_status: 'imported',
        created_at: NOW,
        updated_at: NOW,
        image_candidates: [],
        selected_images: [],
        confidence_score: null,
        error_message: null,
    };
}

function createCompletedBatchStatus(): BatchStatus {
    return {
        id: 'batch-cohort-1',
        status: 'completed',
        is_complete: true,
        is_failed: false,
        is_processing: false,
        total_requests: 4,
        completed_requests: 4,
        failed_requests: 0,
        progress_percent: 100,
        created_at: NOW_NUM,
        completed_at: NOW_NUM,
        metadata: {},
    };
}

function createFailedBatchStatus(): BatchStatus {
    return {
        id: 'batch-cohort-2',
        status: 'failed',
        is_complete: false,
        is_failed: true,
        is_processing: false,
        total_requests: 1,
        completed_requests: 0,
        failed_requests: 1,
        progress_percent: 0,
        created_at: NOW_NUM,
        completed_at: NOW_NUM,
        metadata: {},
    };
}

function createMockSupabase(initialRows: IngestionRow[]): MockSupabaseBundle {
    const state: PipelineState = {
        ingestionRows: new Map(initialRows.map((row) => [row.upc, structuredClone(row)])),
        storefrontRows: new Map<string, StorefrontProductRow>(),
        nextStorefrontId: 1,
    };

    const productsIngestionTable = {
        select: (columns: string) => {
            if (columns === 'upc, sources') {
                return {
                    in: async (_column: string, upcs: string[]) => ({
                        data: upcs
                            .map((upc) => state.ingestionRows.get(upc))
                            .filter((row): row is IngestionRow => Boolean(row))
                            .map((row) => ({ upc: row.upc, sources: structuredClone(row.sources) })),
                        error: null,
                    }),
                };
            }

            if (columns === 'upc, input, consolidated, pipeline_status') {
                return {
                    eq: (_column: string, upc: string) => ({
                        single: async () => {
                            const row = state.ingestionRows.get(upc);
                            if (!row) {
                                return { data: null, error: { message: `Missing ingestion row for ${upc}` } };
                            }

                            return {
                                data: {
                                    upc: row.upc,
                                    input: structuredClone(row.input),
                                    consolidated: row.consolidated ? structuredClone(row.consolidated) : null,
                                    pipeline_status: row.pipeline_status,
                                },
                                error: null,
                            };
                        },
                    }),
                };
            }

            throw new Error(`Unsupported products_ingestion select columns: ${columns}`);
        },
        upsert: async (rows: Array<Record<string, unknown>>) => {
            for (const payload of rows) {
                const upcValue = payload.upc;
                if (typeof upcValue !== 'string') {
                    return { error: { message: 'Missing upc in upsert payload' } };
                }

                const existing = state.ingestionRows.get(upcValue);
                if (!existing) {
                    return { error: { message: `Missing ingestion row for ${upcValue}` } };
                }

                state.ingestionRows.set(upcValue, {
                    ...existing,
                    ...structuredClone(payload),
                } as IngestionRow);
            }

            return { error: null };
        },
        update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, upc: string) => {
                const existing = state.ingestionRows.get(upc);
                if (!existing) {
                    return { error: { message: `Missing ingestion row for ${upc}` } };
                }

                state.ingestionRows.set(upc, {
                    ...existing,
                    ...structuredClone(payload),
                } as IngestionRow);

                return { error: null };
            },
        }),
    };

    const productsTable = {
        select: (columns: string) => {
            if (columns !== 'id') {
                throw new Error(`Unsupported products select columns: ${columns}`);
            }

            return {
                eq: (_column: string, upc: string) => ({
                    maybeSingle: async () => {
                        const existing = Array.from(state.storefrontRows.values()).find((row) => row.upc === upc);
                        return {
                            data: existing ? { id: existing.id } : null,
                            error: null,
                        };
                    },
                }),
            };
        },
        update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
                const existing = state.storefrontRows.get(id);
                if (!existing) {
                    return { error: { message: `Missing storefront row for ${id}` } };
                }

                state.storefrontRows.set(id, {
                    ...existing,
                    ...structuredClone(payload),
                    id,
                });

                return { error: null };
            },
        }),
        insert: (payload: Record<string, unknown>) => ({
            select: (_columns: string) => ({
                single: async () => {
                    const id = `product-${state.nextStorefrontId}`;
                    state.nextStorefrontId += 1;
                    state.storefrontRows.set(id, {
                        id,
                        ...structuredClone(payload),
                    } as StorefrontProductRow);
                    return { data: { id }, error: null };
                },
            }),
        }),
    };

    const categoriesTable = {
        select: async () => ({
            data: [
                { id: 'cat-dog-food', name: 'Food', slug: 'dog-food', breadcrumb: 'Dog > Food' },
                { id: 'cat-bird-seed', name: 'Seed', slug: 'bird-seed', breadcrumb: 'Bird > Seed' },
            ],
            error: null,
        }),
    };

    const facetDefinitionsTable = {
        select: () => ({
            in: async () => ({
                data: [
                    { id: 'def-1', slug: 'animal-type', name: 'Animal Type' },
                    { id: 'def-2', slug: 'food-form', name: 'Food Form' },
                ],
                error: null,
            }),
        }),
    };

    const facetValuesTable = {
        upsert: () => ({
            select: () => ({
                single: async () => ({
                    data: { id: 'val-1' },
                    error: null,
                }),
            }),
        }),
    };

    const productFacetsTable = {
        delete: () => ({
            eq: async () => ({ error: null }),
        }),
        insert: async () => ({ error: null }),
    };

    const shopsiteProductSyncTable = {
        upsert: async () => ({ error: null }),
    };

    const externalSourcesTable = {
        select: () => ({
            eq: () => ({
                maybeSingle: async () => ({ data: { id: 'ext-1' }, error: null }),
            }),
        }),
    };

    const supabase = {
        from: (table: string) => {
            if (table === 'products_ingestion') {
                return productsIngestionTable;
            }

            if (table === 'products') {
                return productsTable;
            }

            if (table === 'categories') {
                return categoriesTable;
            }

            if (table === 'facet_definitions') {
                return facetDefinitionsTable;
            }

            if (table === 'facet_values') {
                return facetValuesTable;
            }

            if (table === 'product_facets') {
                return productFacetsTable;
            }

            if (table === 'shopsite_product_sync') {
                return shopsiteProductSyncTable;
            }

            if (table === 'external_sources') {
                return externalSourcesTable;
            }

            throw new Error(`Unexpected table ${table}`);
        },
    };

    return {
        state,
        supabase: supabase as unknown as SupabaseClient,
    };
}

function buildProductSources(rows: IngestionRow[]): ProductSource[] {
    const productLines = new Map<string, { expectedBrand: string; expectedCategory: string; upcs: string[] }>([
        ['Acme Kibble', { expectedBrand: 'Acme', expectedCategory: 'Dog > Food', upcs: ['111111110001', '111111110002'] }],
        ['GardenPro Seed', { expectedBrand: 'GardenPro', expectedCategory: 'Bird > Seed', upcs: ['222222220001', '222222220002'] }],
    ]);

    return rows.map((row) => {
        const productLine = String(row.input.product_line);
        const line = productLines.get(productLine);

        if (!line) {
            throw new Error(`Unknown product line for ${row.upc}`);
        }

        return {
            upc: row.upc,
            sources: structuredClone(row.sources),
            productLineContext: {
                productLine,
                siblings: line.upcs
                    .filter((upc) => upc !== row.upc)
                    .map((upc) => {
                        const sibling = rows.find((candidate) => candidate.upc === upc);

                        if (!sibling) {
                            throw new Error(`Missing sibling ${upc} for ${row.upc}`);
                        }

                        return {
                            upc,
                            name: String(sibling.input.name),
                            sources: structuredClone(sibling.sources),
                        };
                    }),
                expectedBrand: line.expectedBrand,
                expectedCategory: line.expectedCategory,
            },
        } satisfies ProductSource;
    });
}

function moveConsistencyPassedRowsToFinalized(
    state: PipelineState,
    results: Array<ConsolidationResult & { consistencyStatus: 'passed' | 'flagged' | 'skipped' }>
): void {
    for (const result of results) {
        const row = state.ingestionRows.get(result.upc);
        if (!row) {
            throw new Error(`Missing ingestion row for ${result.upc}`);
        }

        const sourceImages = Object.values(row.sources)
            .flatMap((source) => {
                if (!source || typeof source !== 'object') {
                    return [];
                }

                const images = (source as { images?: unknown }).images;
                return Array.isArray(images)
                    ? images.filter((image): image is string => typeof image === 'string')
                    : [];
            });

        const finalizedRow: IngestionRow = {
            ...row,
            consolidated: {
                name: result.name ?? row.input.name,
                description: result.description ?? `${String(row.input.name)} normalized for storefront`,
                price: typeof result.price === 'string' ? Number.parseFloat(result.price) : row.input.price,
                category: result.category ?? row.input.category,
                images: sourceImages,
                search_keywords: result.search_keywords ?? String(row.input.search_keywords ?? ''),
                weight: result.weight,
                confidence_score: result.confidence_score,
                brand_id: 'brand-1',
            },
            pipeline_status: result.consistencyStatus === 'passed' ? 'reviewing' : 'processed',
            updated_at: NOW,
            confidence_score: result.confidence_score ?? null,
            error_message: null,
        };

        state.ingestionRows.set(result.upc, finalizedRow);
    }
}

describe('cohort processing pipeline integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('processes imported cohorts through scrape, consistency review, and publish', async () => {
        const { supabase, state } = createMockSupabase([
            buildImportedRow('111111110001', {
                name: 'Acme Chicken Kibble 5 lb',
                price: 24.99,
                category: 'Dog > Food',
                product_line: 'Acme Kibble',
                search_keywords: 'dog kibble, chicken',
            }),
            buildImportedRow('111111110002', {
                name: 'Acme Chicken Kibble 15 lb',
                price: 54.99,
                category: 'Dog > Food',
                product_line: 'Acme Kibble',
                search_keywords: 'dog kibble, chicken',
            }),
            buildImportedRow(
                '222222220001',
                {
                    name: 'GardenPro Finch Seed 5 lb',
                    price: 18.99,
                    category: 'Bird > Seed',
                    product_line: 'GardenPro Seed',
                    search_keywords: 'bird seed, finch',
                },
                { legacy_feed: { title: 'GardenPro Finch Seed 5 lb' } }
            ),
            buildImportedRow('222222220002', {
                name: 'GardenPro Finch Seed 20 lb',
                price: 49.99,
                category: 'Bird > Seed',
                product_line: 'GardenPro Seed',
                search_keywords: 'bird seed, finch',
            }),
        ]);

        mockedCreateClient.mockResolvedValue(supabase);
        mockedCreateAdminClient.mockResolvedValue(supabase);
        mockedSubmitBatch.mockResolvedValue({
            success: true,
            batch_id: 'batch-cohort-1',
            provider: 'openai',
            provider_batch_id: 'provider-batch-cohort-1',
            product_count: 4,
        });
        mockedGetBatchStatus.mockResolvedValue(createCompletedBatchStatus());
        mockedRetrieveResults.mockResolvedValue([
            {
                upc: '111111110001',
                name: 'Acme Chicken Kibble 5 lb',
                brand: 'Acme',
                category: 'Dog > Food',
                price: '24.99',
                description: 'Small-bag chicken kibble for adult dogs.',
                search_keywords: 'dog kibble, chicken, acme',
                confidence_score: 0.96,
            },
            {
                upc: '111111110002',
                name: 'Acme Chicken Kibble 15 lb',
                brand: 'Acme',
                category: 'Dog > Food',
                price: '54.99',
                description: 'Large-bag chicken kibble for adult dogs.',
                search_keywords: 'dog kibble, chicken, acme',
                confidence_score: 0.97,
            },
            {
                upc: '222222220001',
                name: 'GardenPro Finch Seed 5 lb',
                brand: 'GardenPro',
                category: 'Bird > Seed',
                price: '18.99',
                description: 'Seed blend tuned for finches.',
                search_keywords: 'bird seed, finch, gardenpro',
                confidence_score: 0.91,
            },
            {
                upc: '222222220002',
                name: 'GardenPro Finch Seed 20 lb',
                brand: 'WildHarvest',
                category: 'Bird > Seed',
                price: '49.99',
                description: 'Large seed blend with mismatched branding.',
                search_keywords: 'bird seed, finch, harvest',
                confidence_score: 0.82,
            },
        ]);

        const scrapedUpcs = await persistProductsIngestionSourcesStrict(
            supabase,
            {
                '111111110001': {
                    amazon: {
                        title: 'Acme Chicken Kibble 5 lb',
                        price: 24.99,
                        images: ['https://cdn.example.com/111111110001.jpg'],
                    },
                },
                '111111110002': {
                    chewy: {
                        title: 'Acme Chicken Kibble 15 lb',
                        price: 54.99,
                        images: ['https://cdn.example.com/111111110002.jpg'],
                    },
                },
                '222222220001': {
                    amazon: {
                        title: 'GardenPro Finch Seed 5 lb',
                        price: 18.99,
                        images: ['https://cdn.example.com/222222220001.jpg'],
                    },
                },
                '222222220002': {
                    amazon: {
                        title: 'GardenPro Finch Seed 20 lb',
                        price: 49.99,
                        images: ['https://cdn.example.com/222222220002.jpg'],
                    },
                },
            },
            false,
            NOW
        );

        expect(scrapedUpcs).toEqual([
            '111111110001',
            '111111110002',
            '222222220001',
            '222222220002',
        ]);
        expect(
            Array.from(state.ingestionRows.values()).every((row) => row.pipeline_status === 'processed')
        ).toBe(true);
        expect(state.ingestionRows.get('222222220001')?.sources).toEqual(
            expect.objectContaining({
                legacy_feed: { title: 'GardenPro Finch Seed 5 lb' },
                amazon: expect.objectContaining({ title: 'GardenPro Finch Seed 5 lb' }),
            })
        );

        const service = new TwoPhaseConsolidationService({
            sleep: async () => undefined,
            pollIntervalMs: 0,
        });

        const consolidation = await service.consolidate(
            buildProductSources(Array.from(state.ingestionRows.values())),
            {
                enablePhase2: true,
                consistencyRules: [
                    {
                        id: 'brand_consistent_across_siblings',
                        field: 'brand',
                        type: 'exact_match',
                        severity: 'high',
                    },
                    ...buildDefaultConsistencyRules(),
                ],
            }
        );

        expect(consolidation.phase).toBe('phase2');
        expect(consolidation.consistencyReport.flaggedProducts).toBe(2);
        expect(consolidation.consistencyReport.byUpc['222222220001']).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    ruleId: 'brand_consistent_across_siblings',
                    conflictingValues: ['GardenPro', 'WildHarvest'],
                }),
            ])
        );
        expect(consolidation.products.filter((product) => product.consistencyStatus === 'passed')).toHaveLength(2);

        moveConsistencyPassedRowsToFinalized(state, consolidation.products);

        const publishAcmeSmall = await publishToStorefront('111111110001');
        const publishAcmeLarge = await publishToStorefront('111111110002');
        const blockedPublish = await publishToStorefront('222222220002');

        expect(publishAcmeSmall).toEqual({ success: true, action: 'created', productId: 'product-1' });
        expect(publishAcmeLarge).toEqual({ success: true, action: 'created', productId: 'product-2' });
        expect(blockedPublish).toEqual(
            expect.objectContaining({
                success: false,
                error: expect.stringContaining('Product must be in reviewing'),
            })
        );
        expect(Array.from(state.storefrontRows.values()).map((row) => row.upc).sort()).toEqual([
            '111111110001',
            '111111110002',
        ]);
        expect(state.ingestionRows.get('222222220001')?.pipeline_status).toBe('processed');
        expect(state.ingestionRows.get('222222220002')?.pipeline_status).toBe('processed');
    });

    it('fails fast on missing imported rows and propagation of consolidation batch failures', async () => {
        const { supabase, state } = createMockSupabase([
            buildImportedRow('333333330001', {
                name: 'Cohort Failure Harness',
                price: 12.99,
                category: 'Dog > Toys',
                product_line: 'Failure Line',
            }),
        ]);

        mockedCreateClient.mockResolvedValue(supabase);
        mockedCreateAdminClient.mockResolvedValue(supabase);

        await expect(
            persistProductsIngestionSourcesStrict(
                supabase,
                {
                    '333333330001': {
                        amazon: { title: 'Cohort Failure Harness', images: ['https://cdn.example.com/failure.jpg'] },
                    },
                    '333333330999': {
                        amazon: { title: 'Missing Import', images: ['https://cdn.example.com/missing.jpg'] },
                    },
                },
                false,
                NOW
            )
        ).rejects.toBeInstanceOf(MissingProductsIngestionUpcsError);

        expect(state.ingestionRows.get('333333330001')?.pipeline_status).toBe('imported');
        expect(state.storefrontRows.size).toBe(0);

        mockedSubmitBatch.mockResolvedValue({
            success: true,
            batch_id: 'batch-cohort-2',
            provider: 'openai',
            provider_batch_id: 'provider-batch-cohort-2',
            product_count: 1,
        });
        mockedGetBatchStatus.mockResolvedValue(createFailedBatchStatus());

        const service = new TwoPhaseConsolidationService({
            sleep: async () => undefined,
            pollIntervalMs: 0,
            maxPollAttempts: 1,
        });

        await expect(
            service.consolidate(
                [
                    {
                        upc: '333333330001',
                        sources: { amazon: { title: 'Cohort Failure Harness' } },
                    },
                ],
                { enablePhase2: true }
            )
        ).rejects.toThrow('Phase 1 consolidation batch failed with status failed');
        expect(mockedRetrieveResults).not.toHaveBeenCalled();
    });
});
