import {
    applyConsolidationResults,
    cancelBatch,
    getBatchStatus,
    retrieveResults,
    submitBatch,
} from '@/lib/consolidation/batch-service';
import { createClient } from '@/lib/supabase/server';
import { buildPromptContext } from '@/lib/consolidation/prompt-builder';
import { getOpenAIClient } from '@/lib/consolidation/openai-client';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/consolidation/prompt-builder', () => ({
    buildPromptContext: jest.fn(),
}));

jest.mock('@/lib/consolidation/openai-client', () => ({
    getOpenAIClient: jest.fn(),
    CONSOLIDATION_CONFIG: {
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        temperature: 0.1,
        completionWindow: '24h',
    },
}));

describe('consolidation batch integration behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        (buildPromptContext as jest.Mock).mockResolvedValue({
            systemPrompt: 'system',
            categories: ['Dog'],
            productTypes: ['Dog Toys'],
        });

        const openAiMock = {
            files: {
                create: jest.fn().mockResolvedValue({ id: 'file_123' }),
            },
            batches: {
                create: jest.fn().mockResolvedValue({ id: 'batch_123', status: 'validating' }),
            },
        };
        (getOpenAIClient as jest.Mock).mockReturnValue(openAiMock);

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
                openai_batch_id: 'batch_123',
                auto_apply: true,
                metadata: {
                    description: 'test batch',
                    auto_apply: 'true',
                    scrape_job_id: 'job-1',
                },
            })
        );
    });

    it('retrieveResults parses structured output and returns normalized taxonomy fields', async () => {
        (buildPromptContext as jest.Mock).mockResolvedValue({
            systemPrompt: 'system',
            categories: ['Dog'],
            productTypes: ['Dog Toys'],
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
                                    category: ['Dog'],
                                    product_type: ['Dog Toys'],
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
        (getOpenAIClient as jest.Mock).mockReturnValue(openAiMock);

        const results = await retrieveResults('batch_1');

        expect(Array.isArray(results)).toBe(true);
        if (Array.isArray(results)) {
            expect(results[0]).toEqual(
                expect.objectContaining({
                    sku: 'SKU-1',
                    category: 'Dog',
                    product_type: 'Dog Toys',
                    confidence_score: 0.93,
                })
            );
        }
    });

    it('applyConsolidationResults stores quality metrics into batch metadata', async () => {
        const productsIngestionSelect = {
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', consolidated: { images: ['https://cdn.example.com/1.jpg'] } }],
                error: null,
            }),
        };
        const productsIngestionUpdateEq = jest.fn().mockResolvedValue({ error: null });
        const productsIngestionUpdate = jest.fn(() => ({ eq: productsIngestionUpdateEq }));

        const batchJobsSelectQuery = {
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'batch-db-1', metadata: { source: 'test' } },
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
                        select: jest.fn(() => productsIngestionSelect),
                        update: productsIngestionUpdate,
                    };
                }
                if (table === 'brands') {
                    return { select: brandsSelect };
                }
                if (table === 'batch_jobs') {
                    return {
                        select: jest.fn(() => batchJobsSelectQuery),
                        update: batchJobsUpdate,
                    };
                }
                throw new Error(`Unexpected table ${table}`);
            }),
        };
        (createClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults(
            [
                {
                    sku: 'SKU-1',
                    name: 'KONG Air Dog Ball 3 ct',
                    brand: 'KONG',
                    description: 'Dog toy',
                    category: 'Dog',
                    product_type: 'Dog Toys',
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

        let selectCallCount = 0;

        const batchJobsUpdateEq = jest.fn().mockResolvedValue({ error: null });
        const batchJobsUpdate = jest.fn(() => ({ eq: batchJobsUpdateEq }));

        const makeSelectChain = () => ({
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockImplementation(async () => {
                selectCallCount += 1;
                if (selectCallCount === 1) {
                    return { data: { openai_batch_id: 'batch_resolved' }, error: null };
                }
                if (selectCallCount === 2) {
                    return { data: null, error: null };
                }
                return { data: { id: legacyId, metadata: {} }, error: null };
            }),
        });

        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: jest.fn(() => makeSelectChain()),
                    update: batchJobsUpdate,
                };
            }),
        };
        (createClient as jest.Mock).mockResolvedValue(supabaseMock);

        const cancel = jest.fn().mockResolvedValue({ id: 'batch_resolved', status: 'cancelled' });
        (getOpenAIClient as jest.Mock).mockReturnValue({
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

        const selectQuery = {
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { openai_batch_id: 'batch_resolved' }, error: null }),
        };
        const upsert = jest.fn().mockResolvedValue({ error: null });
        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table !== 'batch_jobs') {
                    throw new Error(`Unexpected table ${table}`);
                }
                return {
                    select: jest.fn(() => selectQuery),
                    upsert,
                };
            }),
        };
        (createClient as jest.Mock).mockResolvedValue(supabaseMock);

        const retrieve = jest.fn().mockResolvedValue(batchResponse);
        (getOpenAIClient as jest.Mock).mockReturnValue({
            batches: {
                retrieve,
            },
        });

        const status = await getBatchStatus(legacyId);

        expect('status' in status && status.status === 'in_progress').toBe(true);
        expect(retrieve).toHaveBeenCalledWith('batch_resolved');
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                openai_batch_id: 'batch_resolved',
            }),
            { onConflict: 'openai_batch_id' }
        );
    });
});
