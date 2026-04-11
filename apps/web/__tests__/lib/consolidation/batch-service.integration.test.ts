import {
    applyConsolidationResults,
    cancelBatch,
    getBatchStatus,
    retrieveResults,
    submitBatch,
} from '@/lib/consolidation/batch-service';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { buildPromptContext, buildUserPrompt, getCategories } from '@/lib/consolidation/prompt-builder';
import { getConsolidationConfig, getOpenAIClient } from '@/lib/consolidation/openai-client';

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(),
    createClient: jest.fn(),
}));

jest.mock('@/lib/consolidation/prompt-builder', () => ({
    buildPromptContext: jest.fn(),
    buildUserPrompt: jest.fn(),
    getCategories: jest.fn(),
}));

jest.mock('@/lib/consolidation/openai-client', () => ({
    getOpenAIClient: jest.fn(),
    getConsolidationConfig: jest.fn(),
    CONSOLIDATION_CONFIG: {
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        temperature: 0.1,
        completionWindow: '24h',
    },
}));

const BATCH_LOOKUP_COLUMNS =
    'id, provider, provider_batch_id, openai_batch_id, total_requests, completed_requests, failed_requests, metadata';

function makeBatchLookupQuery(data: Record<string, unknown> | null) {
    return {
        or: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
            data,
            error: null,
        }),
    };
}

