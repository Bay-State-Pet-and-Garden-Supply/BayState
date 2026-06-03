import { createBatchContent } from '@/lib/consolidation/batch-service';
import { applyConsolidationResults } from '@/lib/consolidation/apply-service';
import { getConsolidationConfig } from '@/lib/consolidation/openai-client';
import { createAdminClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(),
}));

jest.mock('@/lib/consolidation/openai-client', () => ({
    getConsolidationConfig: jest.fn(),
    CONSOLIDATION_CONFIG: {
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        temperature: 0.1,
        completionWindow: '24h',
    },
}));

jest.mock('@/lib/consolidation/gemini-client', () => ({
    createGeminiClient: jest.fn(() => ({
        uploadFile: jest.fn(),
        createBatch: jest.fn(),
        getBatchStatus: jest.fn(),
        downloadFileText: jest.fn(),
        cancelBatch: jest.fn(),
        parseBatchOutput: jest.fn(),
    })),
}));

jest.mock('@/lib/consolidation/image-prep', () => ({
    prepareProductImages: jest.fn().mockResolvedValue({ imageParts: [], errors: [] }),
    uploadJsonlToGemini: jest.fn(),
    clearImageUploadCache: jest.fn(),
}));

jest.mock('@/lib/pipeline/cohorts', () => ({
    recohortProducts: jest.fn().mockResolvedValue(undefined),
}));

type PromptPayload = {
    upc: string;
    sources: Array<{
        source: string;
        trust: string;
        fields: Record<string, unknown>;
    }>;
};

const USER_PROMPT_PREFIX =
    'Consolidate this product into a ShopSite export-ready record using the provided source trust metadata and only source-supported values: ';

function extractUserPayload(content: string): PromptPayload {
    expect(content.startsWith(USER_PROMPT_PREFIX)).toBe(true);
    return JSON.parse(content.slice(USER_PROMPT_PREFIX.length)) as PromptPayload;
}