describe('consolidation batch integration behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getConsolidationConfig as jest.Mock).mockResolvedValue({
            model: 'gpt-4o-mini',
            maxTokens: 1024,
            temperature: 0.1,
            completionWindow: '24h',
            confidence_threshold: 0.7,
            llm_provider: 'openai',
            configured_llm_provider: 'openai',
            llm_api_key: 'test-openai-key',
            llm_base_url: null,
            llm_supports_batch_api: true,
            routing_key: null,
        });
        (getCategories as jest.Mock).mockResolvedValue([{ id: 'cat-1', name: 'Dog', slug: 'dog' }]);
        (buildUserPrompt as jest.Mock).mockReturnValue('user prompt');
    });

    it('submitBatch persists OpenAI batch id and string metadata', async () => {
        const insert = jest.fn().mockResolvedValue({ error: null });
        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table === 'batch_jobs') {
                    return { insert };
                }
                throw new Error(`Unexpected table ${table}`);
            }),
        };

        (createClient as jest.Mock).mockResolvedValue(supabaseMock);
        (createAdminClient as jest.Mock).mockResolvedValue({
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: jest.fn((columns: string) => {
                        if (columns !== BATCH_LOOKUP_COLUMNS) {
                            throw new Error(`Unexpected select columns ${columns}`);
                        }

                        return makeBatchLookupQuery(null);
                    }),
                };
            }),
        });
        (buildPromptContext as jest.Mock).mockResolvedValue({
            systemPrompt: 'system',
            shopsitePages: ['Dog Toys', 'Dog Supplies Shop All'],
        });

        const openAiMock = {
            files: {
                create: jest.fn().mockResolvedValue({ id: 'file_123' }),
            },
            batches: {
                create: jest.fn().mockResolvedValue({ id: 'batch_123', status: 'validating' }),
            },
        };
        (getOpenAIClient as jest.Mock).mockResolvedValue(openAiMock);

        const response = await submitBatch(
            [
                {
                    sku: 'SKU-1',
                    sources: { ai_discovery: { Name: 'Dog Toy', Brand: 'KONG' } },
                },
            ],
            {
                description: 'test batch',
                auto_apply: true,
                scrape_job_id: 'job-1',
            }
        );

        expect('success' in response && response.success).toBe(true);
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'openai',
                provider_batch_id: 'batch_123',
                openai_batch_id: 'batch_123',
                auto_apply: true,
                input_file_id: 'file_123',
                provider_input_file_id: 'file_123',
                metadata: expect.objectContaining({
                    description: 'test batch',
                    auto_apply: 'true',
                    scrape_job_id: 'job-1',
                    llm_provider: 'openai',
                    llm_model: 'gpt-4o-mini',
                    configured_llm_provider: 'openai',
                    routing_key: 'job-1',
                }),
            })
        );
    });

    it('retrieveResults parses structured output and returns normalized taxonomy fields', async () => {
        (buildPromptContext as jest.Mock).mockResolvedValue({
            systemPrompt: 'system',
            shopsitePages: ['Dog Toys', 'Dog Supplies Shop All'],
        });
        (getCategories as jest.Mock).mockResolvedValue([{ id: 'cat-1', name: 'Dog', slug: 'dog' }]);
        (createAdminClient as jest.Mock).mockResolvedValue({
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: jest.fn((columns: string) => {
                        if (columns !== BATCH_LOOKUP_COLUMNS) {
                            throw new Error(`Unexpected select columns ${columns}`);
                        }

                        return makeBatchLookupQuery(null);
                    }),
                };
            }),
        });

        const outputLine = JSON.stringify({
            custom_id: 'SKU-1',
            response: {
                status_code: 200,
                body: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    name: 'KONG AIR DOG SQUEAKER TENNIS BALL 3 CT',
                                    brand: 'KONG',
                                    weight: '3.00',
                                    description: 'Durable fetch toy for active dogs.',
                                    long_description: 'Durable fetch toy for active dogs with a squeaker and tennis-ball texture.',
                                    search_keywords: 'dog toy, fetch toy, squeaker ball',
                                    product_on_pages: ['Dog Toys', 'Dog Supplies Shop All'],
                                    category: ['Dog'],
                                    confidence_score: 0.93,
                                }),
                            },
                        },
                    ],
                },
            },
        });

        const openAiMock = {
            batches: {
                retrieve: jest.fn().mockResolvedValue({
                    id: 'batch_1',
                    status: 'completed',
                    output_file_id: 'out_1',
                    error_file_id: null,
                }),
            },
            files: {
                content: jest.fn().mockResolvedValue({
                    text: async () => outputLine,
                }),
            },
        };
        (getOpenAIClient as jest.Mock).mockResolvedValue(openAiMock);

        const results = await retrieveResults('batch_1');

        expect(Array.isArray(results)).toBe(true);
        if (Array.isArray(results)) {
            expect(results[0]).toEqual(
                expect.objectContaining({
                    sku: 'SKU-1',
                    category: 'Dog',
                    search_keywords: 'dog toy, fetch toy, squeaker ball',
                    confidence_score: 0.93,
                })
            );
        }
    });

    it('retrieveResults returns actionable errors when required fields are missing', async () => {
        (buildPromptContext as jest.Mock).mockResolvedValue({
            systemPrompt: 'system',
            shopsitePages: ['Horse Treats'],
        });
        (getCategories as jest.Mock).mockResolvedValue([
            { id: 'cat-1', name: 'Horse Feed & Treats', slug: 'horse-feed-treats' },
        ]);
        (createAdminClient as jest.Mock).mockResolvedValue({
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: jest.fn((columns: string) => {
                        if (columns !== BATCH_LOOKUP_COLUMNS) {
                            throw new Error(`Unexpected select columns ${columns}`);
                        }

                        return makeBatchLookupQuery(null);
                    }),
                };
            }),
        });

        const outputLine = JSON.stringify({
            custom_id: '813347001025',
            response: {
                status_code: 200,
                body: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    name: 'Stud Muffins Horse Treats 20 oz.',
                                    brand: 'Bubbacare',
                                    weight: '1.25',
                                    description: '',
                                    long_description: 'Horse treats.',
                                    product_on_pages: ['Horse Treats'],
                                    category: ['Horse Feed & Treats'],
                                    confidence_score: 0.95,
                                }),
                            },
                        },
                    ],
                },
            },
        });

        const openAiMock = {
            batches: {
                retrieve: jest.fn().mockResolvedValue({
                    id: 'batch_missing',
                    status: 'completed',
                    output_file_id: 'out_missing',
                    error_file_id: null,
                }),
            },
            files: {
                content: jest.fn().mockResolvedValue({
                    text: async () => outputLine,
                }),
            },
        };
        (getOpenAIClient as jest.Mock).mockResolvedValue(openAiMock);

        const results = await retrieveResults('batch_missing');

        expect(results).toEqual([
            {
                sku: '813347001025',
                error: 'Invalid consolidation output: description is required',
            },
        ]);
    });

    it('applyConsolidationResults stores quality metrics into batch metadata', async () => {
        const productsIngestionSelectBySkuIn = {
            in: jest.fn().mockResolvedValue({
                data: [{
                    sku: 'SKU-1',
                    consolidated: { images: ['https://cdn.example.com/1.jpg'] },
                    sources: {},
                    input: {},
                    image_candidates: [],
                    selected_images: [],
                }],
                error: null,
            }),
        };
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { sku: 'SKU-1' },
            error: null,
        });
        const productsIngestionUpdateSelect = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionUpdateMaybeSingle });
        const productsIngestionUpdateEq = jest.fn();
        productsIngestionUpdateEq.mockReturnValue({
            eq: productsIngestionUpdateEq,
            select: productsIngestionUpdateSelect,
        });
        const productsIngestionUpdate = jest
            .fn()
            .mockReturnValue({ eq: productsIngestionUpdateEq });
        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: { images: ['https://cdn.example.com/1.jpg'] },
                updated_at: '2026-03-18T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns === 'sku, consolidated, sources, input, image_candidates, selected_images') {
                return productsIngestionSelectBySkuIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const batchJobsSelectQuery = {
            or: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
                data: {
                    id: 'batch-db-1',
                    provider: 'openai',
                    provider_batch_id: 'batch_1',
                    openai_batch_id: 'batch_1',
                    metadata: { source: 'test' },
                },
                error: null,
            }),
        };
        const batchJobsUpdateEq = jest.fn().mockResolvedValue({ error: null });
        const batchJobsUpdate = jest.fn(() => ({ eq: batchJobsUpdateEq }));

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-1', name: 'KONG' }],
            error: null,
        });

        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: productsIngestionSelect,
                        update: productsIngestionUpdate,
                    };
                }
                if (table === 'brands') {
                    return { select: brandsSelect };
                }
                if (table === 'batch_jobs') {
                    return {
                        select: jest.fn((columns: string) => {
                            if (columns !== BATCH_LOOKUP_COLUMNS) {
                                throw new Error(`Unexpected batch_jobs select columns: ${columns}`);
                            }
                            return batchJobsSelectQuery;
                        }),
                        update: batchJobsUpdate,
                    };
                }
                throw new Error(`Unexpected table ${table}`);
            }),
        };
        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults(
            [
                {
                    sku: 'SKU-1',
                    name: 'KONG Air Dog Ball 3 ct',
                    brand: 'KONG',
                    description: 'Dog toy',
                    long_description: 'Dog toy with durable construction for fetch sessions.',
                    search_keywords: 'dog toy, fetch toy, squeaker ball',
                    product_on_pages: 'Dog Toys|Dog Supplies Shop All',
                    category: 'Dog',
                    confidence_score: 0.91,
                },
            ],
            'batch_1'
        );

        expect('status' in response && response.status === 'applied').toBe(true);
        if ('status' in response) {
            expect(response.quality_metrics).toEqual(
                expect.objectContaining({
                    matched_brand_count: 1,
                    unresolved_brand_count: 0,
                })
            );
        }

        expect(batchJobsUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    source: 'test',
                    quality_metrics: expect.objectContaining({ matched_brand_count: 1 }),
                }),
            })
        );
        expect(batchJobsUpdateEq).toHaveBeenCalledWith('id', 'batch-db-1');
    });

    it('cancelBatch resolves legacy UUID id to OpenAI batch id before cancellation', async () => {
        const legacyId = '550e8400-e29b-41d4-a716-446655440000';

        const batchJobsUpdateEq = jest.fn().mockResolvedValue({ error: null });
        const batchJobsUpdate = jest.fn(() => ({ eq: batchJobsUpdateEq }));

        const adminSupabaseMock = {
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: jest.fn((columns: string) => {
                        if (columns === BATCH_LOOKUP_COLUMNS) {
                            return makeBatchLookupQuery({
                                id: legacyId,
                                provider: 'openai',
                                provider_batch_id: 'batch_resolved',
                                openai_batch_id: 'batch_resolved',
                                metadata: {},
                            });
                        }

                        throw new Error(`Unexpected select columns ${columns}`);
                    }),
                };
            }),
        };

        const clientSupabaseMock = {
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    update: batchJobsUpdate,
                };
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(adminSupabaseMock);
        (createClient as jest.Mock).mockResolvedValue(clientSupabaseMock);

        const cancel = jest.fn().mockResolvedValue({ id: 'batch_resolved', status: 'cancelled' });
        (getOpenAIClient as jest.Mock).mockResolvedValue({
            batches: {
                cancel,
            },
        });

        const result = await cancelBatch(legacyId);

        expect(result).toEqual({ status: 'cancelled' });
        expect(cancel).toHaveBeenCalledWith('batch_resolved');
        expect(batchJobsUpdateEq).toHaveBeenCalledWith('id', legacyId);
    });

    it('getBatchStatus resolves UUID legacy identifier before OpenAI retrieval', async () => {
        const legacyId = '550e8400-e29b-41d4-a716-446655440000';
        const batchResponse = {
            id: 'batch_resolved',
            status: 'in_progress',
            request_counts: { total: 10, completed: 6, failed: 1 },
            input_file_id: 'file_1',
            output_file_id: 'out_1',
            error_file_id: null,
            created_at: 1730000000,
            completed_at: null,
            metadata: { description: 'batch' },
        };

        const updateEq = jest.fn().mockResolvedValue({ error: null });
        const update = jest.fn(() => ({
            eq: updateEq,
        }));
        const adminSupabaseMock = {
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }
                return {
                    select: jest.fn((columns: string) => {
                        if (columns !== BATCH_LOOKUP_COLUMNS) {
                            throw new Error(`Unexpected select columns ${columns}`);
                        }

                        return makeBatchLookupQuery({
                            id: legacyId,
                            provider: 'openai',
                            provider_batch_id: 'batch_resolved',
                            openai_batch_id: 'batch_resolved',
                            metadata: { description: 'batch' },
                        });
                    }),
                    update,
                };
            }),
        };
        (createAdminClient as jest.Mock).mockResolvedValue(adminSupabaseMock);

        const retrieve = jest.fn().mockResolvedValue(batchResponse);
        (getOpenAIClient as jest.Mock).mockResolvedValue({
            batches: {
                retrieve,
            },
        });

        const status = await getBatchStatus(legacyId);

        expect('status' in status && status.status === 'in_progress').toBe(true);
        expect(retrieve).toHaveBeenCalledWith('batch_resolved');
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'openai',
                provider_batch_id: 'batch_resolved',
                provider_input_file_id: 'file_1',
                provider_output_file_id: 'out_1',
                status: 'in_progress',
            }),
        );
        expect(updateEq).toHaveBeenCalledWith('id', legacyId);
    });
});