describe('consolidation batch service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getConsolidationConfig as jest.Mock).mockResolvedValue({
            model: 'gpt-4o-mini',
            maxTokens: 1024,
            temperature: 0.1,
            completionWindow: '24h',
            confidence_threshold: 0.7,
        });
    });

    it('createBatchContent keeps scalar/array enrichment fields and excludes urls/images', () => {
        const content = createBatchContent(
            [
                {
                    upc: 'UPC-1',
                    sources: {
                        ai_discovery: {
                        Name: 'KONG Air Dog Squeaker Tennis Ball',
                        Brand: 'KONG',
                        confidence: 0.88,
                        search_keywords: 'fetch toy, tennis ball',
                        is_taxable: true,
                        categories: ['Dog Toys', 'Fetch Toys'],
                        source_url: 'https://example.com/product',
                        images: ['https://example.com/image.jpg'],
                    },
                },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';
        const payload = extractUserPayload(userContent);
        const source = payload.sources.find((entry) => entry.source === 'ai_discovery');

        expect(source).toEqual(expect.objectContaining({ trust: 'standard' }));
        expect(source?.fields).toEqual(
            expect.objectContaining({
                confidence: 0.88,
                categories: ['Dog Toys', 'Fetch Toys'],
            })
        );
        expect(userContent).not.toContain('source_url');
        expect(userContent).not.toContain('"images"');
        expect(userContent).not.toContain('search_keywords');
        expect(userContent).not.toContain('is_taxable');
    });

    it('createBatchContent excludes manual-selection fields like special order', () => {
        const content = createBatchContent(
            [
                {
                    upc: 'UPC-MANUAL',
                    sources: {
                        distributor_a: {
                            title: 'Acme Deluxe Bird Seed 10 lb.',
                            brand: 'Acme',
                            is_special_order: true,
                            special_order: 'yes',
                            manual_selection: 'keep for admin review',
                            selected_images: ['https://cdn.example.com/keep-out.jpg'],
                        },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';
        const payload = extractUserPayload(userContent);
        const source = payload.sources.find((entry) => entry.source === 'distributor_a');

        expect(source?.fields).toEqual(
            expect.objectContaining({
                title: 'Acme Deluxe Bird Seed 10 lb.',
                brand: 'Acme',
            })
        );
        expect(userContent).not.toContain('is_special_order');
        expect(userContent).not.toContain('special_order');
        expect(userContent).not.toContain('manual_selection');
        expect(userContent).not.toContain('selected_images');
    });

    it('createBatchContent strips excluded nested keys from relevant object fields', () => {
        const content = createBatchContent(
            [
                {
                    upc: 'UPC-NESTED',
                    sources: {
                        distributor_b: {
                            title: 'Garden Bucket 5 gal.',
                            attributes: {
                                finish: 'Matte',
                                image_url: 'https://cdn.example.com/image.jpg',
                                manual_selection: 'requires admin pick',
                                taxable: true,
                                is_special_order: true,
                                nested: {
                                    Special_Order: 'yes',
                                    search_keywords: 'bucket, garden',
                                    color: 'Green',
                                },
                            },
                        },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';
        const payload = extractUserPayload(userContent);
        const source = payload.sources.find((entry) => entry.source === 'distributor_b');

        expect(source?.fields).toEqual(
            expect.objectContaining({
                attributes: {
                    finish: 'Matte',
                    nested: {
                        color: 'Green',
                    },
                },
            })
        );
        expect(userContent).not.toContain('image_url');
        expect(userContent).not.toContain('manual_selection');
        expect(userContent).not.toContain('special_order');
        expect(userContent).not.toContain('is_special_order');
        expect(userContent).not.toContain('taxable');
        expect(userContent).not.toContain('search_keywords');
    });



    it('createBatchContent sorts trusted sources ahead of marketplace sources', () => {
        const content = createBatchContent(
            [
                {
                    upc: '813347001025',
                    sources: {
                        amazon: {
                            brand: 'Brand: Bubbacare',
                            title: '20 Ounce Stud Muffins Tub',
                        },
                        bradley: {
                            brand: 'STUD MUFFINS',
                            title: 'STUD MUFFINS HORSE TREAT TUB',
                        },
                        shopsite_input: {
                            product_on_pages: ['Horse Treats'],
                        },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';
        const payload = extractUserPayload(userContent);

        expect(payload.sources.map((source) => `${source.source}:${source.trust}`)).toEqual([
            'shopsite_input:canonical',
            'bradley:trusted',
            'amazon:marketplace',
        ]);
    });

    it('createBatchContent keeps only the highest-value prompt sources', () => {
        const content = createBatchContent(
            [
                {
                    upc: 'UPC-SOURCE-CAP',
                    sources: {
                        shopsite_input: { brand: 'Acme', product_on_pages: ['Dog Toys'] },
                        manufacturer: { brand: 'Acme', title: 'Acme Tug Toy 2 ct.' },
                        distributor_a: { brand: 'Acme', description: 'Heavy duty rope toy.' },
                        distributor_b: { brand: 'Acme', category: 'Dog Toys' },
                        amazon: { brand: 'Brand: Acme', title: 'Marketplace title' },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';
        const payload = extractUserPayload(userContent);

        expect(payload.sources.map((source) => source.source)).toEqual([
            'shopsite_input',
            'manufacturer',
            'distributor_a',
            'distributor_b',
        ]);
        expect(payload.sources).toHaveLength(4);
    });

    it('createBatchContent trims oversized text fields and skips noisy fallback objects', () => {
        const content = createBatchContent(
            [
                {
                    upc: 'UPC-TRIM',
                    sources: {
                        distributor_a: {
                            title: 'Acme Deluxe Bird Seed 10 lb.',
                            description: 'A'.repeat(5000),
                            metadata_blob: {
                                irrelevant: 'A'.repeat(200),
                                extra: 'B'.repeat(200),
                            },
                        },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';
        const payload = extractUserPayload(userContent);
        const source = payload.sources.find((entry) => entry.source === 'distributor_a');

        expect(typeof source?.fields.description).toBe('string');
        expect((source?.fields.description as string).length).toBeLessThan(4020);
        expect(source?.fields.description).toMatch(/…$/);
        expect(source?.fields).not.toHaveProperty('metadata_blob');
    });

    it('applyConsolidationResults merges existing consolidated data and resolves brand ids', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: 'UPC-1' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: 'UPC-1',
                        consolidated: {
                            images: ['https://cdn.example.com/existing.jpg'],
                            stock_status: 'in_stock',
                            search_keywords: 'legacy keywords',
                            is_taxable: true,
                        },
                        sources: {
                            chewy: {
                                images: ['https://cdn.example.com/source.jpg'],
                            },
                        },
                        image_candidates: ['https://cdn.example.com/candidate.jpg'],
                        selected_images: [{ url: 'https://cdn.example.com/selected.jpg' }],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {
                    images: ['https://cdn.example.com/existing.jpg'],
                    stock_status: 'in_stock',
                    search_keywords: 'legacy keywords',
                    is_taxable: true,
                },
                updated_at: '2026-03-18T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-1', name: 'KONG' }],
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
                    return {
                        select: brandsSelect,
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const resultWithLegacyKeywordField = [
            {
                upc: 'UPC-1',
                name: 'KONG Air Dog Squeaker Tennis Ball 3 ct',
                brand: 'KONG',
                description: 'Fetch ball toy for dogs',
                long_description: 'A fetch-ready squeaker tennis ball for active dogs and repeated play sessions.',
                weight: '3',
                product_on_pages: 'Dog Toys|Dog Supplies Shop All',
                category: 'Dog',
                search_keywords: 'fetch toy, tennis ball',
                confidence_score: 0.94,
            },
        ] as unknown;

        const response = await applyConsolidationResults(
            resultWithLegacyKeywordField as Parameters<typeof applyConsolidationResults>[0]
        );

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'reviewing',
                confidence_score: 0.94,
                error_message: null,
                consolidated: expect.objectContaining({
                    core: expect.objectContaining({
                        brand_id: 'brand-uuid-1',
                        brand_name: 'KONG',
                        search_keywords: 'fetch toy, tennis ball',
                        stock_status: 'in_stock',
                    }),
                    media: expect.arrayContaining([
                        expect.objectContaining({ url: 'https://cdn.example.com/existing.jpg' })
                    ])
                }),
            })
        );
        expect(productsIngestionUpdateEq).toHaveBeenCalledWith('upc', 'UPC-1');
        expect(productsIngestionUpdateEq).toHaveBeenCalledWith('updated_at', '2026-03-18T00:00:00.000Z');

        const updatePayload = (productsIngestionUpdate as jest.Mock).mock.calls[0]?.[0] as {
            consolidated?: any;
        };
        expect(updatePayload.consolidated.core).toHaveProperty('search_keywords', 'fetch toy, tennis ball');
        expect(updatePayload.consolidated.core).not.toHaveProperty('is_taxable');
        expect(updatePayload.consolidated.core).not.toHaveProperty('taxable');
    });

    it('applyConsolidationResults creates a missing brand and writes the new brand id', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: 'UPC-NEW' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: 'UPC-NEW',
                        consolidated: {},
                        sources: {},
                        input: {},
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-03-19T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsInsertSingle = jest.fn().mockResolvedValue({
            data: { id: 'brand-uuid-new' },
            error: null,
        });
        const brandsInsertSelect = jest.fn().mockReturnValue({ single: brandsInsertSingle });
        const brandsInsert = jest.fn().mockReturnValue({ select: brandsInsertSelect });
        const brandsSelect = jest.fn().mockResolvedValue({
            data: [],
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
                    return {
                        select: brandsSelect,
                        insert: brandsInsert,
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults([
            {
                upc: 'UPC-NEW',
                name: 'Fresh Batch Chicken Recipe 12 lb.',
                brand: 'Fresh Batch',
                description: 'Premium dog food',
                search_keywords: 'dog food, chicken recipe, premium kibble',
                weight: '12',
                category: 'Dog',
                confidence_score: 0.92,
            },
        ]);

        expect(brandsInsert).toHaveBeenCalledWith({
            name: 'Fresh Batch',
            slug: 'fresh-batch',
        });
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'reviewing',
                confidence_score: 0.92,
                error_message: null,
                consolidated: expect.objectContaining({
                    core: expect.objectContaining({
                        brand_name: 'Fresh Batch',
                        brand_id: 'brand-uuid-new',
                    })
                }),
            })
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
    });

    it('applyConsolidationResults keeps model descriptions and falls back to input product_on_pages', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: 'UPC-PAGES' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: 'UPC-PAGES',
                        consolidated: {},
                        sources: {},
                        input: {
                            product_on_pages: ['Dog Food Dry', 'Dog Food Shop All'],
                        },
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-03-27T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-2', name: 'Acme' }],
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
                    return {
                        select: brandsSelect,
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults([
            {
                upc: 'UPC-PAGES',
                name: 'Acme Crunchy Bites 10 oz.',
                brand: 'Acme',
                description: 'Short shelf-ready description.',
                search_keywords: 'dog treats, crunchy bites, acme treats',
                category: 'Dog',
                confidence_score: 0.88,
            },
        ]);

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'reviewing',
                consolidated: expect.objectContaining({
                    core: expect.objectContaining({
                        name: 'Acme Crunchy Bites 10 oz.',
                        description: 'Short shelf-ready description.',
                        search_keywords: 'dog treats, crunchy bites, acme treats',
                        canonical_category_breadcrumb: 'Dog',
                    })
                }),
            })
        );
    });

    it('applyConsolidationResults leaves low-confidence outputs in canonical scraped status', async () => {
        (getConsolidationConfig as jest.Mock).mockResolvedValue({
            model: 'gpt-4o-mini',
            maxTokens: 1024,
            temperature: 0.1,
            completionWindow: '24h',
            confidence_threshold: 0.9,
        });

        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: '045663976866' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: '045663976866',
                        consolidated: {},
                        sources: {},
                        input: {},
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-03-27T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
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
                    return {
                        select: jest.fn().mockResolvedValue({ data: [], error: null }),
                    };
                }
                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults([
            {
                upc: '045663976866',
                name: 'Litter Box System Cat Pads 11 X 17 10 ct.',
                brand: 'Four Paws',
                description: 'Odor control cat pads.',
                search_keywords: 'cat pads, litter box pads, odor control',
                category: 'Cat Supplies',
                confidence_score: 0.65,
            },
        ]);

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'processed',
                error_message: expect.stringContaining('below threshold'),
            })
        );
        expect((productsIngestionUpdate as jest.Mock).mock.calls[0]?.[0]).not.toHaveProperty('pipeline_status_new');
    });

    it('applyConsolidationResults rejects higher-trust brand conflicts', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: '813347001025' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: '813347001025',
                        consolidated: {},
                        sources: {
                            amazon: {
                                brand: 'Brand: Bubbacare',
                                title: '20 Ounce Stud Muffins Tub',
                            },
                            bradley: {
                                brand: 'STUD MUFFINS',
                                title: 'STUD MUFFINS HORSE TREAT TUB',
                            },
                        },
                        input: {},
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-03-27T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
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
                    return {
                        select: jest.fn().mockResolvedValue({ data: [], error: null }),
                        insert: jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { id: 'brand-bubbacare' },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        await applyConsolidationResults([
            {
                upc: '813347001025',
                name: 'Stud Muffins Horse Treats 20 oz.',
                brand: 'Bubbacare',
                description: 'Handmade horse treats with flax seed.',
                search_keywords: 'horse treats, flax seed treats, stud muffins',
                category: 'Horse Feed & Treats',
                confidence_score: 0.95,
            },
        ]);

        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'reviewing',
            })
        );
    });

    it('applyConsolidationResults unpacks packaging_facets and prioritizes them over post-enrichment', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: 'UPC-VLM-FACETS' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: 'UPC-VLM-FACETS',
                        consolidated: {},
                        sources: {
                            chewy: {
                                title: 'KONG Dog Toy Large Red',
                            },
                        },
                        input: {},
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-05-23T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-kong', name: 'KONG' }],
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
                    return {
                        select: brandsSelect,
                    };
                }
                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults([
            {
                upc: 'UPC-VLM-FACETS',
                name: 'KONG Squeaker Ball Red Large',
                brand: 'KONG',
                description: 'KONG ball toy',
                search_keywords: 'kong, ball, squeaker',
                category: 'Dog > Toys > Interactive Toys',
                confidence_score: 0.95,
                packaging_facets: {
                    flavor: 'Bacon Flavor',
                    life_stage: 'Senior',
                    toy_type: 'Ball',
                },
            },
        ]);

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'reviewing',
                consolidated: expect.objectContaining({
                    core: expect.objectContaining({
                        name: 'KONG Squeaker Ball Red Large',
                        brand_name: 'KONG',
                        brand_id: 'brand-uuid-kong',
                        canonical_category_breadcrumb: 'Dog > Toys > Interactive Toys',
                    }),
                    facets: expect.arrayContaining([
                        expect.objectContaining({ definition_slug: 'flavor', value: 'Bacon Flavor' }),
                        expect.objectContaining({ definition_slug: 'life-stage', value: 'Senior' }),
                        expect.objectContaining({ definition_slug: 'toy-type', value: 'Ball' }),
                        expect.objectContaining({ definition_slug: 'animal-type', value: 'Dog' }),
                        expect.objectContaining({ definition_slug: 'has-squeaker', value: 'Yes' }),
                    ])
                }),
            })
        );
    });

    it('applyConsolidationResults allows duplicate finalized names with warnings', async () => {
        const productsIngestionUpdateMaybeSingle = jest
            .fn()
            .mockResolvedValueOnce({ data: { upc: '095668302580' }, error: null })
            .mockResolvedValueOnce({ data: { upc: '095668929473' }, error: null });
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: '095668302580',
                        consolidated: {},
                        sources: {
                            bradley: { brand: 'MANNA PRO', title: 'BITE-SIZE NUGGETS HORSE TREATS' },
                        },
                        input: { name: 'MANNA PRO NUGGETS ALF/MOL 4LB' },
                        image_candidates: [],
                        selected_images: [],
                    },
                    {
                        upc: '095668929473',
                        consolidated: {},
                        sources: {
                            bradley: { brand: 'MANNA PRO', title: 'BITE-SIZE NUGGETS HORSE TREATS' },
                        },
                        input: { name: 'MANNA PRO NUGGETS CARROT/SPICE 4LB' },
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest
            .fn()
            .mockResolvedValueOnce({
                data: { consolidated: {}, updated_at: '2026-03-27T00:00:00.000Z' },
                error: null,
            })
            .mockResolvedValueOnce({
                data: { consolidated: {}, updated_at: '2026-03-27T00:00:00.000Z' },
                error: null,
            });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-1', name: 'Manna Pro' }],
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
                    return {
                        select: brandsSelect,
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const result = await applyConsolidationResults([
            {
                upc: '095668302580',
                name: 'Bite-size Nuggets Horse Treats 4 lb.',
                brand: 'Manna Pro',
                description: 'Pocket-size horse treats with alfalfa and molasses flavor.',
                search_keywords: 'horse treats, nugget treats, alfalfa molasses',
                category: 'Horse Feed & Treats',
                confidence_score: 0.95,
            },
            {
                upc: '095668929473',
                name: 'Bite-size Nuggets Horse Treats 4 lb.',
                brand: 'Manna Pro',
                description: 'Pocket-size horse treats with carrot and spice flavor.',
                search_keywords: 'horse treats, carrot spice treats, nugget treats',
                category: 'Horse Feed & Treats',
                confidence_score: 0.95,
            },
        ]);

        // Duplicate names are allowed with warnings instead of rejection
        const appliedResult = result as any;
        expect(appliedResult.status).toBe('applied');
        expect(appliedResult.success_count).toBe(2);
        expect(appliedResult.error_count).toBe(0);
        expect(appliedResult.warnings?.length).toBeGreaterThan(0);
        expect(appliedResult.warnings?.[0]).toContain('duplicate name');

        // Both products should be finalized (not rejected)
        expect(productsIngestionUpdate).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                pipeline_status: 'reviewing',
                error_message: null,
            })
        );
        expect(productsIngestionUpdate).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                pipeline_status: 'reviewing',
                error_message: null,
            })
        );
    });

    it('applyConsolidationResults fills missing core fields from source fallbacks', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { upc: 'UPC-FILL' },
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

        const productsIngestionSelectByUpcIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        upc: 'UPC-FILL',
                        consolidated: {},
                        sources: {
                            enriched: {
                                extracted: {
                                    core: {
                                        name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe',
                                        brand_name: '360 Pet Nutrition',
                                        description: 'Made with high-quality ingredients. Freeze-dried for convenience. No fillers or artificial preservatives.',
                                        weight_lbs: 0.3125,
                                        search_keywords: 'dog food, freeze-dried, chicken, grain-free',
                                    },
                                },
                                active_source_slug: 'amazon',
                            },
                        },
                        input: {},
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-05-29T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns.startsWith('upc, consolidated, sources, input, image_candidates, selected_images')) {
                return productsIngestionSelectByUpcIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-360', name: '360 Pet Nutrition' }],
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
                    return {
                        select: brandsSelect,
                    };
                }
                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        // LLM result is missing description, search_keywords, and weight
        // They should be filled from source fallbacks
        const response = await applyConsolidationResults([
            {
                upc: 'UPC-FILL',
                name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe',
                brand: '360 Pet Nutrition',
                description: '',
                search_keywords: '',
                category: 'Dog > Food',
                confidence_score: 0.90,
            },
        ]);

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'reviewing',
                error_message: null,
                consolidated: expect.objectContaining({
                    core: expect.objectContaining({
                        brand_name: '360 Pet Nutrition',
                        name: '360 Pet Nutrition Freeze-Dried Raw Dog Food – Chicken Recipe',
                        description: 'Made with high-quality ingredients. Freeze-dried for convenience. No fillers or artificial preservatives.',
                        search_keywords: 'dog food, freeze-dried, chicken, grain-free',
                    }),
                    evidence: expect.objectContaining({
                        field_sources: expect.objectContaining({
                            description: 'source_fallback:description',
                            search_keywords: 'source_fallback:search_keywords',
                        }),
                    }),
                }),
            })
        );

        // Protected fields should NOT be populated with truthy values from source fallbacks
        const updatePayload = (productsIngestionUpdate as jest.Mock).mock.calls[0]?.[0] as { consolidated?: any };
        expect(updatePayload.consolidated.core.price).toBeFalsy();
        expect(updatePayload.consolidated.core.stock_status).toBeFalsy();
    });
});
